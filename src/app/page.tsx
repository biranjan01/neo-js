'use client';

import { useRouter } from 'next/navigation';

const TOOLS = [
  {
    name: 'IEDB Next-Gen Tools',
    desc: 'MHC-I / MHC-II binding prediction (NetMHCpan 4.1 EL+BA), processing (NetMHCcons), immunogenicity scoring, and B-cell epitope prediction (BepiPred 3.0)',
    url: 'https://nextgen-tools.iedb.org/',
    citation: 'Vita R, et al. Nucleic Acids Res. 2019;47(W1):W440-W445.',
  },
  {
    name: 'IEDB Population Coverage',
    desc: 'Standalone tool for calculating HLA population coverage across world populations for given epitope-allele combinations',
    url: 'https://www.iedb.org/',
    citation: 'Bui HH, et al. Immunogenetics. 2006;58(5-6):327-333.',
  },
  {
    name: 'VaxiJen v2.0',
    desc: 'Alignment-independent server for prediction of protective antigens and vaccine candidates using auto-cross covariance (ACC) transformation of protein sequences',
    url: 'http://www.ddg-pharmfac.net/vaxijen/VaxiJen/',
    citation: 'Doytchinova IA, Flower DR. BMC Bioinformatics. 2007;8:4.',
  },
  {
    name: 'AllerTOP v2.1',
    desc: 'Allergen prediction using amino acid motif-based auto-cross covariance (ACC) transformation and machine learning',
    url: 'https://www.ddg-pharmfac.net/allertop_v2/',
    citation: 'Dimitrov I, et al. Bioinformatics. 2014;30(4):589-590.',
  },
  {
    name: 'ToxinPred v3',
    desc: 'Prediction of toxicity and non-toxicity of peptide sequences using hybrid approach combining multiple physicochemical properties',
    url: 'https://webs.iiitd.edu.in/raghava/toxinpred3/',
    citation: 'Gupta S, et al. PLoS One. 2013;8(11):e80109.',
  },
  {
    name: 'MAFFT',
    desc: 'Multiple sequence alignment program with high throughput, accuracy, and speed for large-scale genomic analysis',
    url: 'https://www.ebi.ac.uk/mafft/',
    citation: 'Katoh K, Standley DM. Mol Biol Evol. 2013;30(4):772-780.',
  },
  {
    name: 'ExPASy ProtParam',
    desc: 'Computation of physicochemical parameters including molecular weight, theoretical pI, instability index, aliphatic index, and GRAVY',
    url: 'https://web.expasy.org/protparam/',
    citation: 'Gasteiger E, et al. in "The Proteomics Protocols Handbook", Humana Press, 2005.',
  },
  {
    name: 'UniProt / Ensembl',
    desc: 'Reference protein sequence retrieval for canonical wild-type isoform mapping',
    url: 'https://www.uniprot.org/',
    citation: 'The UniProt Consortium. Nucleic Acids Res. 2023;51(D1):D483-D492.',
  },
  {
    name: 'COSMIC / cBioPortal',
    desc: 'Catalogue of Somatic Mutations in Cancer and cBioPortal — sources of somatic mutation frequency data for neoantigen prioritization',
    url: 'https://cancer.sanger.ac.uk/cosmic/',
    citation: 'Forbes SA, et al. Nucleic Acids Res. 2020;48(D1):D517-D524.',
  },
];

const PIPELINE_STEPS = [
  'Parse COSMIC',
  'Mutation Frequency',
  'Reference Seq',
  'MSA',
  'MHC-I',
  'MHC-II',
  'B-cell',
  'Neoantigen Filter',
  'Pre-filter',
  'VaxiJen',
  'AllerTOP',
  'ToxinPred',
  'ProtParam',
  'Pop. Coverage',
  'Export',
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Ambient Background ── */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-violet-500/[0.02] blur-[100px]" />
      </div>

      {/* ── Hero ── */}
      <header className="relative flex min-h-screen flex-col items-center justify-center px-6">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative z-10 max-w-3xl text-center">
          <div className="mb-8 inline-flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-3 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/20">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-400">Computational Vaccine Design</span>
          </div>

          <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Vaccine Design
            </span>
          </h1>

          <p className="mb-4 text-lg text-gray-400 sm:text-xl">
            NeoPeptide — An automated 15-step computational pipeline for{' '}
            <span className="text-gray-200">neoantigen vaccine candidate identification</span>{' '}
            in cancer immunotherapy research.
          </p>

          <p className="mx-auto mb-6 max-w-2xl text-sm leading-relaxed text-gray-500">
            Integrates somatic mutation analysis, MHC binding prediction (IC50-based),
            antigenicity screening, allergenicity & toxicity assessment, immunogenicity scoring,
            physicochemical analysis, and HLA population coverage to identify
            high-confidence peptide vaccine candidates from COSMIC or cBioPortal mutation data.
          </p>

          <div className="mx-auto mb-10 flex max-w-lg flex-wrap justify-center gap-3 text-[11px]">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-400">15-Step Pipeline</span>
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-blue-400">Stop &amp; Resume</span>
            <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-violet-400">500K+ Peptides</span>
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-400">cBioPortal Integration</span>
          </div>

          <button
            onClick={() => router.push('/pipeline')}
            className="group relative inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-10 py-4 text-base font-semibold text-white shadow-2xl shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40 hover:brightness-110"
          >
            Start Analysis
            <svg className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>

          {/* Pipeline steps preview */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-gray-600">
            {PIPELINE_STEPS.map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/5 bg-white/[0.03] text-[9px] text-gray-700">{i + 1}</span>
                {step}
                {i < PIPELINE_STEPS.length - 1 && <span className="text-gray-700">→</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </header>

      {/* ── Tools & Citations ── */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-5xl">
          {/* Disclaimer Banner */}
          <div className="mb-12 rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <svg className="h-3.5 w-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-300">Educational & Research Use Only</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  This pipeline is built for <span className="text-gray-300">educational purposes and academic research</span> in cancer immunotherapy.
                  The external APIs (IEDB, VaxiJen, AllerTOP, ToxinPred, MAFFT, ExPASy) are provided by their respective institutions.
                  Please <span className="text-gray-300">do not flood these services with excessive requests</span> — use responsibly and respect their rate limits and terms of use.
                  Misuse may disrupt services for other researchers.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">METHODOLOGY</span>
            <h2 className="text-3xl font-bold tracking-tight">Tools & Citations</h2>
            <p className="mt-3 text-sm text-gray-500">This pipeline integrates established bioinformatics tools and databases</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <a
                key={tool.name}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-white/10 hover:bg-white/[0.04]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-200">{tool.name}</h3>
                    <svg className="h-4 w-4 text-gray-600 transition-colors group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-gray-500">{tool.desc}</p>
                  <p className="text-[11px] text-gray-600 italic">{tool.citation}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pipeline Overview ── */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-medium text-blue-400">PIPELINE</span>
            <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
          </div>

          <div className="space-y-4">
            {[
              { phase: 'Data Preparation', num: 'Steps 1-4', steps: 'Parse COSMIC/cBioPortal mutations → Mutation frequency analysis → UniProt reference sequence retrieval → MAFFT multiple sequence alignment', color: 'violet' },
              { phase: 'Epitope Prediction', num: 'Steps 5-8', steps: 'MHC-I binding (NetMHCpan 4.1 EL+BA) → MHC-II binding → B-cell epitopes (BepiPred 3.0) → Neoantigen filtering (IC50-based deduplication across HLA variants)', color: 'blue' },
              { phase: 'Filtering & Properties', num: 'Steps 9-13', steps: 'Pre-filter by IC50 + immunogenicity → Antigenicity (VaxiJen) → Allergenicity (AllerTOP) → Toxicity (ToxinPred) → Physicochemical (ProtParam via ExPASy)', color: 'emerald' },
              { phase: 'Analysis & Export', num: 'Steps 14-15', steps: 'HLA population coverage analysis → Consolidation into 3 final CSVs (MHC-I, MHC-II, B-cell) → Export with all intermediate files', color: 'amber' },
            ].map((p, i) => (
              <div key={i} className="flex gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-${p.color}-500/10 text-${p.color}-400 text-sm font-bold`}>
                  {i + 1}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">{p.phase} <span className="text-gray-600 font-normal">{p.num}</span></h3>
                  <p className="mt-1 text-xs text-gray-500">{p.steps}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: '🧬', title: 'Chunked IEDB Processing', desc: 'Handles 500K+ peptides by auto-chunking sequences into 2000 aa segments with overlap, merging results across chunks' },
              { icon: '⏸️', title: 'Stop & Resume', desc: 'Stop the pipeline mid-run and resume from where you left off. State is saved to disk after each major step' },
              { icon: '📊', title: 'IC50-Based Filtering', desc: 'Deduplicates HLA variants by lowest IC50 binding affinity. Configurable immunogenicity and IC50 thresholds' },
              { icon: '🌍', title: 'Population Coverage', desc: 'Calculates HLA allele frequency coverage across world populations for your candidate epitopes' },
              { icon: '🔬', title: '3 Final CSVs', desc: 'Outputs separate MHC-I, MHC-II, and B-cell final CSVs with 72 columns of annotation per peptide' },
              { icon: '🧮', title: 'cBioPortal Integration', desc: 'Query mutations directly from cBioPortal for 26 cancer types without needing COSMIC CSV upload' },
            ].map((f, i) => (
              <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-lg mb-2">{f.icon}</div>
                <h4 className="text-sm font-semibold text-gray-200">{f.title}</h4>
                <p className="mt-1 text-[11px] text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quick Start ── */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-400">QUICK START</span>
            <h2 className="text-3xl font-bold tracking-tight">Run on Your Machine</h2>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 font-mono text-sm">
            <p className="mb-3 text-gray-500 text-xs"># 1. Install Docker Desktop from docker.com</p>
            <p className="mb-3 text-gray-500 text-xs"># 2. Clone or download this project</p>
            <div className="mb-4 rounded-lg bg-black/30 p-4 text-emerald-400 text-xs leading-relaxed">
              <p className="text-gray-500"># Navigate to the project folder</p>
              <p>cd neopeptide</p>
              <p className="mt-2 text-gray-500"># Build and start (first run takes ~5 min)</p>
              <p>docker compose up -d --build</p>
              <p className="mt-2 text-gray-500"># Open in browser</p>
              <p className="text-cyan-400">http://localhost:3000</p>
            </div>
            <p className="text-[11px] text-gray-600">Works on Windows, macOS, and Linux. Requires Docker Desktop with 4+ GB RAM allocated.</p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-300">Vaccine Design</span>
          </div>
          <p className="mb-2 text-sm text-gray-500">Automated Neoantigen Vaccine Prediction Pipeline</p>
          <p className="text-xs text-gray-600">
            Curated and developed by <span className="text-gray-400 font-medium">S. Shriya</span>
          </p>
          <p className="mt-2 text-[10px] text-gray-700 italic">
            For educational and research purposes only. Please use external APIs responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}
