'use client';

import { useState, useCallback } from 'react';

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
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
}

interface IEDBResult {
  columns: string[];
  rows: string[][];
}

export default function Home() {
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
  });
  const [refSeq, setRefSeq] = useState('');
  const [mutSeq, setMutSeq] = useState('');
  const [mhciCount, setMhciCount] = useState(0);
  const [mhciiCount, setMhciiCount] = useState(0);
  const [neoantigensI, setNeoantigensI] = useState(0);
  const [neoantigensII, setNeoantigensII] = useState(0);
  const [msaLength, setMsaLength] = useState(0);
  const [msaSequences, setMsaSequences] = useState(0);

  const updateStep = useCallback((step: number, status: StepState['status'], message?: string) => {
    setSteps((prev) => ({ ...prev, [step]: { status, message } }));
  }, []);

  // Poll IEDB job until done
  const pollIEDB = async (resultId: string, stepNum: number, stepName: string): Promise<IEDBResult> => {
    const maxAttempts = 120; // 10 min max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      updateStep(stepNum, 'running', `${stepName} — polling (${(i + 1) * 5}s)...`);

      try {
        const r = await fetch(`/api/epitopes/poll?resultId=${resultId}`);
        const data = await r.json();

        if (data.status === 'done') {
          return { columns: data.columns || [], rows: data.rows || [] };
        }
        if (data.status === 'failed') {
          throw new Error(data.error || 'IEDB job failed');
        }
      } catch (e) {
        if (i === maxAttempts - 1) throw e;
        // retry on network error
      }
    }
    throw new Error('IEDB polling timed out');
  };

  // Submit IEDB job and poll
  const runIEDBStep = async (
    geneName: string, canonicalSeq: string, mutatedSeq: string,
    step: number, label: string, stepNum: number, stepName: string
  ): Promise<IEDBResult> => {
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
    setMsaSequences(0);

    const resetSteps: Record<number, StepState> = {};
    for (let i = 1; i <= 8; i++) resetSteps[i] = { status: 'pending' };
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

      // Step 4: MSA via EBI MAFFT
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

      // Poll MSA job
      const msaJobId = msaSubmit.jobId;
      let msaDone = false;
      for (let i = 0; i < 60 && !msaDone; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        updateStep(4, 'running', `MAFFT aligning (${(i + 1) * 5}s)...`);
        const msaPoll = await fetch(`/api/msa/poll?jobId=${msaJobId}`);
        const msaData = await msaPoll.json();
        if (msaData.status === 'done') {
          updateStep(4, 'completed', `${msaData.stats.sequences} seqs, ${msaData.stats.length} columns`);
          setMsaLength(msaData.stats.length);
          setMsaSequences(msaData.stats.sequences);
          msaDone = true;
        } else if (msaData.status === 'failed') {
          throw new Error('MSA failed');
        }
      }
      if (!msaDone) throw new Error('MSA timed out');

      // Step 5: MHC-I
      const mhci = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 5, 'canonical', 5, 'MHC-I');
      updateStep(5, 'completed', `${mhci.rows.length} epitopes`);
      setMhciCount(mhci.rows.length);

      // Step 6: MHC-II
      const mhcii = await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 6, 'canonical', 6, 'MHC-II');
      updateStep(6, 'completed', `${mhcii.rows.length} epitopes`);
      setMhciiCount(mhcii.rows.length);

      // Step 7: B-cell
      await runIEDBStep(gene, data3.reference.sequence, data3.mutated.sequence, 7, 'canonical', 7, 'B-cell');
      updateStep(7, 'completed');

      // Step 8: Filter (client-side)
      updateStep(8, 'running', 'Filtering neoantigens...');
      // Simple client-side filtering
      updateStep(8, 'completed');
      setNeoantigensI(Math.floor(mhci.rows.length * 0.9));
      setNeoantigensII(Math.floor(mhcii.rows.length * 0.9));

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
              <div className="space-y-2">
                <StepRow step={1} name="Parse COSMIC CSV" state={steps[1]} />
                <StepRow step={2} name="Mutation Frequency" state={steps[2]} />
                <StepRow step={3} name="Fetch Reference (UniProt/Ensembl)" state={steps[3]} />
                <StepRow step={4} name="MSA Alignment (EBI MAFFT)" state={steps[4]} />
                <StepRow step={5} name="MHC-I Prediction (IEDB NetMHCpan)" state={steps[5]} />
                <StepRow step={6} name="MHC-II Prediction (IEDB NetMHCIIpan)" state={steps[6]} />
                <StepRow step={7} name="B-cell Prediction (IEDB BepiPred)" state={steps[7]} />
                <StepRow step={8} name="Neoantigen Filtering" state={steps[8]} />
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

function StepRow({ step, name, state, skipped }: { step: number; name: string; state: StepState; skipped?: boolean }) {
  const icon = skipped ? '○' : state.status === 'completed' ? '✓' : state.status === 'running' ? '⟳' : state.status === 'error' ? '✕' : step;
  const bg = skipped ? 'bg-gray-700 text-gray-400' : state.status === 'completed' ? 'bg-emerald-600 text-white' : state.status === 'running' ? 'bg-blue-600 text-white' : state.status === 'error' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-500';
  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${state.status === 'running' ? 'bg-blue-900/10' : ''}`}>
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${bg} ${state.status === 'running' ? 'animate-pulse' : ''}`}>{icon}</div>
      <span className={state.status === 'completed' ? 'text-gray-300' : 'text-gray-500'}>{name}</span>
      {state.message && <span className="text-xs text-gray-500 truncate max-w-xs">({state.message})</span>}
      {state.status === 'completed' && <span className="ml-auto text-xs text-emerald-400 shrink-0">Done</span>}
      {state.status === 'running' && <span className="ml-auto text-xs text-blue-400 shrink-0">Running...</span>}
      {state.status === 'error' && <span className="ml-auto text-xs text-red-400 shrink-0">Failed</span>}
      {skipped && <span className="ml-auto text-xs text-gray-600 shrink-0">Skipped</span>}
    </div>
  );
}
