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

          <a href="https://github.com/biranjan01/neopeptide" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-gray-300 transition-all hover:border-white/20 hover:bg-white/[0.05]">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            View on GitHub
          </a>
        </div>
      </header>

      {/* Setup Guide */}
      <section className="relative py-24 px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Setup &amp; Run</h2>
            <p className="mt-3 text-sm text-gray-500">Runs entirely on your machine via Docker. No data leaves your computer.</p>
          </div>

          <div className="space-y-6">

            {/* Step 1: Install Docker */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-sm font-bold text-white">1</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-200">Install Docker</h3>
                  <p className="mt-1 text-sm text-gray-500">Docker runs the pipeline in an isolated container. No Python, Node.js, or other dependencies needed.</p>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl border border-blue-500/10 bg-blue-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                        <span className="text-sm font-medium text-blue-300">Windows</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-400">
                        <li>Download Docker Desktop from <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">docker.com</a></li>
                        <li>Run the installer (.exe file)</li>
                        <li><strong className="text-gray-300">Check &quot;Use WSL 2 instead of Hyper-V&quot;</strong> when prompted</li>
                        <li>Click Install, restart your computer when asked</li>
                        <li>After restart, open Docker Desktop and wait until &quot;Docker Desktop is running&quot; in the system tray</li>
                      </ol>
                    </div>

                    <div className="rounded-xl border border-gray-500/10 bg-gray-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                        <span className="text-sm font-medium text-gray-300">macOS</span>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-400">
                        <li>Download Docker Desktop for Mac (choose Apple Silicon or Intel)</li>
                        <li>Open the .dmg file and drag Docker to Applications</li>
                        <li>Open Docker from Applications, allow permissions</li>
                        <li>Wait until &quot;Docker Desktop is running&quot; in the menu bar</li>
                      </ol>
                    </div>

                    <div className="rounded-xl border border-orange-500/10 bg-orange-500/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.201.996-.054 1.947-.467 2.644-.945.326-.2.586-.468.797-.787.134-.2.27-.468.464-.733.134-.134.313-.268.554-.4.277-.132.632-.2.854-.531.126-.189.174-.4.154-.602a3.05 3.05 0 00-.151-.603c-.26-.6-.652-.956-1.226-1.336-.572-.399-1.307-.753-1.984-1.767-.453-.682-.704-1.497-.85-2.297-.144-.734-.189-1.403-.134-2.005.054-.6.267-1.146.484-1.613.217-.467.397-.832.397-1.16 0-.134-.027-.268-.054-.4a4.12 4.12 0 00-.174-.566c-.134-.334-.268-.534-.464-.733-.199-.199-.464-.334-.854-.468-.399-.134-.914-.2-1.466-.134-.543.064-1.106.267-1.67.465l-.134.067c-.076.067-.134.134-.217.2-.076.067-.134.134-.2.2-.268.267-.554.733-.94 1.066-.399.334-.854.534-1.254.534-.134 0-.268-.027-.4-.067a2.05 2.05 0 00-.464-.067c-.2 0-.399.027-.531.067-.464.134-.854.534-1.32.732-.464.2-1.005.268-1.556.067-.551-.2-1.078-.6-1.729-.732-.651-.134-1.368-.067-2.148.267-.78.334-1.565.932-2.38 1.465-.816.534-1.606.933-2.173.933z"/></svg>
                        <span className="text-sm font-medium text-orange-300">Linux (Ubuntu/Debian)</span>
                      </div>
                      <div className="rounded-lg bg-black/30 p-3 font-mono text-xs text-emerald-400 leading-relaxed">
                        <p>curl -fsSL https://get.docker.com | sh</p>
                        <p className="mt-1">sudo usermod -aG docker $USER</p>
                        <p className="mt-1 text-gray-500"># Log out and back in, then verify</p>
                        <p>docker run hello-world</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3 text-xs text-emerald-300">
                    <strong>Verify:</strong> Open terminal, type <code className="rounded bg-white/5 px-1 py-0.5 text-emerald-400">docker --version</code>. You should see a version number. <strong className="text-amber-300">Allocate at least 4 GB RAM</strong> in Docker Desktop → Settings → Resources.
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Clone & Run */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-sm font-bold text-white">2</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-200">Download &amp; Run the Pipeline</h3>
                  <p className="mt-1 text-sm text-gray-500">Two ways to get the project — pick whichever is easier.</p>

                  <div className="mt-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span className="text-sm font-medium text-emerald-300">Option A: Download ZIP (No Git needed)</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-gray-400">
                      <li>Click <a href="https://github.com/biranjan01/neopeptide/archive/refs/heads/main.zip" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline font-medium">Download ZIP from GitHub</a></li>
                      <li>Extract the ZIP file to your Desktop (or anywhere)</li>
                      <li>Open a terminal and run:</li>
                    </ol>
                    <div className="mt-3 rounded-lg bg-black/30 p-3 font-mono text-xs text-emerald-400">
                      <p>cd ~/Desktop/neopeptide-main</p>
                      <p className="mt-1">docker compose up -d --build</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24"><path d="M22.114 5.014l-3.027-.609-1.343-2.939c-.171-.377-.547-.622-.968-.622H7.224c-.421 0-.797.245-.968.622L4.913 4.405 1.886 5.014c-.484.099-.836.518-.836 1.014v13.661c0 .583.477 1.059 1.064 1.059h19.704c.587 0 1.064-.476 1.064-1.059V6.028c0-.496-.352-.915-.836-1.014zM12 18.732c-3.717 0-6.732-3.015-6.732-6.732S8.283 5.268 12 5.268 18.732 8.283 18.732 12 15.717 18.732 12 18.732z"/></svg>
                      <span className="text-sm font-medium text-gray-300">Option B: Git Clone (requires Git)</span>
                    </div>
                    <div className="rounded-lg bg-black/30 p-3 font-mono text-xs text-emerald-400">
                      <p>git clone https://github.com/biranjan01/neopeptide.git</p>
                      <p className="mt-1">cd neopeptide</p>
                      <p className="mt-1">docker compose up -d --build</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-cyan-500/5 border border-cyan-500/10 p-3 text-xs text-cyan-300">
                    <strong>Then open:</strong> <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">http://localhost:3000</a>
                    <span className="text-gray-500 ml-2">(wait ~30 seconds for first startup)</span>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">First run downloads ~1 GB of dependencies. Subsequent starts take ~10 seconds.</p>
                </div>
              </div>
            </div>

            {/* Step 3: Use the Pipeline */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-sm font-bold text-white">3</div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-gray-200">Run Your Analysis</h3>
                  <p className="mt-1 text-sm text-gray-500">Enter a gene name, provide mutation data, and the 15-step pipeline handles the rest.</p>
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

          {/* Management commands */}
          <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-6">
            <h3 className="text-base font-semibold text-gray-200 mb-4">Management Commands</h3>
            <p className="text-xs text-gray-500 mb-4">Run these in the terminal from the project folder.</p>
            <div className="grid gap-3 sm:grid-cols-2 font-mono text-sm">
              <div className="rounded-lg bg-black/30 p-3">
                <span className="text-gray-500 text-xs">Stop the pipeline</span>
                <p className="text-amber-400">docker compose down</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <span className="text-gray-500 text-xs">Restart (fast, no rebuild)</span>
                <p className="text-amber-400">docker compose up -d</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <span className="text-gray-500 text-xs">View live logs</span>
                <p className="text-amber-400">docker compose logs -f</p>
              </div>
              <div className="rounded-lg bg-black/30 p-3">
                <span className="text-gray-500 text-xs">Full rebuild (after code changes)</span>
                <p className="text-amber-400">docker compose up -d --build</p>
              </div>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="mt-6 rounded-2xl border border-amber-500/10 bg-amber-500/5 p-6">
            <h3 className="text-base font-semibold text-amber-300 mb-4">Troubleshooting</h3>
            <div className="space-y-3 text-xs text-gray-400">
              <div>
                <strong className="text-gray-300">Docker says &quot;not enough memory&quot;:</strong> Open Docker Desktop → Settings → Resources → increase Memory to 4 GB or more.
              </div>
              <div>
                <strong className="text-gray-300">Port 3000 already in use:</strong> Stop the other app using that port, or change the port in <code className="rounded bg-white/5 px-1 py-0.5 text-amber-400">.env</code> file: <code className="rounded bg-white/5 px-1 py-0.5 text-amber-400">FRONTEND_PORT=3001</code>
              </div>
              <div>
                <strong className="text-gray-300">Windows: &quot;docker&quot; command not found:</strong> Make sure Docker Desktop is running (check system tray). Restart PowerShell after installing.
              </div>
              <div>
                <strong className="text-gray-300">Pipeline seems stuck on IEDB:</strong> Large sequences take time. The pipeline auto-chunks sequences &gt;2000 amino acids. Check the progress message in the UI.
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
