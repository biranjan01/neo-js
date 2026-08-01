# NeoPeptide — Neoantigen Vaccine Prediction Pipeline

Automated 15-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy research.

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/macOS/Linux)
- 4+ GB RAM allocated to Docker

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
  ├── Frontend (Next.js + TypeScript, port 3000)
  │     ├── Landing page with citations & methodology
  │     ├── 15-step pipeline UI with per-step downloads
  │     ├── Stop & Resume functionality
  │     ├── Configurable immunogenicity & IC50 thresholds
  │     ├── cBioPortal integration (26 cancer types)
  │     └── /api/protparam — ExPASy ProtParam proxy
  │
  └── Backend (FastAPI + Python, port 8000)
        ├── POST /api/vaxijen — VaxiJen 2.0 (Camoufox browser automation)
        ├── POST /api/allertop — AllerTOP v2.1 (Camoufox)
        ├── POST /api/toxinpred — ToxinPred3 (Camoufox)
        ├── POST /api/population_coverage — IEDB Population Coverage (standalone)
        ├── POST /api/msa/png — MSA visualization (matplotlib)
        └── POST /api/cbioportal — cBioPortal mutation fetch
```

## Pipeline Steps

| Step | Name | Tool | Purpose |
|------|------|------|---------|
| 1 | Parse COSMIC CSV | Custom | Parse mutation data from COSMIC or cBioPortal |
| 2 | Mutation Frequency | Custom | Rank mutations by patient count & MAF |
| 3 | Reference Sequence | UniProt/Ensembl | Fetch canonical wild-type protein sequence |
| 4 | MSA Alignment | MAFFT (EBI) | Align wild-type vs mutated sequences |
| 5 | MHC-I Binding | NetMHCpan 4.1 EL+BA | Predict MHC Class I epitopes (27 alleles) |
| 6 | MHC-II Binding | NetMHCIIpan 4.1 EL+BA | Predict MHC Class II epitopes (27 alleles) |
| 7 | B-cell Epitopes | BepiPred 3.0 | Predict linear B-cell epitopes |
| 8 | Neoantigen Filter | Custom | Novel-only filtering, IC50-based HLA variant dedup |
| 9 | Pre-filter | Custom | Filter by IC50 < threshold + immunogenicity score |
| 10 | Antigenicity | VaxiJen 2.0 | Predict protective antigen potential |
| 11 | Allergenicity | AllerTOP v2.1 | Predict allergenic potential |
| 12 | Toxicity | ToxinPred 3 | Predict toxicity |
| 13 | Physicochemical | ExPASy ProtParam | MW, pI, instability, GRAVY, half-life, AA composition |
| 14 | Population Coverage | IEDB Standalone | HLA allele frequency across world populations |
| 15 | Consolidate & Export | Custom | 3 final CSVs (MHC-I, MHC-II, B-cell) with 72 columns |

## Key Features

- **Chunked IEDB Processing**: Auto-chunks sequences >2000 aa with overlap, merges results. Handles 500K+ peptides.
- **Stop & Resume**: Stop pipeline mid-run, resume from last saved step. State persisted to disk.
- **IC50-Based Deduplication**: When same peptide binds multiple HLA alleles, keeps the variant with lowest IC50.
- **Configurable Thresholds**: Adjustable immunogenicity score (default ≥0.5) and IC50 (default <500 nM) cutoffs.
- **cBioPortal Integration**: Query mutations for 26 cancer types directly without COSMIC CSV upload.
- **3 Final CSVs**: Separate MHC-I, MHC-II, and B-cell outputs with full 72-column annotation.

## Input

**Option 1: COSMIC CSV upload**
- Upload a COSMIC Mutations Export CSV file

**Option 2: cBioPortal query**
- Select cancer type + enter gene name → fetches mutations automatically

## Output

Three CSV files with 72 columns each:

| Category | Columns |
|----------|---------|
| Binding | Peptide, allele, IC50, percentile, core sequence |
| Immunogenicity | Score, proteasome, TAP, MHC, processing scores |
| Vaccine Properties | VaxiJen score/prediction, AllerTOP prediction, ToxinPred prediction |
| Physicochemical | MW, pI, instability, aliphatic index, GRAVY, extinction, half-life, formula |
| AA Composition | All 20 amino acid percentages |

## Data Sources

| Tool | Citation |
|------|----------|
| IEDB Next-Gen Tools | Vita R, et al. NAR 2019;47(W1):W440-W445 |
| IEDB Population Coverage | Bui HH, et al. Immunogenetics 2006;58(5-6):327-333 |
| VaxiJen v2.0 | Doytchinova IA, Flower DR. BMC Bioinformatics 2007;8:4 |
| AllerTOP v2.1 | Dimitrov I, et al. Bioinformatics 2014;30(4):589-590 |
| ToxinPred v3 | Gupta S, et al. PLoS One 2013;8(11):e80109 |
| MAFFT | Katoh K, Standley DM. Mol Biol Evol 2013;30(4):772-780 |
| ExPASy ProtParam | Gasteiger E, et al. The Proteomics Protocols Handbook, 2005 |
| UniProt | The UniProt Consortium. NAR 2023;51(D1):D483-D492 |
| COSMIC | Forbes SA, et al. NAR 2020;48(D1):D517-D524 |

## Disclaimer

For **educational and research purposes only**. External APIs are provided by their respective institutions — use responsibly and respect rate limits.

## License

Research use only.

---

Curated and developed by **S. Shriya**
