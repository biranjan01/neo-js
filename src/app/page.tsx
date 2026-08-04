'use client';

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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Ambient Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-emerald-500/[0.04] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 h-[500px] w-[500px] rounded-full bg-cyan-500/[0.04] blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative flex min-h-[60vh] flex-col items-center justify-center px-6">
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
              NeoPeptide
            </span>
          </h1>

          <p className="mb-4 text-lg text-gray-400 sm:text-xl">
            An automated 15-step computational pipeline for{' '}
            <span className="text-gray-200">neoantigen vaccine candidate identification</span>{' '}
            in cancer immunotherapy research.
          </p>

          <p className="mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-gray-500">
            Integrates somatic mutation analysis, MHC binding prediction (IC50-based),
            antigenicity screening, allergenicity &amp; toxicity assessment, immunogenicity scoring,
            physicochemical analysis, and HLA population coverage to identify
            high-confidence peptide vaccine candidates from COSMIC or cBioPortal mutation data.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <a href="/pipeline"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/30 hover:brightness-110">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Start Analysis
            </a>
            <a href="https://github.com/biranjan01/neopeptide" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-gray-300 transition-all hover:border-white/20 hover:bg-white/[0.05]">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              View on GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Setup Guide */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">How It Works</h2>
            <p className="mt-3 text-sm text-gray-500">Fully cloud-based — no Docker, no local installs. Deploy to Vercel + Streamlit Cloud.</p>
          </div>

          <div className="space-y-6">

            {/* Step 1: Deploy Frontend */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-bold text-white">1</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-200">Deploy Frontend to Vercel</h3>
                  <p className="mt-1 text-sm text-gray-500">One-click deploy. Set environment variables for Streamlit app URLs.</p>
                  <div className="mt-4 rounded-lg bg-black/30 p-3 font-mono text-xs text-emerald-400">
                    <p>git clone https://github.com/biranjan01/neo-js.git</p>
                    <p className="mt-1">cd neo-js && npm install && npm run build</p>
                  </div>
                  <div className="mt-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3 text-xs text-emerald-300">
                    <strong>Environment Variables:</strong> Set STREAMLIT_VAXIJEN_URL, STREAMLIT_IMMUNO_URL, STREAMLIT_ALLERTOP_URL, STREAMLIT_TOXINPRED_URL
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Deploy Streamlit Apps */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white">2</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-200">Deploy Streamlit Apps (Free)</h3>
                  <p className="mt-1 text-sm text-gray-500">Each bioinformatics tool runs as a separate Streamlit app on Streamlit Cloud.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                      <div className="text-sm font-medium text-gray-200 mb-2">Apps to Deploy</div>
                      <ul className="space-y-1 text-xs text-gray-400">
                        <li><span className="text-emerald-400">vaxijen-streamlit</span> — VaxiJen 2.0 antigenicity</li>
                        <li><span className="text-emerald-400">vaxijen3-streamlit</span> — VaxiJen 3.0 immunogenicity</li>
                        <li><span className="text-emerald-400">allertop-streamlit</span> — AllerTOP allergenicity</li>
                        <li><span className="text-emerald-400">toxinpred-streamlit</span> — ToxinPred toxicity</li>
                      </ul>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                      <div className="text-sm font-medium text-gray-200 mb-2">How It Works</div>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-400">
                        <li>Connect your GitHub repo to Streamlit Cloud</li>
                        <li>Select the streamlit-apps/ folder</li>
                        <li>Each app deploys independently</li>
                        <li>Copy the URL to your .env</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Use the Pipeline */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-sm font-bold text-white">3</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-200">Run Your Analysis</h3>
                  <p className="mt-1 text-sm text-gray-500">Enter a gene name, provide mutation data, and the 14-step pipeline handles the rest.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                      <div className="text-sm font-medium text-gray-200 mb-2">Option A: COSMIC CSV</div>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-500">
                        <li>Go to <a href="https://cancer.sanger.ac.uk/cosmic/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">COSMIC</a> and download a Mutations Export CSV</li>
                        <li>Enter your gene name (e.g., PIK3CA)</li>
                        <li>Upload the CSV file</li>
                        <li>Click <strong className="text-gray-300">Run Pipeline</strong></li>
                      </ol>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                      <div className="text-sm font-medium text-gray-200 mb-2">Option B: cBioPortal</div>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-500">
                        <li>Enter your gene name</li>
                        <li>Select &quot;Query cBioPortal&quot;</li>
                        <li>Choose a cancer type (e.g., Breast)</li>
                        <li>Click <strong className="text-gray-300">Fetch Mutations</strong> then <strong className="text-gray-300">Run Pipeline</strong></li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="relative py-12 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <svg className="h-3.5 w-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-300">Educational &amp; Research Use Only</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  This pipeline is built for <span className="text-gray-300">educational purposes and academic research</span> in cancer immunotherapy.
                  External APIs (IEDB, VaxiJen, AllerTOP, ToxinPred, MAFFT, ExPASy) are provided by their respective institutions.
                  Please <span className="text-gray-300">do not flood these services with excessive requests</span>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tools & Citations */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <span className="mb-3 inline-block rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">METHODOLOGY</span>
            <h2 className="text-3xl font-bold tracking-tight">Tools &amp; Citations</h2>
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

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-300">NeoPeptide</span>
          </div>
          <p className="mb-2 text-sm text-gray-500">Automated Neoantigen Vaccine Prediction Pipeline</p>
          <p className="text-xs text-gray-600">
            Developed by <span className="text-gray-400 font-medium">Ravi</span> &amp; <span className="text-gray-400 font-medium">S. Shriya</span>
          </p>
          <p className="mt-2 text-[10px] text-gray-700 italic">
            For educational and research purposes only. Please use external APIs responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}
