# NeoPeptide — Neoantigen Vaccine Prediction Pipeline

Automated 14-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy research.

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS/Linux)
- 4+ GB RAM allocated to Docker
- Windows users: WSL2 backend must be enabled (see docker.md)

### Run

```bash
# Clone
git clone https://github.com/biranjan01/neopeptide.git
cd neopeptide

# Build and start (first run ~5 min, subsequent ~10s)
docker compose up -d --build

# Open
http://localhost:3000
```

### Stop / Restart

```bash
docker compose down      # stop
docker compose up -d     # restart (no rebuild)
```

## Architecture

```
Docker Compose
  ├── Frontend (Next.js 16 + TypeScript + Tailwind v4, port 3000)
  │     ├── Landing page with citations & methodology
  │     ├── 14-step pipeline UI with per-step downloads
  │     ├── Mutation visualization — linear sequence with colored highlights + .txt download
  │     ├── Stop & Resume functionality
  │     ├── Configurable IC50 threshold (default <500 nM)
  │     ├── cBioPortal integration (26 cancer types)
  │     └── /api/protparam — ExPASy ProtParam proxy
  │
  └── Backend (FastAPI + Python 3.11, port 8000)
        ├── POST /api/immunogenicity — VaxiJen 3.0 (FASTA upload, batches of 100)
        ├── POST /api/vaxijen — VaxiJen 3.0 (Camoufox, antigenicity)
        ├── POST /api/allertop — AllerTOP v2.1 (Camoufox, one-by-one)
        ├── POST /api/toxinpred — ToxinPred3 (Camoufox, FASTA format)
        ├── POST /api/population_coverage — IEDB Population Coverage (standalone)
        └── POST /api/cbioportal — cBioPortal mutation fetch
```

## Pipeline Steps

| Step | Name | Tool | Purpose |
|------|------|------|---------|
| 1 | Parse COSMIC CSV | Custom | Parse mutation data from COSMIC or cBioPortal |
| 2 | Mutation Frequency | Custom | Rank mutations by patient count & MAF, detect hotspots |
| 3 | Reference Sequence | UniProt/Ensembl | Fetch canonical wild-type protein; generate mutated sequence |
| 4 | MHC-I Binding | NetMHCpan 4.1 EL+BA | Predict MHC Class I epitopes (27 alleles, chunked) |
| 5 | MHC-II Binding | NetMHCIIpan 4.1 EL+BA | Predict MHC Class II epitopes (27 alleles, chunked) |
| 6 | B-cell Epitopes | BepiPred 3.0 | Predict linear B-cell epitopes (chunked) |
| 7 | Neoantigen Filter | Custom | Novel-only filtering, IC50-based HLA variant dedup |
| 8 | Pre-filter + Immunogenicity | VaxiJen 3.0 | FASTA upload in batches of 100; B-cell peptides pass if IMMUNOGEN |
| 9 | Antigenicity | VaxiJen 3.0 | Predict protective antigen potential (Camoufox) |
| 10 | Allergenicity | AllerTOP v2.1 | Predict allergenic potential (Camoufox) |
| 11 | Toxicity | ToxinPred 3 | Predict toxicity (Camoufox) |
| 12 | Physicochemical | ExPASy ProtParam | MW, pI, instability, GRAVY, half-life, AA composition |
| 13 | Population Coverage | IEDB Standalone | HLA allele frequency across world populations |
| 14 | Consolidate & Export | Custom | 3 final CSVs (MHC-I, MHC-II, B-cell) with 72 columns |

## Key Features

- **Combined MHC-I + MHC-II IEDB Call**: Single API call to `/api/epitopes/combined` returns both MHC-I and MHC-II predictions together. Fewer HTTP requests, less load on IEDB.
- **Mutation Visualization**: Linear amino acid sequence display with position numbers. Mutated positions highlighted in amber/orange. Reference vs mutated sequence comparison. Mutation summary table. Downloadable `.txt` file with all mutation data.
- **Chunked IEDB Processing**: Auto-chunks sequences >2000 aa with overlap, merges results. Handles 500K+ peptides via IEDB Next-Gen Tools API (`https://api-nextgen-tools.iedb.org/api/v1`).
- **VaxiJen 3.0 FASTA Upload**: Uploads FASTA file via browser file input. 100-sequence batch limit; backend auto-chunks larger sets. ~53s per 100 peptides.
- **Stop & Resume**: Stop pipeline mid-run, resume from last saved step. State persisted to `.pipeline-state/` directory.
- **IC50-Based Deduplication**: When same peptide binds multiple HLA alleles, keeps the variant with lowest IC50.
- **Smart Pre-filter**: B-cell peptides (no IC50) pass if IMMUNOGEN; MHC peptides require IMMUNOGEN + IC50 < threshold.
- **Mutated Sequence Generation**: Corrects COSMIC Ref_AA to wild-type, picks highest-frequency Alt_AA, handles compound mutations.
- **cBioPortal Integration**: Query mutations for 26 cancer types directly without COSMIC CSV upload.
- **3 Final CSVs**: Separate MHC-I, MHC-II, and B-cell outputs with full 72-column annotation.

## Input

**Option 1: COSMIC CSV upload**
- Upload a COSMIC Mutations Export CSV file
- Note: COSMIC Ref_AA values are often wrong for compound mutations (~57%); pipeline corrects this automatically

**Option 2: cBioPortal query**
- Select cancer type + enter gene name → fetches mutations automatically

## Output

Three CSV files with 72 columns each:

| Category | Columns |
|----------|---------|
| Binding | Peptide, allele, IC50, percentile, core sequence (21 cols) |
| Immunogenicity | VaxiJen score/prediction, immunogenicity score/class (4 cols) |
| Vaccine Properties | AllerTOP prediction, ToxinPred prediction (10 cols) |
| Physicochemical | MW, pI, instability, aliphatic index, GRAVY, extinction, half-life, formula (14 cols) |
| AA Composition | All 20 amino acid percentages (20 cols) |
| Sequence | Peptide sequence (1 col) |

## Data Sources

| Tool | Citation |
|------|----------|
| IEDB Next-Gen Tools | Vita R, et al. NAR 2019;47(W1):W440-W445 |
| IEDB Population Coverage | Bui HH, et al. Immunogenetics 2006;58(5-6):327-333 |
| VaxiJen v3.0 | Doytchinova IA, Flower DR. BMC Bioinformatics 2007;8:4 |
| AllerTOP v2.1 | Dimitrov I, et al. Bioinformatics 2014;30(4):589-590 |
| ToxinPred v3 | Gupta S, et al. PLoS One 2013;8(11):e80109 |
| MAFFT | Katoh K, Standley DM. Mol Biol Evol 2013;30(4):772-780 |
| ExPASy ProtParam | Gasteiger E, et al. The Proteomics Protocols Handbook, 2005 |
| UniProt | The UniProt Consortium. NAR 2023;51(D1):D483-D492 |
| COSMIC | Forbes SA, et al. NAR 2020;48(D1):D517-D524 |

## Performance

| Peptides | Step 8 (Immunogenicity) |
|----------|------------------------|
| 100 | ~53 seconds |
| 250 | ~2.5 minutes |
| 763 | ~5 minutes |

## Platform Notes

- **macOS**: Works out of the box (Intel & Apple Silicon)
- **Windows**: Requires WSL2 backend enabled in Docker Desktop. Camoufox (browser automation in Steps 9-11) will fail without it. Enable: Docker Desktop → Settings → General → "Use the WSL 2 based engine".
- **Linux**: Standard Docker setup

## Disclaimer

For **educational and research purposes only**. External APIs are provided by their respective institutions — use responsibly and respect rate limits.

## License

Research use only.

---

Curated and developed by **S. Shriya**
