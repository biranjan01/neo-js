# NeoPeptide — Docker Setup Guide

**Last updated**: 2026-08-01
**Version**: 2.0

---

## Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- 4+ GB RAM allocated to Docker (Settings → Resources → Advanced)

### Run

```bash
git clone https://github.com/biranjan01/neopeptide.git
cd neopeptide
docker compose up -d --build
```

Open **http://localhost:3000** in your browser.

### Stop / Restart

```bash
docker compose down       # stop containers
docker compose up -d      # restart (no rebuild, ~10s)
```

---

## Platform Notes

| Platform | Requirements | Notes |
|----------|-------------|-------|
| **macOS** | Docker Desktop for Mac | Works on Intel & Apple Silicon |
| **Windows** | Docker Desktop with WSL 2 | Enable WSL 2 backend in Docker Desktop settings. Restart after enabling. |
| **Linux** | Docker Engine + Compose | Run `sudo usermod -aG docker $USER` then relogin |

---

## Build Commands

```bash
docker compose up -d --build            # Full rebuild + start
docker compose up -d --build frontend   # Frontend only
docker compose up -d --build backend    # Backend only
docker compose logs -f frontend         # Check frontend logs
docker compose logs -f backend          # Check backend logs
docker compose down                     # Stop all
```

---

## Architecture

```
Docker Compose
  ├── Frontend (Next.js + TypeScript, port 3000)
  │     ├── Landing page — citations, methodology, quick start guide
  │     ├── Pipeline page — 15-step UI with per-step downloads
  │     ├── Stop & Resume — abort running pipeline, resume from disk
  │     ├── Configurable thresholds — immunogenicity ≥0.5, IC50 <500 nM
  │     ├── cBioPortal — query 26 cancer types directly
  │     ├── MSA visualization — publication-quality alignment PNG
  │     └── /api/protparam — ExPASy ProtParam proxy
  │
  └── Backend (FastAPI + Python, port 8000)
        ├── POST /api/vaxijen — VaxiJen 2.0 (Camoufox browser automation)
        ├── POST /api/allertop — AllerTOP v2.1 (Camoufox, one-by-one)
        ├── POST /api/toxinpred — ToxinPred3 (Camoufox, FASTA format)
        ├── POST /api/population_coverage — IEDB Population Coverage (standalone tool)
        ├── POST /api/msa/png — MSA visualization (matplotlib, Clustal coloring)
        └── POST /api/cbioportal — cBioPortal mutation fetch
```

---

## Pipeline Steps (15 total)

| Step | Name | Tool | Purpose |
|------|------|------|---------|
| 1 | Parse COSMIC CSV | Custom | Parse missense mutations from COSMIC or cBioPortal |
| 2 | Mutation Frequency | Custom | Rank mutations by patient count & MAF, detect hotspots |
| 3 | Reference Sequence | UniProt/Ensembl | Fetch canonical wild-type protein sequence |
| 4 | MSA Alignment | MAFFT (EBI REST) | Align wild-type vs mutated sequences, generate PNG |
| 5 | MHC-I Binding | NetMHCpan 4.1 EL+BA | Predict MHC Class I epitopes (27 alleles, chunked) |
| 6 | MHC-II Binding | NetMHCIIpan 4.1 EL+BA | Predict MHC Class II epitopes (27 alleles, chunked) |
| 7 | B-cell Epitopes | BepiPred 3.0 | Predict linear B-cell epitopes (chunked) |
| 8 | Neoantigen Filter | Custom | Novel-only filtering, IC50-based HLA variant dedup |
| 9 | Pre-filter | Custom | Filter by IC50 < threshold + immunogenicity score |
| 10 | Antigenicity | VaxiJen 2.0 | Predict protective antigen potential (Camoufox) |
| 11 | Allergenicity | AllerTOP v2.1 | Predict allergenic potential (Camoufox) |
| 12 | Toxicity | ToxinPred 3 | Predict toxicity (Camoufox) |
| 13 | Physicochemical | ExPASy ProtParam | MW, pI, instability, GRAVY, half-life, AA composition |
| 14 | Population Coverage | IEDB Standalone | HLA allele frequency across world populations |
| 15 | Consolidate & Export | Custom | 3 final CSVs (MHC-I, MHC-II, B-cell) with 72 columns |

---

## Key Features

### Chunked IEDB Processing (Steps 5-7)
- Sequences >2000 aa are auto-chunked with 20 aa overlap
- Each chunk submitted as separate IEDB job
- Results merged and deduplicated across chunks
- Handles 500K+ peptides

### Stop & Resume
- Red "Stop" button appears during pipeline execution
- Pipeline state saved to `.pipeline-state/` after steps 2, 4, 5
- Resume from last saved step on page reload
- Docker volume ensures persistence across container restarts

### IC50-Based HLA Deduplication (Step 8)
- Same peptide may bind multiple HLA alleles
- Keeps the variant with lowest IC50 (strongest binder)
- Percentile and immunogenicity score used as tiebreakers

### Configurable Thresholds
- **Immunogenicity**: default ≥0.5 (adjustable 0-1)
- **IC50**: default <500 nM (adjustable)
- Affects which peptides pass to VaxiJen/AllerTOP/ToxinPred

### cBioPortal Integration
- Query mutations for 26 cancer types without COSMIC CSV
- Toggle between "Upload COSMIC CSV" and "Query cBioPortal"

---

## Output Format (72 Columns)

### IEDB Epitope Prediction (21 columns)
Peptide, start, end, peptide length, allele, peptide index, median binding percentile, netmhcpan_el core, netmhcpan_el icore, netmhcpan_el score, netmhcpan_el percentile, netmhcpan_ba core, netmhcpan_ba icore, netmhcpan_ba IC50, netmhcpan_ba percentile, immunogenicity score, proteasome score, tap score, mhc score, processing score, processing total score

### VaxiJen (2 columns)
VaxiJen Score, VaxiJen Prediction

### AllerTOP (3 columns)
Most Similar Protein, Allergen, Non-Allergen

### ToxinPred (7 columns)
ML Score, MERCI Score (+ve), MERCI Score (-ve), Hybrid Score, PPV, Toxin, Non-Toxin

### ProtParam (14 columns)
Number of amino acids, Theoretical pI, Molecular weight, Negatively charged residues, Positively charged residues, Instability index, Stability class, Aliphatic index, GRAVY, Extinction coefficient, Abs 0.1%, Estimated half-life, Formula, Total atoms

### AA Composition (20 columns)
Ala (A), Arg (R), Asn (N), Asp (D), Cys (C), Gln (Q), Glu (E), Gly (G), His (H), Ile (I), Leu (L), Lys (K), Met (M), Phe (F), Pro (P), Ser (S), Thr (T), Trp (W), Tyr (Y), Val (V)

---

## Input Data

**Option 1: COSMIC CSV upload**
- Upload a COSmic Mutations Export CSV file

**Option 2: cBioPortal query**
- Select cancer type + enter gene name
- Fetches mutations automatically from cBioPortal API

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` | Backend URL (browser-side) |
| `FRONTEND_PORT` | `3000` | Frontend port |
| `BACKEND_PORT` | `8000` | Backend port |

Copy `.env.example` to `.env` to customize (optional, defaults work).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Docker out of memory | Increase RAM allocation in Docker Desktop settings |
| Frontend can't reach backend | Check `NEXT_PUBLIC_BACKEND_URL` matches backend port |
| IEDB timeout | Large sequences auto-chunk; check logs for progress |
| Camoufox won't start | Ensure Docker has enough resources (4GB+ RAM) |
| Port already in use | Change ports in `.env` or `docker-compose.yml` |
