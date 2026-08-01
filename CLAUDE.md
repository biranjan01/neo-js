# NeoPeptide Development Guide

## Project Overview
Neoantigen vaccine prediction pipeline — Docker Compose with Next.js frontend (port 3000) + Python FastAPI backend (port 8000).

## Build & Run
```bash
# Build and start both containers
docker compose up -d --build

# Rebuild frontend only
docker compose up -d --build frontend

# Rebuild backend only
docker compose up -d --build backend

# Check logs
docker compose logs -f frontend
docker compose logs -f backend

# Stop
docker compose down
```

## Architecture
- **Frontend**: Next.js 16 (TypeScript, Tailwind v4)
- **Backend**: FastAPI (Python 3.11)
- **Browser automation**: Camoufox (anti-detection Firefox) for Steps 10-12
- **IEDB processing**: Chunked submission (2000 aa chunks, 20 aa overlap) for large sequences
- **Persistence**: Pipeline state saved to `.pipeline-state/` directory (Docker volume)

## Code Conventions
- **Frontend**: TypeScript, Tailwind v4 (`@import "tailwindcss"`), no `@tailwind` directives
- **Backend**: Python FastAPI, Camoufox for browser automation
- **Docker**: Debian bookworm, `libasound2t64`, `output: "standalone"` in next.config.ts
- **IPv4**: Custom `ipv4Fetch` wrapper using Node.js `https` with `family: 4` for IEDB API
- **No biopython** — ExPASy ProtParam called via REST API, not computed locally

## API Endpoints

### Backend (port 8000)
| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/vaxijen` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with score + prediction |
| `/api/allertop` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with prediction + similar_protein |
| `/api/toxinpred` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with prediction |
| `/api/population_coverage` | POST | `{ epitope_alleles, population, mhc_class }` | Summary + bar chart PNGs |
| `/api/msa/png` | POST | `MSARequest` | PNG image |
| `/api/cbioportal` | POST | `{ gene, cancer_type }` | `{ csv }` |

### Frontend (port 3000)
| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/protparam` | POST | `{ peptides: string[] }` | `{ success, results: ProtparamPeptide[] }` |
| `/api/epitopes/chunked` | POST | `{ geneName, canonicalSeq, mutatedSeq, step }` | `{ canonical, mutated }` with full IEDB results |
| `/api/pipeline-state` | GET/POST/DELETE | gene name | Save/load/delete pipeline state |
| `/api/process` | POST | CSV file or content | Parsed mutations + stats |
| `/api/reference` | POST | `{ geneName, missenseCSV }` | Reference + mutated sequences |
| `/api/msa/submit` | POST | sequences | `{ jobId }` |
| `/api/msa/poll` | GET | jobId | `{ status, alignment, stats }` |

## Pipeline Steps (15 total)

| Step | Name | Tool | Notes |
|------|------|------|-------|
| 1 | Parse COSMIC CSV | Custom | Supports COSMIC CSV or cBioPortal data |
| 2 | Mutation Frequency | Custom | Hotspot detection, MAF ranking |
| 3 | Reference Sequence | UniProt/Ensembl | `organism_id:9606` (not `organism`) |
| 4 | MSA Alignment | MAFFT (EBI) | REST API polling, PNG visualization |
| 5 | MHC-I Binding | NetMHCpan 4.1 | EL+BA predictors, 27 alleles, chunked |
| 6 | MHC-II Binding | NetMHCIIpan 4.1 | EL+BA predictors, 27 alleles, chunked |
| 7 | B-cell Epitopes | BepiPred 3.0 | 10-25 aa peptides only, chunked |
| 8 | Neoantigen Filter | Custom | Novel-only + IC50-based HLA dedup |
| 9 | Pre-filter | Custom | IC50 < threshold + immunogenicity ≥ threshold |
| 10 | Antigenicity | VaxiJen 2.0 | Camoufox form click submission |
| 11 | Allergenicity | AllerTOP v2.1 | Camoufox, one-by-one, register+login |
| 12 | Toxicity | ToxinPred 3 | Camoufox, FASTA format |
| 13 | Physicochemical | ExPASy ProtParam | 15 fields + 20 AA composition |
| 14 | Population Coverage | IEDB Standalone | World population coverage |
| 15 | Consolidate & Export | Custom | 3 CSVs: MHC-I, MHC-II, B-cell (72 cols each) |

## Browser Automation Rules
1. **VaxiJen**: Form click submission, NOT `fetch()` — fetch loses Cloudflare cookies
2. **AllerTOP**: One peptide at a time, register+login first (3 fields: username, email, password), use `type()` not `fill()` for login
3. **ToxinPred**: FASTA format with `>seq{i}\n{s}` headers — multi-sequence works
4. All tools use Camoufox (anti-detection Firefox) via `AsyncCamoufox(headless=True)`
5. Cloudflare bypass: wait for title to not contain "just a moment", then `networkidle`

## ExPASy ProtParam
- **CGI endpoint**: `https://web.expasy.org/cgi-bin/protparam/protparam` (NOT the form page)
- HTML wraps labels in `<strong>` tags — strip before regex matching
- Returns: AA count, pI, MW, charged residues, instability, aliphatic, GRAVY, extinction, half-life, formula, total atoms, AA composition

## Merge Function
`mergeAllToFinalCSV()` in `src/lib/step8-filter-neoantigens.ts` produces 72-column CSV:
- Columns 1-21: IEDB epitope prediction (includes `netmhcpan_ba_ic50`)
- Columns 22-23: VaxiJen (Score + Prediction)
- Columns 24-26: AllerTOP (Most Similar Protein, Allergen, Non-Allergen)
- Column 27: Sequence
- Columns 28-34: ToxinPred
- Column 35: Highlight
- Columns 36-50: ProtParam (15 fields)
- Columns 51-70: AA composition (20 amino acids as percentages)

## IEDB Timeouts (for 500K+ peptides)
- `ipv4-fetch` socket timeout: 600s (10 min)
- `iedbPost` overall timeout: 7200s (2 hours)
- `iedbPost` submit timeout: 600s (10 min)
- `iedbPost` poll interval: 10s → 60s exponential backoff
- Frontend poll attempts: 300 × 10-30s (~25 min)

## Common Pitfalls
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` — browser resolves this, NOT Docker internal `backend:8000`
- AllerTOP login requires email field (3 fields, not 2)
- AllerTOP processes one protein per submission — multiple sequences get concatenated
- ProtParam `submitPeptide()` must pass all new fields through, not just the original 10
- Immunogenicity reads `filterResult.mhcI` (local variable), NOT `mhciMutData` (stale React state)
- Step 8 dedup: keeps peptide with lowest IC50 across HLA variants
