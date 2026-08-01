'use client';

import { useState, useCallback, Suspense, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DataPreview, FastaPreview } from '@/components/DataPreview';
import { step8FilterNeoantigens, neoantigensToCSV, mergeAllToFinalCSV } from '@/lib/step8-filter-neoantigens';
import { IEDBResult } from '@/lib/step5-7-epitopes';

interface StepState {
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
}
interface StepData {
  columns?: string[];
  rows?: string[][];
  csv?: string;
  fasta?: string;
  json?: unknown;
}
interface Stats {
  totalRawRows: number;
  totalMissense: number;
  uniquePositions: number;
  hotspotCount: number;
  totalSamples: number;
}
interface Mutation {
  Position: number;
  Ref_AA: string;
  Alt_AA: string;
  Patient_Count: number;
  MAF: number;
  is_hotspot: boolean;
}

const PHASES = [
  { name: 'Data Preparation', steps: [1, 2, 3, 4], color: 'violet' },
  { name: 'Epitope Prediction', steps: [5, 6, 7, 8], color: 'blue' },
  { name: 'Filtering & Properties', steps: [9, 10, 11, 12], color: 'emerald' },
  { name: 'Analysis & Export', steps: [13, 14, 15], color: 'amber' },
];

const STEP_NAMES: Record<number, string> = {
  1: 'Parse COSMIC CSV',
  2: 'Mutation Frequency',
  3: 'Fetch Reference (UniProt/Ensembl)',
  4: 'MSA Alignment (MAFFT)',
  5: 'MHC-I Binding (NetMHCpan)',
  6: 'MHC-II Binding (NetMHCpan)',
  7: 'B-cell Epitopes (BepiPred)',
  8: 'Neoantigen Split',
  9: 'Pre-filter (IC50 + Immunogenicity)',
  10: 'Antigenicity (VaxiJen)',
  11: 'Allergenicity (AllerTOP)',
  12: 'Toxicity (ToxinPred)',
  13: 'Physicochemical (ProtParam)',
  14: 'Population Coverage',
  15: 'Consolidate & Export',
};

function downloadFile(content: string, filename: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBase64Png(b64: string, filename: string) {
  const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <PipelineInner />
    </Suspense>
  );
}

function PipelineInner() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [geneName, setGeneName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // Data source mode: 'upload' or 'cbioportal'
  const [dataSource, setDataSource] = useState<'upload' | 'cbioportal'>('upload');
  const [cancerType, setCancerType] = useState('breast');
  const [fetchingCosmic, setFetchingCosmic] = useState(false);
  const [cosmicCsv, setCosmicCsv] = useState('');

  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const [stepData, setStepData] = useState<Record<number, StepData>>({});
  const [step1Stats, setStep1Stats] = useState<Stats | null>(null);
  const [topMutations, setTopMutations] = useState<Mutation[]>([]);

  const [refSeq, setRefSeq] = useState('');
  const [mutSeq, setMutSeq] = useState('');
  const [msaAlignment, setMsaAlignment] = useState('');
  const [msaPng, setMsaPng] = useState('');

  const [mhciCount, setMhciCount] = useState(0);
  const [mhciiCount, setMhciiCount] = useState(0);
  const [neoantigensI, setNeoantigensI] = useState(0);
  const [neoantigensII, setNeoantigensII] = useState(0);
  const [msaLength, setMsaLength] = useState(0);

  // Store full IEDB results for step 8 and final merge
  const [mhciCanonData, setMhciCanonData] = useState<IEDBResult | null>(null);
  const [mhciMutData, setMhciMutData] = useState<IEDBResult | null>(null);
  const [mhciiCanonData, setMhciiCanonData] = useState<IEDBResult | null>(null);
  const [mhciiMutData, setMhciiMutData] = useState<IEDBResult | null>(null);
  const [filterResultRef, setFilterResultRef] = useState<Record<string, unknown> | null>(null);

  // Steps 9-14 results
  const [vaxijenResults, setVaxijenResults] = useState<{ sequence: string; score: number | null; prediction: string | null }[]>([]);
  const [allertopResults, setAllertopResults] = useState<{ sequence: string; prediction: string | null; similar_protein?: string | null }[]>([]);
  const [toxinpredResults, setToxinpredResults] = useState<{ sequence: string; prediction: string | null }[]>([]);
  const [protparamData, setProtparamData] = useState<{ columns: string[]; rows: string[][] } | null>(null);
  const [immunogenicityRows, setImmunogenicityRows] = useState<Record<string, unknown>[]>([]);
  const [finalCsvI, setFinalCsvI] = useState('');
  const [finalCsvII, setFinalCsvII] = useState('');
  const [finalCsvBcell, setFinalCsvBcell] = useState('');
  const [popCoverageData, setPopCoverageData] = useState<any>(null);
  const [immThreshold, setImmThreshold] = useState(0);
  const [ic50Threshold, setIc50Threshold] = useState(500);
  const [bcellCount, setBcellCount] = useState(0);

  const stopController = useRef<AbortController | null>(null);
  const [savedStates, setSavedStates] = useState<{ gene: string; lastStep: number; savedAt: string }[]>([]);
  const [resuming, setResuming] = useState(false);

  const checkSavedState = useCallback(async () => {
    try {
      const r = await fetch('/api/pipeline-state');
      const data = await r.json();
      if (data.states?.length > 0) setSavedStates(data.states);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { checkSavedState(); }, [checkSavedState]);

  const handleDeleteState = useCallback(async (gene: string) => {
    try {
      await fetch(`/api/pipeline-state?gene=${encodeURIComponent(gene)}`, { method: 'DELETE' });
      setSavedStates(prev => prev.filter(s => s.gene !== gene));
    } catch { /* ignore */ }
  }, []);

  const updateStep = useCallback((step: number, status: StepState['status'], message?: string) => {
    setSteps(prev => ({ ...prev, [step]: { status, message } }));
  }, []);

  const setStepResult = useCallback((step: number, data: StepData) => {
    setStepData(prev => ({ ...prev, [step]: data }));
  }, []);

  const savePipelineState = useCallback(async (gene: string, step: number, data: Record<string, StepData>, extra: Record<string, unknown>) => {
    try {
      const serializableStepData: Record<string, { csv?: string; fasta?: string; json?: unknown; columns?: string[]; rows?: string[][] }> = {};
      for (const [k, v] of Object.entries(data)) {
        if (v.csv || v.fasta || v.json || v.columns) {
          serializableStepData[k] = { csv: v.csv, fasta: v.fasta, json: v.json, columns: v.columns, rows: v.rows?.slice(0, 5) };
        }
      }
      // Save full IEDB data for resume (steps 5-8)
      const fullIedb: Record<string, { columns: string[]; rows: string[][] }> = {};
      if (extra.mhciCanon) fullIedb['mhciCanon'] = extra.mhciCanon as { columns: string[]; rows: string[][] };
      if (extra.mhciMut) fullIedb['mhciMut'] = extra.mhciMut as { columns: string[]; rows: string[][] };
      if (extra.mhciiCanon) fullIedb['mhciiCanon'] = extra.mhciiCanon as { columns: string[]; rows: string[][] };
      if (extra.mhciiMut) fullIedb['mhciiMut'] = extra.mhciiMut as { columns: string[]; rows: string[][] };
      if (extra.filterResult) fullIedb['filterResult'] = extra.filterResult as { columns: string[]; rows: string[][] };
      // Remove fullIedb data from extra before sending (not JSON-serializable as extra)
      const cleanExtra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(extra)) {
        if (!['mhciCanon', 'mhciMut', 'mhciiCanon', 'mhciiMut', 'filterResult'].includes(k)) cleanExtra[k] = v;
      }
      await fetch('/api/pipeline-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geneName: gene, lastCompletedStep: step, stepData: serializableStepData, fullIedb, ...cleanExtra }),
      });
    } catch { /* ignore save errors */ }
  }, []);

  const handleStopPipeline = useCallback(() => {
    if (stopController.current) {
      stopController.current.abort();
      stopController.current = null;
    }
  }, []);

  const handleResume = useCallback(async (gene: string) => {
    try {
      const r = await fetch(`/api/pipeline-state?gene=${encodeURIComponent(gene)}`);
      const data = await r.json();
      if (!data.state) { setError('No saved state found'); return; }

      const state = data.state;
      setGeneName(state.geneName || gene);
      if (state.cosmicCsv) setCosmicCsv(state.cosmicCsv);
      if (state.cancerType) setCancerType(state.cancerType);
      if (state.refSeq) setRefSeq(state.refSeq);
      if (state.mutSeq) setMutSeq(state.mutSeq);
      if (state.msaAlignment) setMsaAlignment(state.msaAlignment);
      if (state.msaPng) setMsaPng(state.msaPng);
      if (state.steps) setSteps(state.steps);
      if (state.stepData) setStepData(state.stepData);
      // Restore full IEDB data for resume
      if (state.fullIedb) {
        const fi = state.fullIedb;
        if (fi.mhciCanon) setMhciCanonData(fi.mhciCanon);
        if (fi.mhciMut) setMhciMutData(fi.mhciMut);
        if (fi.mhciiCanon) setMhciiCanonData(fi.mhciiCanon);
        if (fi.mhciiMut) setMhciiMutData(fi.mhciiMut);
        if (fi.filterResult) setFilterResultRef(fi.filterResult);
      }
      setResuming(true);

      setSteps(prev => {
        const updated = { ...prev };
        for (const [k, v] of Object.entries(updated)) {
          const stepNum = parseInt(k);
          if (stepNum > (state.lastCompletedStep || 0) && v.status !== 'error') {
            updated[stepNum] = { status: 'pending' };
          }
        }
        return updated;
      });
    } catch (e) {
      setError(`Resume failed: ${(e as Error).message}`);
    }
  }, []);

  const pollIEDB = async (resultId: string, stepNum: number, stepName: string): Promise<StepData> => {
    const maxAttempts = 300;
    let delay = 5000;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, delay));
      updateStep(stepNum, 'running', `${stepName} — polling (${Math.round((i + 1) * delay / 1000)}s)...`);
      try {
        const r = await fetch(`/api/epitopes/poll?resultId=${resultId}`);
        const data = await r.json();
        if (data.status === 'done') return { columns: data.columns || [], rows: data.rows || [] };
        if (data.status === 'failed') throw new Error(data.error || 'IEDB job failed');
        delay = Math.min(delay + 1000, 15000);
      } catch (e) {
        if (i === maxAttempts - 1) throw e;
        delay = Math.min(delay * 1.5, 20000);
      }
    }
    throw new Error('IEDB polling timed out');
  };

  const runIEDBStep = async (
    gene: string, canonical: string, mutated: string,
    step: number, label: string, stepNum: number, stepName: string
  ): Promise<StepData> => {
    updateStep(stepNum, 'running', `Submitting ${stepName}...`);
    const r = await fetch('/api/epitopes/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geneName: gene, canonicalSeq: canonical, mutatedSeq: mutated, step, label }),
    });
    if (!r.ok) { const err = await r.json(); throw new Error(err.error || `Step ${stepNum} submit failed`); }
    const { resultId } = await r.json();
    updateStep(stepNum, 'running', `Job submitted, polling...`);
    return pollIEDB(resultId, stepNum, stepName);
  };

  const handleRunPipeline = async () => {
    if (!geneName.trim()) { setError('Please enter a gene name'); return; }
    if (!resuming && !file && !cosmicCsv) { setError('Please select a CSV file or fetch from cBioPortal'); return; }

    setLoading(true);
    setError('');
    if (!resuming) {
      setStep1Stats(null);
      setTopMutations([]);
      setRefSeq('');
      setMutSeq('');
      setMsaAlignment('');
      setMsaPng('');
      setMhciCount(0);
      setMhciiCount(0);
      setNeoantigensI(0);
      setNeoantigensII(0);
      setMsaLength(0);
      setStepData({});
      setMhciCanonData(null);
      setMhciMutData(null);
      setMhciiCanonData(null);
      setMhciiMutData(null);
      setVaxijenResults([]);
      setAllertopResults([]);
      setToxinpredResults([]);
      setProtparamData(null);
      setImmunogenicityRows([]);
      setFinalCsvI('');
      setFinalCsvII('');
      setFinalCsvBcell('');
      setPopCoverageData(null);
      setBcellCount(0);

      const resetSteps: Record<number, StepState> = {};
      for (let i = 1; i <= 15; i++) resetSteps[i] = { status: 'pending' };
      setSteps(resetSteps);
    }

    const gene = geneName.trim().toUpperCase();
    const geneLower = gene.toLowerCase();

    let mhciCanon: IEDBResult = { success: false, columns: [], rows: [] };
    let mhciMut: IEDBResult = { success: false, columns: [], rows: [] };
    let mhciiCanon: IEDBResult = { success: false, columns: [], rows: [] };
    let mhciiMut: IEDBResult = { success: false, columns: [], rows: [] };
    let filterResult: ReturnType<typeof step8FilterNeoantigens> | null = null;

    // Determine resume start step
    const pendingStep = resuming && steps ? Math.min(...Object.entries(steps).filter(([_, s]) => s.status === 'pending').map(([k]) => parseInt(k)).filter(n => !isNaN(n))) : 1;
    const skipToStep = resuming ? pendingStep : 1;
    if (resuming) console.log(`Resuming from step ${skipToStep}`);

    try {
      let data3: { reference: { sequence: string; source: string; fasta: string; length: number }; mutated: { sequence: string } };

      if (skipToStep <= 4) {
        // ─── Steps 1-4: Run from scratch ───
        let processRes: Response;
      if (cosmicCsv) {
        // cBioPortal CSV mode: send CSV content directly
        updateStep(1, 'running');
        updateStep(2, 'running');
        processRes = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geneName: gene, csvContent: cosmicCsv }),
        });
      } else if (file) {
        // File upload mode
        updateStep(1, 'running');
        updateStep(2, 'running');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('geneName', gene);
        processRes = await fetch('/api/process', { method: 'POST', body: formData });
      } else {
        throw new Error('No file or cBioPortal data');
      }
      const data1 = await processRes.json();
      if (!processRes.ok) throw new Error(data1.error);
      updateStep(1, 'completed');
      updateStep(2, 'completed');
      setStep1Stats(data1.stats);
      setTopMutations(data1.topMutations);
      setStepResult(1, { csv: data1.outputs.missense_simple });
      setStepResult(2, { csv: data1.outputs.mutation_summary });
      await savePipelineState(gene, 2, stepData, { cosmicCsv: cosmicCsv || '', cancerType });

      // ─── Step 3: Reference ───
      updateStep(3, 'running', 'Fetching reference...');
      const res3 = await fetch('/api/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geneName: gene, missenseCSV: data1.outputs.missense_simple }),
      });
      const res3Data = await res3.json();
      if (!res3.ok) throw new Error(res3Data.error);
      data3 = res3Data;
      updateStep(3, 'completed', `${data3.reference.length} aa from ${data3.reference.source}`);
      setRefSeq(data3.reference.sequence);
      setMutSeq(data3.mutated.sequence);
      setStepResult(3, { fasta: data3.reference.fasta });

      // ─── Step 4: MSA ───
      updateStep(4, 'running', 'Submitting to EBI MAFFT...');
      const resMsaSubmit = await fetch('/api/msa/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequences: [
            { header: `ref_${gene}`, sequence: data3.reference.sequence },
            { header: `${gene}_mutated`, sequence: data3.mutated.sequence },
          ],
        }),
      });
      const msaSubmit = await resMsaSubmit.json();
      if (!resMsaSubmit.ok) throw new Error(msaSubmit.error);
      const msaJobId = msaSubmit.jobId;
      let msaDone = false;
      let msaResult: { alignment: string; stats: { sequences: number; length: number } } | null = null;
      for (let i = 0; i < 60 && !msaDone; i++) {
        await new Promise(r => setTimeout(r, 5000));
        updateStep(4, 'running', `MAFFT aligning (${(i + 1) * 5}s)...`);
        const msaPoll = await fetch(`/api/msa/poll?jobId=${msaJobId}`);
        const msaData = await msaPoll.json();
        if (msaData.status === 'done') {
          msaResult = msaData;
          updateStep(4, 'completed', `${msaData.stats.sequences} seqs, ${msaData.stats.length} cols`);
          setMsaLength(msaData.stats.length);
          setMsaAlignment(msaData.alignment);
          setStepResult(4, { fasta: msaData.alignment });
          msaDone = true;
        } else if (msaData.status === 'failed') {
          throw new Error('MSA failed');
        }
      }
      if (!msaDone || !msaResult) throw new Error('MSA timed out');

      // Generate MSA PNG
      try {
        const msaPngRes = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/msa/png`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fasta: msaResult.alignment, gene_name: gene }),
        });
        const msaPngData = await msaPngRes.json();
        if (msaPngData.png) setMsaPng(msaPngData.png);
      } catch { /* PNG optional */ }
      await savePipelineState(gene, 4, stepData, {
        refSeq: data3.reference.sequence,
        mutSeq: data3.mutated.sequence,
        msaAlignment: msaResult.alignment,
      });
      } else {
        // Resume: reconstruct data3 from saved state
        data3 = {
          reference: { sequence: refSeq, source: 'saved', fasta: `>saved\n${refSeq}`, length: refSeq.length },
          mutated: { sequence: mutSeq },
        };
        // Mark steps 1-4 as completed
        for (let i = 1; i <= 4; i++) updateStep(i, 'completed', 'skipped (resume)');
        // Restore full IEDB data from state
        if (mhciCanonData) mhciCanon = mhciCanonData;
        if (mhciMutData) mhciMut = mhciMutData;
        if (mhciiCanonData) mhciiCanon = mhciiCanonData;
        if (mhciiMutData) mhciiMut = mhciiMutData;
        if (filterResultRef) filterResult = filterResultRef as unknown as ReturnType<typeof step8FilterNeoantigens>;
      }

      let bcellMutResult: IEDBResult = { success: false, columns: [], rows: [] };

      // ─── Step 5: MHC-I (chunked — handles large sequences) ───
      if (skipToStep <= 5) {
      updateStep(5, 'running', 'MHC-I (chunked, may take a while for large sequences)...');
      const mhciChunked = await fetch('/api/epitopes/chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geneName: gene, canonicalSeq: data3.reference.sequence, mutatedSeq: data3.mutated.sequence, step: 5 }),
      });
      const mhciChunkedData = await mhciChunked.json();
      if (!mhciChunked.ok || mhciChunkedData.error) throw new Error(mhciChunkedData.error || 'MHC-I chunked failed');
      mhciCanon = { success: true, columns: mhciChunkedData.canonical.columns, rows: mhciChunkedData.canonical.rows };
      mhciMut = { success: true, columns: mhciChunkedData.mutated.columns, rows: mhciChunkedData.mutated.rows };
      setMhciCanonData(mhciCanon);
      setMhciMutData(mhciMut);
      updateStep(5, 'completed', `${mhciMut.rows.length} mutated epitopes`);
      setMhciCount(mhciMut.rows.length);
      setStepResult(5, { columns: mhciMut.columns, rows: mhciMut.rows.slice(0, 5) });
      await savePipelineState(gene, 5, stepData, { refSeq: data3.reference.sequence, mutSeq: data3.mutated.sequence, mhciCanon, mhciMut, mhciiCanon, mhciiMut });
      } else { updateStep(5, 'completed', 'skipped (resume)'); }

      // ─── Step 6: MHC-II (chunked) ───
      if (skipToStep <= 6) {
      updateStep(6, 'running', 'MHC-II (chunked, may take a while for large sequences)...');
      const mhciiChunked = await fetch('/api/epitopes/chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geneName: gene, canonicalSeq: data3.reference.sequence, mutatedSeq: data3.mutated.sequence, step: 6 }),
      });
      const mhciiChunkedData = await mhciiChunked.json();
      if (!mhciiChunked.ok || mhciiChunkedData.error) throw new Error(mhciiChunkedData.error || 'MHC-II chunked failed');
      mhciiCanon = { success: true, columns: mhciiChunkedData.canonical.columns, rows: mhciiChunkedData.canonical.rows };
      mhciiMut = { success: true, columns: mhciiChunkedData.mutated.columns, rows: mhciiChunkedData.mutated.rows };
      setMhciiCanonData(mhciiCanon);
      setMhciiMutData(mhciiMut);
      updateStep(6, 'completed', `${mhciiMut.rows.length} mutated epitopes`);
      setMhciiCount(mhciiMut.rows.length);
      setStepResult(6, { columns: mhciiMut.columns, rows: mhciiMut.rows.slice(0, 5) });
      } else { updateStep(6, 'completed', 'skipped (resume)'); }

      // ─── Step 7: B-cell (chunked) ───
      if (skipToStep <= 7) {
      updateStep(7, 'running', 'B-cell (chunked, may take a while for large sequences)...');
      const bcellChunked = await fetch('/api/epitopes/chunked', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geneName: gene, canonicalSeq: data3.reference.sequence, mutatedSeq: data3.mutated.sequence, step: 7 }),
      });
      const bcellChunkedData = await bcellChunked.json();
      if (!bcellChunked.ok || bcellChunkedData.error) throw new Error(bcellChunkedData.error || 'B-cell chunked failed');
      const bcellCanonResult = { success: true, columns: bcellChunkedData.canonical.columns, rows: bcellChunkedData.canonical.rows } as IEDBResult;
      bcellMutResult = { success: true, columns: bcellChunkedData.mutated.columns, rows: bcellChunkedData.mutated.rows } as IEDBResult;
      updateStep(7, 'completed');
      setStepResult(7, { columns: bcellMutResult.columns, rows: bcellMutResult.rows.slice(0, 5) });
      await savePipelineState(gene, 7, stepData, { refSeq: data3.reference.sequence, mutSeq: data3.mutated.sequence, mhciCanon, mhciMut, mhciiCanon, mhciiMut });
      } else { updateStep(7, 'completed', 'skipped (resume)'); }

      let bcellFiltered: string[] = [];
      let bcellRowsFiltered: string[][] = [];

      // ─── Step 8: Neoantigen Filtering (3 sets: MHC-I, MHC-II, B-cell) ───
      if (skipToStep <= 8) {
      updateStep(8, 'running', 'Filtering neoantigens...');
      filterResult = step8FilterNeoantigens(mhciCanon, mhciMut, mhciiCanon, mhciiMut);
      const mhcICsv = neoantigensToCSV(filterResult.mhcI.columns, filterResult.mhcI.rows);
      const mhcIICsv = neoantigensToCSV(filterResult.mhcII.columns, filterResult.mhcII.rows);

      // Extract B-cell peptides (10-25 aa only)
      const bcellPepIdx = bcellMutResult.columns?.indexOf('peptide') ?? -1;
      const bcellSeqIdx = bcellMutResult.columns?.indexOf('sequence') ?? bcellPepIdx;
      if (bcellMutResult.rows && bcellMutResult.rows.length > 0) {
        const seenB = new Set<string>();
        for (const row of bcellMutResult.rows) {
          const pep = row[bcellPepIdx] || row[bcellSeqIdx] || '';
          if (pep && pep.length >= 10 && pep.length <= 25 && !seenB.has(pep)) {
            seenB.add(pep);
            bcellFiltered.push(pep);
            bcellRowsFiltered.push(row);
          }
        }
      }
      setBcellCount(bcellFiltered.length);
      updateStep(8, 'completed', `${filterResult.mhcI.stats.neoantigensFinal} MHC-I + ${filterResult.mhcII.stats.neoantigensFinal} MHC-II + ${bcellFiltered.length} B-cell`);
      setNeoantigensI(filterResult.mhcI.stats.neoantigensFinal);
      setNeoantigensII(filterResult.mhcII.stats.neoantigensFinal);
      setStepResult(8, { columns: filterResult.mhcI.columns, rows: filterResult.mhcI.rows.slice(0, 50), csv: mhcICsv });

      // Store full data for final merge
      setMhciMutData({ success: true, columns: filterResult.mhcI.columns, rows: filterResult.mhcI.rows });
      setMhciiMutData({ success: true, columns: filterResult.mhcII.columns, rows: filterResult.mhcII.rows });
      } else { updateStep(8, 'completed', 'skipped (resume)'); }
      if (!filterResult) throw new Error('No filter results available');

      // ─── Extract unique peptides from ALL 3 sets ───
      const pepIdx = filterResult.mhcI.columns.indexOf('peptide');
      const peptideSet = new Set<string>();
      const peptides: string[] = [];

      // MHC-I peptides
      if (pepIdx >= 0) {
        for (const row of filterResult.mhcI.rows) {
          const pep = row[pepIdx];
          if (pep && !peptideSet.has(pep)) { peptideSet.add(pep); peptides.push(pep); }
        }
      }
      // MHC-II peptides
      const pepIdx2 = filterResult.mhcII.columns.indexOf('peptide');
      if (pepIdx2 >= 0) {
        for (const row of filterResult.mhcII.rows) {
          const pep = row[pepIdx2];
          if (pep && !peptideSet.has(pep)) { peptideSet.add(pep); peptides.push(pep); }
        }
      }
      // B-cell peptides
      for (const pep of bcellFiltered) {
        if (!peptideSet.has(pep)) { peptideSet.add(pep); peptides.push(pep); }
      }
      if (peptides.length === 0) throw new Error('No peptides to analyze');

      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

      // ─── Step 9: Pre-filter by IC50 + Immunogenicity (from IEDB data) ───
      updateStep(9, 'running', `Pre-filtering ${peptides.length} peptides by IC50 + immunogenicity...`);

      // Extract immunogenicity scores inline from IEDB results
      const immColumns = ['peptide', 'allele', 'score', 'proteasome_score', 'tap_score', 'mhc_score', 'processing_score', 'total_score', 'immunogenicity_class'];
      const immRows: string[][] = [];
      const immMap = new Map<string, Record<string, unknown>>();
      const ic50Map = new Map<string, number>();

      // Helper to find a column by multiple possible names
      const findCol = (cols: string[], ...names: string[]) => {
        for (const n of names) { const i = cols.indexOf(n); if (i >= 0) return i; }
        return -1;
      };

      // Build immunogenicity + IC50 maps from MHC-I
      if (filterResult && filterResult.mhcI.rows.length > 0) {
        const cols = filterResult.mhcI.columns;
        const pepIdxI = findCol(cols, 'peptide');
        const alleleIdx = findCol(cols, 'allele');
        const scoreIdx = findCol(cols, 'score', 'immunogenicity_score', 'imm_score');
        const protoIdx = findCol(cols, 'proteasome_score');
        const tapIdx = findCol(cols, 'tap_score');
        const mhcIdx = findCol(cols, 'mhc_score');
        const procIdx = findCol(cols, 'processing_score');
        const totalIdx = findCol(cols, 'total_score');
        const ic50ColIdx = findCol(cols, 'netmhcpan_ba_ic50', 'ic50', 'netmhcpan_ba');

        console.log('MHC-I columns:', cols.join(', '));
        console.log(`scoreIdx=${scoreIdx} ic50ColIdx=${ic50ColIdx} pepIdxI=${pepIdxI}`);

        for (const row of filterResult.mhcI.rows) {
          const pep = row[pepIdxI] ?? '';
          if (!pep) continue;
          const scoreVal = scoreIdx >= 0 ? parseFloat(row[scoreIdx]) : NaN;
          let immClass = 'Unknown';
          if (!isNaN(scoreVal)) {
            if (scoreVal >= immThreshold + 0.03) immClass = 'High';
            else if (scoreVal >= immThreshold) immClass = 'Medium';
            else immClass = 'Low';
          }
          immRows.push([pep, row[alleleIdx] ?? '', row[scoreIdx] ?? '', row[protoIdx] ?? '', row[tapIdx] ?? '', row[mhcIdx] ?? '', row[procIdx] ?? '', row[totalIdx] ?? '', immClass]);
          if (!immMap.has(pep)) immMap.set(pep, { score: row[scoreIdx], class: immClass });
          if (ic50ColIdx >= 0) {
            const val = parseFloat(row[ic50ColIdx]);
            if (!isNaN(val) && !ic50Map.has(pep)) ic50Map.set(pep, val);
          }
        }
        immRows.sort((a, b) => (parseFloat(b[2]) || 0) - (parseFloat(a[2]) || 0));
      }

      // Also extract IC50 from MHC-II (if available)
      if (filterResult && filterResult.mhcII.rows.length > 0) {
        const cols = filterResult.mhcII.columns;
        const pepIdxII = findCol(cols, 'peptide');
        const ic50ColIdx = findCol(cols, 'netmhcpan_ba_ic50', 'ic50', 'netmhcpan_ba');
        if (ic50ColIdx >= 0) {
          for (const row of filterResult.mhcII.rows) {
            const pep = row[pepIdxII] ?? '';
            const val = parseFloat(row[ic50ColIdx]);
            if (pep && !isNaN(val) && !ic50Map.has(pep)) ic50Map.set(pep, val);
          }
        }
      }

      console.log(`immMap size: ${immMap.size}, ic50Map size: ${ic50Map.size}, peptides: ${peptides.length}`);

      setImmunogenicityRows(immRows.map(r => { const obj: Record<string, string> = {}; immColumns.forEach((c, i) => obj[c] = r[i]); return obj; }));
      setStepResult(9, { csv: immRows.length > 0 ? [immColumns.join(','), ...immRows.map(r => r.join(','))].join('\n') : '' });

      // Pre-filter: immunogenicity score > 0 AND IC50 < threshold
      const preFilteredPeptides: string[] = [];
      for (const pep of peptides) {
        const imm = immMap.get(pep);
        const ic50 = ic50Map.get(pep);
        const scoreVal = imm?.score !== undefined ? parseFloat(String(imm.score)) : NaN;
        const isImmunogenic = !isNaN(scoreVal) && scoreVal > 0;
        const isStrongBinder = ic50 !== undefined && ic50 < ic50Threshold;
        if (isImmunogenic && isStrongBinder) {
          preFilteredPeptides.push(pep);
        }
      }

      const immHigh = immRows.filter(r => r[8] === 'High' || r[8] === 'Medium').length;
      const immUnknown = immRows.filter(r => r[8] === 'Unknown').length;
      updateStep(9, 'completed', `${preFilteredPeptides.length} / ${peptides.length} passed pre-filter (Imm:${immHigh} Unknown:${immUnknown} IC50<${ic50Threshold}nM)`);

      // ─── Step 10: VaxiJen (on pre-filtered peptides) ───
      updateStep(10, 'running', `Predicting antigenicity for ${preFilteredPeptides.length} peptides...`);
      const vaxRes = await fetch(`${BACKEND}/api/vaxijen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequences: preFilteredPeptides }),
        signal: AbortSignal.timeout(600000),
      });
      const vaxData = await vaxRes.json();
      if (!vaxRes.ok) throw new Error(vaxData.detail || 'VaxiJen failed');
      const vaxResults: { sequence: string; score: number | null; prediction: string | null }[] = vaxData.map((r: { sequence: string; score: number | null; prediction: string | null }) => ({
        sequence: r.sequence, score: r.score, prediction: r.prediction,
      }));
      setVaxijenResults(vaxResults);
      const vaxAntigens = vaxResults.filter((r: { prediction: string | null }) => r.prediction?.toUpperCase() === 'ANTIGEN').length;
      updateStep(10, 'completed', `${vaxAntigens} antigens / ${vaxResults.length - vaxAntigens} non-antigens`);
      const vaxCsv = ['peptide,score,prediction', ...vaxResults.map((r: { sequence: string; score: number | null; prediction: string | null }) => `${r.sequence},${r.score ?? ''},${r.prediction ?? ''}`)].join('\n');
      setStepResult(10, { csv: vaxCsv });

      // ─── Step 11: AllerTOP (on pre-filtered peptides) ───
      updateStep(11, 'running', `Predicting allergenicity...`);
      const alRes = await fetch(`${BACKEND}/api/allertop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequences: preFilteredPeptides }),
        signal: AbortSignal.timeout(900000),
      });
      const alData = await alRes.json();
      if (!alRes.ok) throw new Error(alData.detail || 'AllerTOP failed');
      const alResults: { sequence: string; prediction: string | null; similar_protein?: string | null }[] = alData.map((r: { sequence: string; prediction: string | null; similar_protein?: string | null }) => ({
        sequence: r.sequence, prediction: r.prediction, similar_protein: r.similar_protein,
      }));
      setAllertopResults(alResults);
      const alNon = alResults.filter((r: { prediction: string | null }) => r.prediction?.toUpperCase().includes('NON-ALLERGEN')).length;
      updateStep(11, 'completed', `${alNon} non-allergens / ${alResults.length} total`);
      const alCsv = ['peptide,prediction,most_similar_protein', ...alResults.map((r: { sequence: string; prediction: string | null; similar_protein?: string | null }) => `${r.sequence},${r.prediction ?? ''},${r.similar_protein ?? ''}`)].join('\n');
      setStepResult(11, { csv: alCsv });

      // ─── Step 12: ToxinPred (on pre-filtered peptides) ───
      updateStep(12, 'running', `Predicting toxicity...`);
      const txRes = await fetch(`${BACKEND}/api/toxinpred`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequences: preFilteredPeptides }),
        signal: AbortSignal.timeout(600000),
      });
      const txData = await txRes.json();
      if (!txRes.ok) throw new Error(txData.detail || 'ToxinPred failed');
      const txResults: { sequence: string; prediction: string | null }[] = txData.map((r: { sequence: string; prediction: string | null }) => ({
        sequence: r.sequence, prediction: r.prediction,
      }));
      setToxinpredResults(txResults);
      const txNon = txResults.filter((r: { prediction: string | null }) => r.prediction?.toUpperCase().includes('NON-TOXIN')).length;
      updateStep(12, 'completed', `${txNon} non-toxins / ${txResults.length} total`);
      const txCsv = ['peptide,prediction', ...txResults.map((r: { sequence: string; prediction: string | null }) => `${r.sequence},${r.prediction ?? ''}`)].join('\n');
      setStepResult(12, { csv: txCsv });

      // Final passing peptides: pre-filtered + antigen + non-allergen + non-toxin
      const passingPeptides: string[] = [];
      for (const pep of preFilteredPeptides) {
        const vax = vaxResults.find(v => v.sequence === pep);
        const al = alResults.find(a => a.sequence === pep);
        const tx = txResults.find(t => t.sequence === pep);
        const isAntigenic = vax?.prediction?.toUpperCase() === 'ANTIGEN';
        const isNonAllergen = /NON-ALLERGEN/i.test(al?.prediction ?? '');
        const isNonToxin = /NON-TOXIN/i.test(tx?.prediction ?? '');
        if (isAntigenic && isNonAllergen && isNonToxin) {
          passingPeptides.push(pep);
        }
      }

      // ─── Step 13: ProtParam (ExPASy) — only on final passing peptides ───
      updateStep(13, 'running', `Computing ProtParam for ${passingPeptides.length} passing peptides...`);
      const ppRes = await fetch('/api/protparam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peptides: passingPeptides.length > 0 ? passingPeptides : preFilteredPeptides }),
      });
      const ppData = await ppRes.json();
      if (!ppRes.ok) throw new Error(ppData.error || 'ProtParam failed');

      const ppCols = ['peptide', 'protparam_num_aa', 'protparam_pi', 'protparam_mw',
        'protparam_neg_charged', 'protparam_pos_charged', 'protparam_instability',
        'protparam_stability', 'protparam_aliphatic', 'protparam_gravy',
        'protparam_extinction', 'protparam_abs01', 'protparam_halflife', 'protparam_formula', 'protparam_total_atoms'];
      const ppRows: string[][] = (ppData.results || []).map((r: Record<string, unknown>) => [
        String(r.peptide ?? ''), String(r.numAminoAcids ?? ''), String(r.theoreticalPI ?? ''),
        String(r.molecularWeight ?? ''), String(r.negChargedResidues ?? ''), String(r.posChargedResidues ?? ''),
        String(r.instabilityIndex ?? ''), String(r.stabilityClass ?? ''), String(r.aliphaticIndex ?? ''),
        String(r.gravy ?? ''), String(r.extinctionCoefficient ?? ''), String(r.abs01 ?? ''),
        String(r.estimatedHalfLife ?? ''), String(r.formula ?? ''), String(r.totalAtoms ?? ''),
      ]);

      setProtparamData({ columns: ppCols, rows: ppRows });
      updateStep(13, 'completed', `${ppRows.length} peptides analyzed via ExPASy`);
      setStepResult(13, { csv: ppRows.length > 0 ? [ppCols.join(','), ...ppRows.map(r => r.join(','))].join('\n') : '' });

      // ─── Step 14: Population Coverage — on final passing peptides ───
      updateStep(14, 'running', 'Calculating HLA population coverage...');
      try {
        const iedbCols = filterResult.mhcI.columns;
        const pepCol = iedbCols.indexOf('peptide');
        const alleleCol = iedbCols.indexOf('allele');
        const popPairs: { epitope: string; alleles: string }[] = [];
        const seenPop = new Set<string>();

        if (pepCol >= 0 && alleleCol >= 0) {
          const pepAlleles = new Map<string, Set<string>>();
          for (const row of filterResult.mhcI.rows) {
            const pep = row[pepCol];
            if (!passingPeptides.includes(pep)) continue;
            const allele = row[alleleCol];
            if (pep && allele) {
              if (!pepAlleles.has(pep)) pepAlleles.set(pep, new Set());
              pepAlleles.get(pep)!.add(allele);
            }
          }
          for (const [pep, alleles] of pepAlleles) {
            const key = pep + alleles.size;
            if (!seenPop.has(key)) {
              seenPop.add(key);
              popPairs.push({ epitope: pep, alleles: Array.from(alleles).join(',') });
            }
          }
        }

        if (popPairs.length > 0) {
          const popRes = await fetch('http://localhost:8000/api/population_coverage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              epitope_alleles: popPairs.slice(0, 50),
              population: ['World'],
              mhc_class: 'combined',
            }),
          });
          const popData = await popRes.json();
          if (popRes.ok && !popData.error) {
            setPopCoverageData(popData);
            const totalCoverage = popData.summary?.[0]?.coverage || 'N/A';
            updateStep(14, 'completed', `${popPairs.length} passing epitopes — World coverage: ${totalCoverage}%`);
            setStepResult(14, { json: popData });
          } else {
            updateStep(14, 'error', popData.error || 'Population coverage failed');
          }
        } else {
          updateStep(14, 'completed', 'No passing epitopes with allele data for coverage');
        }
      } catch (e: any) {
        updateStep(14, 'error', e.message || 'Population coverage request failed');
      }

      // ─── Step 15: Consolidate — 3 CSVs (MHC-I Final, MHC-II Final, B-cell Final) ───
      updateStep(15, 'running', 'Consolidating 3 final CSVs...');

      function filterAndMerge(iedbColumns: string[], iedbRows: string[][], label: string): string {
        if (iedbRows.length === 0) return '';
        return mergeAllToFinalCSV({
          iedbColumns, iedbRows,
          vaxijenResults: vaxResults,
          allertopResults: alResults,
          toxinpredResults: txResults,
          protparamData: { columns: ppCols, rows: ppRows },
          immunogenicityRows: immRows.map(r => { const obj: Record<string, string> = {}; immColumns.forEach((c, i) => obj[c] = r[i]); return obj; }),
        });
      }

      function filterRowsByPassing(rows: string[][], cols: string[]): string[][] {
        const pepI = cols.indexOf('peptide');
        return rows.filter(row => passingPeptides.includes(row[pepI]));
      }

      const csvI = filterAndMerge(filterResult.mhcI.columns, filterRowsByPassing(filterResult.mhcI.rows, filterResult.mhcI.columns), 'MHC-I');
      const csvII = filterAndMerge(filterResult.mhcII.columns, filterRowsByPassing(filterResult.mhcII.rows, filterResult.mhcII.columns), 'MHC-II');
      const csvBcell = bcellFiltered.length > 0 ? (() => {
        const bCols = bcellMutResult.columns || ['peptide'];
        const bRows = bcellRowsFiltered.filter(row => {
          const bPepI = bCols.indexOf('peptide');
          return passingPeptides.includes(row[bPepI] || '');
        });
        return filterAndMerge(bCols, bRows, 'B-cell');
      })() : '';

      setFinalCsvI(csvI);
      setFinalCsvII(csvII);
      setFinalCsvBcell(csvBcell);
      updateStep(15, 'completed', `MHC-I: ${csvI.split('\n').length - 1} | MHC-II: ${csvII.split('\n').length - 1} | B-cell: ${csvBcell ? csvBcell.split('\n').length - 1 : 0} passing peptides`);
      setStepResult(15, { csv: csvI });

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setError('Pipeline stopped by user');
        setSteps(prev => {
          const updated = { ...prev };
          for (const [k, v] of Object.entries(updated)) {
            if (v.status === 'running') updated[parseInt(k)] = { status: 'error', message: 'Stopped by user' };
          }
          return updated;
        });
      } else {
        setError((err as Error).message);
        setSteps(prev => {
          const updated = { ...prev };
          for (const [k, v] of Object.entries(updated)) {
            if (v.status === 'running') updated[parseInt(k)] = { status: 'error', message: (err as Error).message };
          }
          return updated;
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportAll = async () => {
    const gene = geneName.trim().toUpperCase();
    const files: Record<string, string> = {};

    // Collect all step CSVs
    for (const [stepNum, data] of Object.entries(stepData)) {
      if (data.csv) {
        const name = STEP_NAMES[parseInt(stepNum)] || `Step ${stepNum}`;
        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        files[`${gene}_${safeName}.csv`] = data.csv;
      }
      if (data.fasta) {
        files[`${gene}_step${stepNum}_sequence.fasta`] = data.fasta;
      }
    }

    if (finalCsvI) files[`${gene}_MHC1_final.csv`] = finalCsvI;
    if (finalCsvII) files[`${gene}_MHC2_final.csv`] = finalCsvII;
    if (finalCsvBcell) files[`${gene}_Bcell_final.csv`] = finalCsvBcell;
    if (msaPng) {
      files[`${gene}_msa_alignment.png`] = msaPng;
    }

    // Generate ZIP client-side using a simple approach
    // For now, just download individual files
    for (const [filename, content] of Object.entries(files)) {
      if (filename.endsWith('.png')) {
        downloadBase64Png(content, filename);
      } else {
        downloadFile(content, filename);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  };

  const completedCount = Object.values(steps).filter(s => s.status === 'completed').length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Ambient */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.03] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-gray-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <button onClick={() => router.push('/')} className="flex items-center gap-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/20">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight group-hover:text-emerald-400 transition-colors">Vaccine Design</h1>
              <p className="text-[11px] text-gray-500">Neoantigen Pipeline</p>
            </div>
          </button>
          {completedCount > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{completedCount}/15 steps completed</span>
              <div className="h-1.5 w-32 rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500" style={{ width: `${(completedCount / 15) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Upload Section */}
        <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold">Mutation Data Source</h2>
            <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              <button onClick={() => setDataSource('upload')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${dataSource === 'upload' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>
                Upload COSMIC CSV
              </button>
              <button onClick={() => setDataSource('cbioportal')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${dataSource === 'cbioportal' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}>
                Query cBioPortal
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-400">Gene Name</label>
              <input type="text" value={geneName} onChange={e => setGeneName(e.target.value)} placeholder="e.g., PIK3CA, TP53, KRAS"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all" />
            </div>

            {dataSource === 'upload' ? (
              <div className="flex-1">
                <label className="mb-1 block text-sm text-gray-400">CSV File</label>
                <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-gray-100 file:mr-3 file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-emerald-500 file:to-teal-500 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:brightness-110 transition-all" />
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <label className="mb-1 block text-sm text-gray-400">Cancer Type</label>
                  <select value={cancerType} onChange={e => setCancerType(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-gray-100 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all">
                    {['breast','lung','colon','prostate','ovarian','glioblastoma','head and neck','thyroid','kidney','endometrial','brain','pancreas','melanoma','liver','stomach','bladder','esophageal','sarcoma','adrenal','uterine','cervical','mesothelioma','lymphoma','testicular','cholangiocarcinoma','uveal melanoma'].map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <button onClick={async () => {
                  if (!geneName.trim()) { setError('Enter a gene name first'); return; }
                  setFetchingCosmic(true); setError('');
                  try {
                    const r = await fetch('/api/cbioportal', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gene: geneName.trim(), cancer_type: cancerType }),
                    });
                    const data = await r.json();
                    if (data.error) throw new Error(data.error);
                    setCosmicCsv(data.csv);
                  } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Fetch failed'); }
                  finally { setFetchingCosmic(false); }
                }} disabled={fetchingCosmic || !geneName.trim()}
                  className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-2.5 font-semibold text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 transition-all whitespace-nowrap">
                  {fetchingCosmic ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Fetching...
                    </span>
                  ) : 'Fetch Mutations'}
                </button>
              </>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2">
                <label className="text-[11px] text-gray-500 whitespace-nowrap">Immuno ≥</label>
                <input type="number" step="0.01" min="-0.1" max="0.1" value={immThreshold}
                  onChange={e => setImmThreshold(parseFloat(e.target.value) || 0.5)}
                  className="w-16 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-center text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50" />
                <label className="text-[11px] text-gray-500 whitespace-nowrap ml-2">IC50 &lt;</label>
                <input type="number" step="50" min="0" value={ic50Threshold}
                  onChange={e => setIc50Threshold(parseFloat(e.target.value) || 500)}
                  className="w-16 rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-center text-xs text-gray-200 focus:outline-none focus:border-emerald-500/50" />
                <span className="text-[10px] text-gray-600">nM</span>
              </div>
              <button onClick={handleRunPipeline} disabled={loading || !geneName.trim()}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-2.5 font-semibold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none transition-all">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Running...
                  </span>
                ) : 'Run Pipeline'}
              </button>
              {loading && (
                <button onClick={handleStopPipeline}
                  className="rounded-xl bg-red-500/20 border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/30 transition-all">
                  Stop
                </button>
              )}
            </div>
          </div>
          {cosmicCsv && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
              cBioPortal data loaded: {cosmicCsv.split('\n').length - 1} mutations fetched for {geneName.trim().toUpperCase()} ({cancerType})
            </div>
          )}
          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}
        </section>

        {/* Resume Section */}
        {savedStates.length > 0 && !loading && (
          <section className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-amber-300">Saved Pipelines</h3>
                <p className="text-[11px] text-gray-500 mt-1">Resume a previous run from where it left off</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {savedStates.map(s => (
                <div key={s.gene} className="flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10">
                  <button onClick={() => { setGeneName(s.gene); handleResume(s.gene); }}
                    className="px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/10 rounded-l-lg transition-all">
                    {s.gene} — Step {s.lastStep}/15 — {new Date(s.savedAt).toLocaleDateString()}
                  </button>
                  <button onClick={() => handleDeleteState(s.gene)}
                    className="px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/20 rounded-r-lg border-l border-amber-500/20 transition-all"
                    title="Delete saved state">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stats */}
        {(step1Stats || refSeq) && (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {[
              { label: 'Raw Rows', value: step1Stats?.totalRawRows.toLocaleString() || '-' },
              { label: 'Missense', value: step1Stats?.totalMissense.toLocaleString() || '-', accent: true },
              { label: 'Unique Positions', value: step1Stats?.uniquePositions.toLocaleString() || '-' },
              { label: 'Reference AA', value: refSeq.length || '-' },
              { label: 'MSA Columns', value: msaLength || '-' },
              { label: 'MHC-I Epitopes', value: mhciCount || '-' },
              { label: 'MHC-II Epitopes', value: mhciiCount || '-' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-[11px] text-gray-500">{s.label}</div>
                <div className={`mt-1 text-2xl font-bold ${s.accent ? 'text-emerald-400' : 'text-gray-100'}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Top Mutations */}
        {topMutations.length > 0 && (
          <section className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h2 className="mb-4 text-lg font-semibold">Top 20 Mutations</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5 text-left text-gray-400">
                  <th className="pb-2 pr-4">#</th><th className="pb-2 pr-4">Pos</th><th className="pb-2 pr-4">Ref</th><th className="pb-2 pr-4">Alt</th><th className="pb-2 pr-4">Mutation</th><th className="pb-2 pr-4 text-right">Patients</th><th className="pb-2 text-right">MAF</th>
                </tr></thead>
                <tbody>
                  {topMutations.map((m, i) => (
                    <tr key={`${m.Position}-${m.Ref_AA}-${m.Alt_AA}`} className="border-b border-white/[0.03]">
                      <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                      <td className="py-2 pr-4 font-mono text-gray-300">{m.Position}</td>
                      <td className="py-2 pr-4 text-blue-400">{m.Ref_AA}</td>
                      <td className="py-2 pr-4 text-amber-400">{m.Alt_AA}</td>
                      <td className="py-2 pr-4 font-mono font-medium text-gray-200">p.{m.Ref_AA}{m.Position}{m.Alt_AA}</td>
                      <td className="py-2 pr-4 text-right font-mono text-gray-300">{m.Patient_Count.toLocaleString()}</td>
                      <td className="py-2 text-right font-mono text-gray-400">{m.MAF.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Pipeline Progress */}
        {(step1Stats || refSeq) && (
          <section className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Pipeline Progress</h2>
              {completedCount === 14 && (finalCsvI || finalCsvII || finalCsvBcell) && (
                <button onClick={handleExportAll}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:brightness-110 transition-all">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export All Files
                </button>
              )}
            </div>

            <div className="space-y-2">
              {PHASES.map((phase) => (
                <div key={phase.name} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-${phase.color}-500/10 text-[10px] font-bold text-${phase.color}-400`}>
                      {phase.steps[0]}
                    </span>
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">{phase.name}</span>
                  </div>
                  <div className="space-y-1 ml-7">
                    {phase.steps.map(stepNum => (
                      <StepRow
                        key={stepNum}
                        step={stepNum}
                        name={STEP_NAMES[stepNum]}
                        state={steps[stepNum] || { status: 'pending' }}
                        data={stepData[stepNum]}
                        expanded={expandedStep === stepNum}
                        onToggle={() => setExpandedStep(expandedStep === stepNum ? null : stepNum)}
                        geneName={geneName.trim().toUpperCase()}
                        msaPng={stepNum === 4 ? msaPng : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Neoantigen Counts */}
            {(neoantigensI > 0 || neoantigensII > 0) && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4">
                  <div className="text-xs text-emerald-400">MHC-I Neoantigens</div>
                  <div className="mt-1 text-3xl font-bold text-emerald-300">{neoantigensI}</div>
                </div>
                <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4">
                  <div className="text-xs text-emerald-400">MHC-II Neoantigens</div>
                  <div className="mt-1 text-3xl font-bold text-emerald-300">{neoantigensII}</div>
                </div>
              </div>
            )}

            {/* Final Summary */}
            {(finalCsvI || finalCsvII || finalCsvBcell) && (
              <div className="mt-6 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 p-6">
                <h3 className="text-sm font-semibold text-emerald-300 mb-3">Pipeline Complete</h3>
                <div className="grid grid-cols-3 gap-3">
                  {finalCsvI && <div className="rounded-lg bg-emerald-500/5 p-3 text-center"><div className="text-[11px] text-gray-500">MHC-I Final</div><div className="text-lg font-bold text-emerald-300">{finalCsvI.split('\n').length - 1} peptides</div></div>}
                  {finalCsvII && <div className="rounded-lg bg-cyan-500/5 p-3 text-center"><div className="text-[11px] text-gray-500">MHC-II Final</div><div className="text-lg font-bold text-cyan-300">{finalCsvII.split('\n').length - 1} peptides</div></div>}
                  {finalCsvBcell && <div className="rounded-lg bg-purple-500/5 p-3 text-center"><div className="text-[11px] text-gray-500">B-cell Final</div><div className="text-lg font-bold text-purple-300">{finalCsvBcell.split('\n').length - 1} peptides</div></div>}
                </div>
                <p className="text-[11px] text-gray-500 mt-3 text-center">Filtered: antigenic + immunogenic (≥{immThreshold}) + non-allergenic + non-toxic + strong binder (IC50 &lt;{ic50Threshold}nM)</p>
              </div>
            )}

            {/* Population Coverage Results */}
            {popCoverageData && popCoverageData.plots && popCoverageData.plots.length > 0 && (
              <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                <h3 className="text-sm font-semibold text-amber-300 mb-4">Population Coverage Analysis</h3>
                {popCoverageData.summary && popCoverageData.summary.length > 0 && (
                  <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {popCoverageData.summary.map((s: any, i: number) => (
                      <div key={i} className="rounded-lg bg-white/[0.03] p-3">
                        <div className="text-[11px] text-gray-500">{s.population}</div>
                        <div className="text-lg font-bold text-amber-300">{s.coverage}</div>
                        <div className="text-[11px] text-gray-500">Avg hits: {s.average_hit} · PC90: {s.pc90}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {popCoverageData.plots.map((plot: any, i: number) => (
                    <div key={i} className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-[11px] text-gray-500 mb-2">{plot.name.replace('.png', '').replace('popcov_', '').replace('_', ' ')}</p>
                      <img src={`data:image/png;base64,${plot.data}`} alt={plot.name} className="w-full rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="mt-16 border-t border-white/5 py-6 text-center text-xs text-gray-600">
        Vaccine Design — Curated and developed by <span className="text-gray-400">S. Shriya</span>
      </footer>
    </div>
  );
}

function StepRow({ step, name, state, data, expanded, onToggle, geneName, msaPng }: {
  step: number; name: string; state: StepState; data?: StepData;
  expanded: boolean; onToggle: () => void; geneName: string; msaPng?: string;
}) {
  const icon = state.status === 'completed' ? '✓' : state.status === 'running' ? '⟳' : state.status === 'error' ? '✕' : step;
  const bg = state.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : state.status === 'running' ? 'bg-blue-500/20 text-blue-400' : state.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-white/[0.03] text-gray-600';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data) return;
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    if (data.csv) downloadFile(data.csv, `${geneName}_${safeName}.csv`);
    if (data.fasta) downloadFile(data.fasta, `${geneName}_${safeName}.fasta`, 'text/plain');
  };

  return (
    <div className="rounded-xl transition-all">
      <div
        onClick={onToggle}
        className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer rounded-xl transition-all ${state.status === 'running' ? 'bg-blue-500/5' : 'hover:bg-white/[0.02]'} ${expanded ? 'bg-white/[0.03]' : ''}`}
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${bg} ${state.status === 'running' ? 'animate-pulse' : ''}`}>{icon}</div>
        <span className={state.status === 'completed' ? 'text-gray-200' : 'text-gray-500'}>{name}</span>
        {state.message && <span className="text-[11px] text-gray-600 truncate max-w-xs">({state.message})</span>}
        <div className="ml-auto flex items-center gap-2">
          {state.status === 'completed' && data?.csv && (
            <button onClick={handleDownload} className="rounded-lg bg-white/[0.03] p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Download CSV">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </button>
          )}
          {state.status === 'completed' && <span className="text-[11px] text-emerald-400">Done</span>}
          {state.status === 'running' && <span className="text-[11px] text-blue-400">Running...</span>}
          {state.status === 'error' && <span className="text-[11px] text-red-400">Failed</span>}
          {(data?.csv || data?.fasta || (step === 4 && msaPng)) && (
            <svg className={`h-4 w-4 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          )}
        </div>
      </div>

      {expanded && data && (
        <div className="ml-10 mt-1 mb-2">
          {step === 4 && msaPng && (
            <div className="mb-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400">MSA Alignment Visualization</span>
                <button onClick={() => downloadBase64Png(msaPng, `${geneName}_msa_alignment.png`)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300">Download PNG</button>
              </div>
              <img src={`data:image/png;base64,${msaPng}`} alt="MSA Alignment" className="w-full rounded-lg" />
              {data.fasta && (() => {
                const lines = data.fasta.split('\n');
                const seqLines = lines.filter(l => !l.startsWith('>'));
                const aligned = seqLines.join('');
                const mutCount = (aligned.match(/▼/g) || []).length;
                return (
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-500">
                    <span>Sequences: <span className="text-gray-300">{lines.filter(l => l.startsWith('>')).length}</span></span>
                    <span>Alignment length: <span className="text-gray-300">{seqLines[0]?.length || 0} aa</span></span>
                    <span>Variant sites: <span className="text-amber-400">{data.fasta.split('\n').filter(l => l.startsWith('>')).length > 1 ? 'detected' : '0'}</span></span>
                  </div>
                );
              })()}
            </div>
          )}
          {step === 4 && data.fasta && (
            <div className="mb-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400">Aligned Sequences</span>
                <button onClick={() => downloadFile(data.fasta!, `${geneName}_msa_alignment.fasta`, 'text/plain')}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300">Download FASTA</button>
              </div>
              <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed">
                {data.fasta.split('\n').map((line, i) => (
                  <div key={i} className={line.startsWith('>') ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                    {line.length > 80 ? line.slice(0, 80) + '...' : line}
                  </div>
                ))}
              </pre>
            </div>
          )}
          {step !== 4 && data.fasta && <FastaPreview title="FASTA Preview" fasta={data.fasta} />}
          {data.csv && !data.columns && <DataPreview title="Results Preview" csvText={data.csv} />}
          {data.columns && data.rows && <DataPreview title="Results Preview" columns={data.columns} rows={data.rows} />}
        </div>
      )}
    </div>
  );
}
