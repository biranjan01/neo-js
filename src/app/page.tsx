'use client';

import { useState } from 'react';

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

interface Results {
  success: boolean;
  geneName: string;
  stats: Stats;
  topMutations: Mutation[];
  outputs: {
    missense_simple: string;
    mutation_summary: string;
  };
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [geneName, setGeneName] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file || !geneName.trim()) {
      setError('Please select a CSV file and enter a gene name');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('geneName', geneName.trim().toUpperCase());

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Processing failed');
        return;
      }

      setResults(data);
    } catch (err) {
      setError(`Network error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="text-emerald-400">Srishti</span> Neoantigen Pipeline
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Step 1-2: COSMIC CSV Parsing & Mutation Frequency Analysis
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Upload Section */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="mb-4 text-lg font-semibold">Upload COSMIC CSV</h2>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            {/* Gene Name */}
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-400">Gene Name</label>
              <input
                type="text"
                value={geneName}
                onChange={(e) => setGeneName(e.target.value)}
                placeholder="e.g., TP53"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* File Input */}
            <div className="flex-1">
              <label className="mb-1 block text-sm text-gray-400">CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-gray-100 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1 file:text-sm file:font-medium file:text-white hover:file:bg-emerald-500"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleUpload}
              disabled={loading || !file || !geneName.trim()}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                'Run Step 1-2'
              )}
            </button>
          </div>

          {/* CSV Format Help */}
          <div className="mt-4 rounded-lg bg-gray-800/50 p-3 text-xs text-gray-400">
            <p className="font-medium text-gray-300">Expected CSV columns:</p>
            <code className="mt-1 block">
              Gene Name, Sample Name, CDS Mutation, AA Mutation
            </code>
            <p className="mt-1">
              AA Mutation format: <code>p.R175H</code>, <code>p.A159V</code>, <code>p.R248Q</code>
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg border border-red-800 bg-red-900/30 p-4 text-sm text-red-300">
              {error}
            </div>
          )}
        </section>

        {/* Results Section */}
        {results && (
          <div className="mt-8 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatCard label="Raw Rows" value={results.stats.totalRawRows.toLocaleString()} />
              <StatCard label="Missense" value={results.stats.totalMissense.toLocaleString()} accent />
              <StatCard label="Unique Positions" value={results.stats.uniquePositions.toLocaleString()} />
              <StatCard label="Hotspots" value={results.stats.hotspotCount.toLocaleString()} warn />
              <StatCard label="Total Samples" value={results.stats.totalSamples.toLocaleString()} />
            </div>

            {/* Top Mutations Table */}
            <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Top 20 Mutations by Patient Frequency
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      downloadCSV(results.outputs.missense_simple, `${results.geneName}_missense_simple.csv`)
                    }
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium hover:bg-gray-700"
                  >
                    Download Missense CSV
                  </button>
                  <button
                    onClick={() =>
                      downloadCSV(results.outputs.mutation_summary, `${results.geneName}_mutation_summary.csv`)
                    }
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium hover:bg-gray-700"
                  >
                    Download Frequency CSV
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-left text-gray-400">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Position</th>
                      <th className="pb-2 pr-4">Ref</th>
                      <th className="pb-2 pr-4">Alt</th>
                      <th className="pb-2 pr-4">Mutation</th>
                      <th className="pb-2 pr-4 text-right">Patients</th>
                      <th className="pb-2 pr-4 text-right">MAF (%)</th>
                      <th className="pb-2">Hotspot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.topMutations.map((m, i) => (
                      <tr
                        key={`${m.Position}-${m.Ref_AA}-${m.Alt_AA}`}
                        className="border-b border-gray-800/50 hover:bg-gray-800/30"
                      >
                        <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                        <td className="py-2 pr-4 font-mono">{m.Position}</td>
                        <td className="py-2 pr-4 text-blue-400">{m.Ref_AA}</td>
                        <td className="py-2 pr-4 text-amber-400">{m.Alt_AA}</td>
                        <td className="py-2 pr-4 font-mono font-medium">
                          p.{m.Ref_AA}{m.Position}{m.Alt_AA}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono">
                          {m.Patient_Count.toLocaleString()}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-gray-400">
                          {m.MAF.toFixed(4)}
                        </td>
                        <td className="py-2">
                          {m.is_hotspot ? (
                            <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-300">
                              Hotspot
                            </span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Pipeline Status */}
            <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold">Pipeline Progress</h2>
              <div className="space-y-2">
                <StepRow step={1} name="Parse COSMIC CSV" status="completed" />
                <StepRow step={2} name="Mutation Frequency Analysis" status="completed" />
                <StepRow step={3} name="Fetch Reference Sequence" status="pending" />
                <StepRow step={4} name="MSA Alignment (MAFFT)" status="pending" />
                <StepRow step={5} name="MHC-I Epitope Prediction" status="pending" />
                <StepRow step={6} name="MHC-II Epitope Prediction" status="pending" />
                <StepRow step={7} name="B-cell Epitope Prediction" status="pending" />
                <StepRow step={8} name="Neoantigen Filtering" status="pending" />
                <StepRow step={9} name="VaxiJen Antigenicity" status="pending" />
                <StepRow step={10} name="AllerTOP Allergenicity" status="pending" />
                <StepRow step={11} name="ToxinPred3 Toxicity" status="pending" />
                <StepRow step={12} name="ProtParam Properties" status="pending" />
                <StepRow step={13} name="Immunogenicity Scoring" status="pending" />
                <StepRow step={14} name="Final Consolidation" status="pending" />
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-800 py-6 text-center text-xs text-gray-500">
        Srishti Neoepitope Vaccine Prediction System
      </footer>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-xs text-gray-400">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          accent ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-gray-100'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StepRow({
  step,
  name,
  status,
}: {
  step: number;
  name: string;
  status: 'completed' | 'pending' | 'running';
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          status === 'completed'
            ? 'bg-emerald-600 text-white'
            : status === 'running'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-500'
        }`}
      >
        {status === 'completed' ? '✓' : step}
      </div>
      <span className={status === 'completed' ? 'text-gray-300' : 'text-gray-500'}>
        {name}
      </span>
      {status === 'completed' && (
        <span className="ml-auto text-xs text-emerald-400">Done</span>
      )}
      {status === 'pending' && (
        <span className="ml-auto text-xs text-gray-600">Upcoming</span>
      )}
    </div>
  );
}
