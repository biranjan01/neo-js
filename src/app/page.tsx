'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DataPreview, FastaPreview } from '@/components/DataPreview';
import { step8FilterNeoantigens, neoantigensToCSV } from '@/lib/step8-filter-neoantigens';
import { IEDBResult } from '@/lib/step5-7-epitopes';

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

interface StepState {
  status: 'pending' | 'running' | 'completed' | 'error' | 'waiting';
  message?: string;
}

interface StepData {
  columns?: string[];
  rows?: string[][];
  csv?: string;
  fasta?: string;
  json?: unknown;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const [file, setFile] = useState<File | null>(null);
  const [geneName, setGeneName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step1Stats, setStep1Stats] = useState<Stats | null>(null);
  const [topMutations, setTopMutations] = useState<Mutation[]>([]);
  const [steps, setSteps] = useState<Record<number, StepState>>({
    1: { status: 'pending' }, 2: { status: 'pending' }, 3: { status: 'pending' },
    4: { status: 'pending' }, 5: { status: 'pending' }, 6: { status: 'pending' },
    7: { status: 'pending' }, 8: { status: 'pending' },
    9: { status: 'pending' }, 12: { status: 'pending' },
  });
  const [stepData, setStepData] = useState<Record<number, StepData>>({});
  const [refSeq, setRefSeq] = useState('');
  const [mutSeq, setMutSeq] = useState('');
  const [mhciCount, setMhciCount] = useState(0);
  const [mhciiCount, setMhciiCount] = useState(0);
  const [neoantigensI, setNeoantigensI] = useState(0);
  const [neoantigensII, setNeoantigensII] = useState(0);
  const [msaLength, setMsaLength] = useState(0);
  const [vaxijenLink, setVaxijenLink] = useState('');
  const [filteredPeptides, setFilteredPeptides] = useState<string[]>([]);
  const searchParams = useSearchParams();

  const updateStep = useCallback((step: number, status: StepState['status'], message?: string) => {
    setSteps((prev) => ({ ...prev, [step]: { status, message } }));
  }, []);

  const setStepResult = useCallback((step: number, data: StepData) => {
    setStepData((prev) => ({ ...prev, [step]: data }));
  }, []);

  // Handle VaxiJen results redirect back from Streamlit
  useEffect(() => {
    const vaxResult = searchParams.get('vaxijen_result');
    if (vaxResult) {
      try {
        const decoded = JSON.parse(atob(vaxResult));
        if (decoded.success && decoded.results) {
          updateStep(9, 'completed', `${decoded.stats.antigens} antigens / ${decoded.stats.nonAntigens} non-antigens`);
          const pepResults = decoded.results;
          const columns = ['peptide', 'vaxijen_score', 'vaxijen_prediction'];
          const rows = pepResults.map((r: { peptide: string; vaxijen_score: number; vaxijen_prediction: string }) => [
            r.peptide, String(r.vaxijen_score), r.vaxijen_prediction,
          ]);
          const csv = [columns.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
          setStepResult(9, { columns, rows, csv });
          window.history.replaceState({}, '', '/');
        }
      } catch (e) {
        console.error('Failed to parse VaxiJen result:', e);
      }
    }

    // Handle VaxiJen gist redirect from Streamlit
    const vaxGist = searchParams.get('vaxijen_gist');
    if (vaxGist) {
      updateStep(9, 'running', 'Fetching VaxiJen results from gist...');
      fetch(vaxGist)
        .then((r) => r.json())
        .then((decoded: any) => {
          if (decoded.success && decoded.results) {
            updateStep(9, 'completed', `${decoded.stats.antigens} antigens / ${decoded.stats.nonAntigens} non-antigens`);
            const pepResults = decoded.results;
            const columns = ['peptide', 'vaxijen_score', 'vaxijen_prediction'];
            const rows = pepResults.map((r: { peptide: string; vaxijen_score: number; vaxijen_prediction: string }) => [
              r.peptide, String(r.vaxijen_score), r.vaxijen_prediction,
            ]);
            const csv = [columns.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
            setStepResult(9, { columns, rows, csv });
            window.history.replaceState({}, '', '/');
          } else {
            updateStep(9, 'error', 'Invalid gist data');
          }
        })
        .catch((e) => {
          console.error('Failed to fetch gist:', e);
          updateStep(9, 'error', `Failed to fetch gist: ${e.message}`);
        });
    }
  }, [searchParams, updateStep, setStepResult]);

  const pollIEDB = async (resultId: string, stepNum: number, stepName: string): Promise<StepData> => {
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      updateStep(stepNum, 'running', `${stepName} — polling (${(i + 1) * 5}s)...`);
      try {
        const r = await fetch(`/api/epitopes/poll?resultId=${resultId}`);
        const data = await r.json();
        if (data.status === 'done') {
          return { columns: data.columns || [], rows: data.rows || [] };
        }
        if (data.status === 'failed') throw new Error(data.error || 'IEDB job failed');
      } catch (e) {
        if (i === maxAttempts - 1) throw e;
      }
    }
    throw new Error('IEDB polling timed out');
  };

  const runIEDBStep = async (
    geneName: string, canonicalSeq: string, mutatedSeq: string,
    step: number, label: string, stepNum: number, stepName: string
  ): Promise<StepData> => {
    updateStep(stepNum, 'running', `Submitting ${stepName}...`);
    const r = await fetch('/api/epitopes/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geneName, canonicalSeq, mutatedSeq, step, label }),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.error || `Step ${stepNum} submit failed`);
    }
    const { resultId } = await r.json();
    updateStep(stepNum, 'running', `Job submitted, polling...`);
    return pollIEDB(resultId, stepNum, stepName);
  };

  const handleRunPipeline = async () => {
    if (!file || !geneName.trim()) {
      setError('Please select a CSV file and enter a gene name');
      return;
    }

    setLoading(true);
    setError('');
    setStep1Stats(null);
    setTopMutations([]);
    setRefSeq('');
    setMutSeq('');
    setMhciCount(0);
    setMhciiCount(0);
    setNeoantigensI(0);
    setNeoantigensII(0);
    setMsaLength(0);
    setStepData({});

    const resetSteps: Record<number, StepState> = {};
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 12]) resetSteps[i] = { status: 'pending' };
    setSteps(resetSteps);

    const gene = geneName.trim().toUpperCase();

    try {
      // Step 1-2
      updateStep(1, 'running');
      updateStep(2, 'running');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('geneName', gene);

      const res1 = await fetch('/api/process', { method: 'POST', body: formData });
      const data1 = await res1.json();
      if (!res1.ok) throw new Error(data1.error);
      updateStep(1, 'completed');
      updateStep(2, 'completed');
      setStep1Stats(data1.stats);
      setTopMutations(data1.topMutations);
      setStepResult(1, { csv: data1.outputs.missense_simple });
      setStepResult(2, { csv: data1.outputs.mutation_summary });

      // Step 3
      updateStep(3, 'running', 'Fetching reference...');
      const res3 = await fetch('/api/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geneName: gene, missenseCSV: data1.outputs.missense_simple }),
      });
      const data3 = await res3.json();
      if (!res3.ok) throw new Error(data3.error);
      updateStep(3, 'completed', `${data3.reference.length} aa from ${data3.reference.source}`);
      setRefSeq(data3.reference.sequence);
      setMutSeq(data3.mutated.sequence);
      setStepResult(3, { fasta: data3.reference.fasta });

      // Step 4: MSA
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
      for (let i = 0; i < 60 && !msaDone; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        updateStep(4, 'running', `MAFFT aligning (${(i + 1) * 5}s)...`);
        const msaPoll = await fetch(`/api/msa/poll?jobId=${msaJobId}`);
        const msaData = await msaPoll.json();
        if (msaData.status === 'done') {
          updateStep(4, 'completed', `${msaData.stats.sequences} seqs, ${msaData.stats.length} cols`);
          setMsaLength(msaData.stats.length);
          setStepResult(4, { fasta: msaData.alignment });
          msaDone = true;
        } else if (msaData.status === 'failed') {
          throw new Error('MSA failed');
        }
      }
      if (!msaDone) throw new Error('MSA timed out');

      // Step 5: MHC-I (canonical + mutated)
      updateStep(5, 'running', 'MHC-I on canonical...');
      const mhciCanon = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 5, 'canonical', 5, 'MHC-I canonical');
      updateStep(5, 'running', 'MHC-I on mutated...');
      const mhciMut = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 5, 'mutated', 5, 'MHC-I mutated');
      updateStep(5, 'completed', `${mhciMut.rows?.length || 0} mutated epitopes`);
      setMhciCount(mhciMut.rows?.length || 0);
      setStepResult(5, { columns: mhciMut.columns, rows: mhciMut.rows?.slice(0, 5) || [] });

      // Step 6: MHC-II (canonical + mutated)
      updateStep(6, 'running', 'MHC-II on canonical...');
      const mhciiCanon = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 6, 'canonical', 6, 'MHC-II canonical');
      updateStep(6, 'running', 'MHC-II on mutated...');
      const mhciiMut = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 6, 'mutated', 6, 'MHC-II mutated');
      updateStep(6, 'completed', `${mhciiMut.rows?.length || 0} mutated epitopes`);
      setMhciiCount(mhciiMut.rows?.length || 0);
      setStepResult(6, { columns: mhciiMut.columns, rows: mhciiMut.rows?.slice(0, 5) || [] });

      // Step 7: B-cell (canonical + mutated)
      updateStep(7, 'running', 'B-cell on canonical...');
      const bcellCanon = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 7, 'canonical', 7, 'B-cell canonical');
      updateStep(7, 'running', 'B-cell on mutated...');
      const bcellMut = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 7, 'mutated', 7, 'B-cell mutated');
      updateStep(7, 'completed');
      setStepResult(7, { columns: bcellMut.columns, rows: bcellMut.rows?.slice(0, 5) || [] });

      // Step 8: Real filtering (client-side — no large payload to server)
      updateStep(8, 'running', 'Filtering neoantigens...');
      const filterResult = step8FilterNeoantigens(
        { success: true, columns: mhciCanon.columns || [], rows: mhciCanon.rows || [] } as IEDBResult,
        { success: true, columns: mhciMut.columns || [], rows: mhciMut.rows || [] } as IEDBResult,
        { success: true, columns: mhciiCanon.columns || [], rows: mhciiCanon.rows || [] } as IEDBResult,
        { success: true, columns: mhciiMut.columns || [], rows: mhciiMut.rows || [] } as IEDBResult
      );
      const mhcICsv = neoantigensToCSV(filterResult.mhcI.columns, filterResult.mhcI.rows);
      const mhcIICsv = neoantigensToCSV(filterResult.mhcII.columns, filterResult.mhcII.rows);
      updateStep(8, 'completed', `${filterResult.mhcI.stats.neoantigensFinal} MHC-I + ${filterResult.mhcII.stats.neoantigensFinal} MHC-II`);
      setNeoantigensI(filterResult.mhcI.stats.neoantigensFinal);
      setNeoantigensII(filterResult.mhcII.stats.neoantigensFinal);
      setStepResult(8, {
        columns: filterResult.mhcI.columns,
        rows: filterResult.mhcI.rows.slice(0, 50),
        csv: mhcICsv,
      });

      // Extract unique peptides from filtered MHC-I neoantigens
      const pepIdx = filterResult.mhcI.columns.indexOf('peptide');
      const filteredPeptides: string[] = [];
      if (pepIdx >= 0) {
        const seen = new Set<string>();
        for (const row of filterResult.mhcI.rows) {
          const pep = row[pepIdx];
          if (pep && !seen.has(pep)) {
            seen.add(pep);
            filteredPeptides.push(pep);
          }
        }
      }

      // Step 9: VaxiJen Antigenicity (auto-redirect to Streamlit Cloud)
      if (filteredPeptides.length > 0) {
        const input = JSON.stringify({
          sequences: filteredPeptides,
          target: 'Tumour',
          threshold: 0.5,
          batch_size: 5,
          gene: gene,
        });
        const encoded = btoa(input);
        const url = `https://neopeptide-8k6mkfhec6jh9mrnyjxtyr.streamlit.app/?data=${encoded}`;
        setVaxijenLink(url);
        setFilteredPeptides(filteredPeptides);
        updateStep(9, 'waiting', `${filteredPeptides.length} peptides ready — click link to run VaxiJen`);
      }

      // Step 12: ProtParam Physicochemical
      if (filteredPeptides.length > 0) {
        updateStep(12, 'running', `ProtParam on ${filteredPeptides.length} peptides...`);
        const resPP = await fetch('/api/protparam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            peptides: filteredPeptides,
            columns: filterResult.mhcI.columns,
            rows: filterResult.mhcI.rows,
          }),
        });
        const ppData = await resPP.json();
        if (!resPP.ok || !ppData.success) {
          throw new Error(ppData.error || 'ProtParam failed');
        }
        updateStep(12, 'completed', `${ppData.stats.stable} stable / ${ppData.stats.unstable} unstable`);
        setStepResult(12, {
          columns: ppData.columns || [],
          rows: ppData.rows || [],
          csv: ppData.fullCsv || '',
        });
      }

    } catch (err) {
      setError((err as Error).message);
      setSteps((prev) => {
        const updated = { ...prev };
        for (const [k, v] of Object.entries(updated)) {
          if (v.status === 'running') {
            updated[parseInt(k)] = { status: 'error', message: (err as Error).message };
          }
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-emerald-400">Neo</span>Peptide
          </h1>
          <p className="mt-1 text-sm text-gray-400">Neoantigen Vaccine Prediction Pipeline</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Upload COSMIC CSV</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-400">Gene Name</label>
              <input type="text" value={geneName} onChange={(e) => setGeneName(e.target.value)} placeholder="e.g., TP53"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-400">CSV File</label>
              <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500" />
            </div>
            <button onClick={handleRunPipeline} disabled={loading || !file || !geneName.trim()}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Running...
                </span>
              ) : 'Run Pipeline'}
            </button>
          </div>
          {error && <div className="mt-4 rounded-lg border border-red-800 bg-red-900/30 p-4 text-sm text-red-300">{error}</div>}
        </section>

        {(step1Stats || refSeq) && (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
              <StatCard label="Raw Rows" value={step1Stats?.totalRawRows.toLocaleString() || '-'} />
              <StatCard label="Missense" value={step1Stats?.totalMissense.toLocaleString() || '-'} accent />
              <StatCard label="Unique Positions" value={step1Stats?.uniquePositions.toLocaleString() || '-'} />
              <StatCard label="Reference AA" value={refSeq.length || '-'} />
              <StatCard label="MSA Columns" value={msaLength || '-'} />
              <StatCard label="MHC-I Epitopes" value={mhciCount || '-'} />
              <StatCard label="MHC-II Epitopes" value={mhciiCount || '-'} />
            </div>

            {topMutations.length > 0 && (
              <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
                <h2 className="mb-4 text-lg font-semibold">Top 20 Mutations</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-700 text-left text-gray-400">
                      <th className="pb-2 pr-4">#</th><th className="pb-2 pr-4">Pos</th><th className="pb-2 pr-4">Ref</th><th className="pb-2 pr-4">Alt</th><th className="pb-2 pr-4">Mutation</th><th className="pb-2 pr-4 text-right">Patients</th><th className="pb-2 text-right">MAF</th>
                    </tr></thead>
                    <tbody>
                      {topMutations.map((m, i) => (
                        <tr key={`${m.Position}-${m.Ref_AA}-${m.Alt_AA}`} className="border-b border-gray-800/50">
                          <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                          <td className="py-2 pr-4 font-mono">{m.Position}</td>
                          <td className="py-2 pr-4 text-blue-400">{m.Ref_AA}</td>
                          <td className="py-2 pr-4 text-amber-400">{m.Alt_AA}</td>
                          <td className="py-2 pr-4 font-mono font-medium">p.{m.Ref_AA}{m.Position}{m.Alt_AA}</td>
                          <td className="py-2 pr-4 text-right font-mono">{m.Patient_Count.toLocaleString()}</td>
                          <td className="py-2 text-right font-mono text-gray-400">{m.MAF.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Pipeline Progress</h2>
              <div className="space-y-1">
                <StepRow step={1} name="Parse COSMIC CSV" state={steps[1]} data={stepData[1]} />
                <StepRow step={2} name="Mutation Frequency" state={steps[2]} data={stepData[2]} />
                <StepRow step={3} name="Fetch Reference" state={steps[3]} data={stepData[3]} />
                <StepRow step={4} name="MSA Alignment (MAFFT)" state={steps[4]} data={stepData[4]} />
                <StepRow step={5} name="MHC-I Prediction (IEDB)" state={steps[5]} data={stepData[5]} />
                <StepRow step={6} name="MHC-II Prediction (IEDB)" state={steps[6]} data={stepData[6]} />
                <StepRow step={7} name="B-cell Prediction (IEDB)" state={steps[7]} data={stepData[7]} />
                <StepRow step={8} name="Neoantigen Filtering" state={steps[8]} data={stepData[8]} />
                <StepRow step={9} name="VaxiJen Antigenicity" state={steps[9]} data={stepData[9]} vaxijenLink={vaxijenLink} />
                <StepRow step={12} name="ProtParam Properties" state={steps[12]} data={stepData[12]} />
              </div>

              {(neoantigensI > 0 || neoantigensII > 0) && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-emerald-900/20 border border-emerald-800/30 p-4">
                    <div className="text-sm text-emerald-400">MHC-I Neoantigens</div>
                    <div className="mt-1 text-3xl font-bold text-emerald-300">{neoantigensI}</div>
                  </div>
                  <div className="rounded-lg bg-emerald-900/20 border border-emerald-800/30 p-4">
                    <div className="text-sm text-emerald-400">MHC-II Neoantigens</div>
                    <div className="mt-1 text-3xl font-bold text-emerald-300">{neoantigensII}</div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="mt-16 border-t border-gray-800 py-6 text-center text-xs text-gray-500">NeoPeptide</footer>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-gray-100'}`}>{value}</div>
    </div>
  );
}

function StepRow({ step, name, state, data, vaxijenLink }: { step: number; name: string; state: StepState; data?: StepData; vaxijenLink?: string }) {
  const icon = state.status === 'completed' ? '✓' : state.status === 'running' ? '⟳' : state.status === 'error' ? '✕' : state.status === 'waiting' ? '⏳' : step;
  const bg = state.status === 'completed' ? 'bg-emerald-600 text-white' : state.status === 'running' ? 'bg-blue-600 text-white' : state.status === 'error' ? 'bg-red-600 text-white' : state.status === 'waiting' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-gray-500';

  return (
    <div className="rounded-lg">
      <div className={`flex items-center gap-3 px-3 py-2 text-sm ${state.status === 'running' ? 'bg-blue-900/10 rounded-lg' : ''}`}>
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${bg} ${state.status === 'running' ? 'animate-pulse' : ''}`}>{icon}</div>
        <span className={state.status === 'completed' ? 'text-gray-300' : 'text-gray-500'}>{name}</span>
        {state.message && <span className="text-xs text-gray-500 truncate max-w-xs">({state.message})</span>}
        {state.status === 'completed' && <span className="ml-auto text-xs text-emerald-400 shrink-0">Done</span>}
        {state.status === 'running' && <span className="ml-auto text-xs text-blue-400 shrink-0">Running...</span>}
        {state.status === 'error' && <span className="ml-auto text-xs text-red-400 shrink-0">Failed</span>}
        {state.status === 'waiting' && vaxijenLink && (
          <a
            href={vaxijenLink}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-amber-400 shrink-0 bg-amber-900/30 px-3 py-1 rounded-lg hover:bg-amber-800/40 border border-amber-700/30"
          >
            Open VaxiJen →
          </a>
        )}
      </div>

      {state.status === 'completed' && data && (
        <div className="ml-9">
          {data.fasta && <FastaPreview title="FASTA Preview" fasta={data.fasta} />}
          {data.csv && !data.columns && (
            <DataPreview title="Results Preview" csvText={data.csv} />
          )}
          {data.columns && data.rows && (
            <DataPreview title="Results Preview" columns={data.columns} rows={data.rows} />
          )}
        </div>
      )}
    </div>
  );
}
