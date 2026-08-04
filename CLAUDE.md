# NeoPeptide Development Guide

## Project Overview
Neoantigen vaccine prediction pipeline — Docker Compose with Next.js frontend (port 3000) + Python FastAPI backend (port 8000). Automated 15-step computational pipeline for neoantigen vaccine candidate identification in cancer immunotherapy research.

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
- **Browser automation**: Camoufox (anti-detection Firefox) for Steps 9-12
- **IEDB processing**: Chunked submission (2000 aa chunks, 20 aa overlap) for large sequences
- **Immunogenicity**: VaxiJen 3.0 with FASTA file upload, 100-sequence batch limit
- **ProtParam**: ExPASy CGI API called from Next.js API route (`/api/protparam`)
- **Population Coverage**: IEDB standalone tool embedded in backend
- **IPv4-only fetch**: Custom `ipv4Fetch` wrapper for IEDB API
- **Persistence**: Pipeline state saved to `.pipeline-state/` directory (Docker volume)

## Code Conventions
- **Frontend**: TypeScript, Tailwind v4 (`@import "tailwindcss"`), no `@tailwind` directives
- **Backend**: Python FastAPI, Camoufox for browser automation
- **Docker**: Debian bookworm, `libasound2t64`, `output: "standalone"` in next.config.ts
- **IPv4**: Custom `ipv4Fetch` wrapper using Node.js `https` with `family: 4` for IEDB API
- **No biopython** — ExPASy ProtParam called via REST API, not computed locally
- **Dummy mode**: `SeqRequest.dummy: bool = False` available on all browser endpoints

## API Endpoints

### Backend (port 8000)
| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/immunogenicity` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with score + prediction (VaxiJen 3.0, batches of 100) |
| `/api/vaxijen` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with score + prediction |
| `/api/allertop` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with prediction + similar_protein |
| `/api/toxinpred` | POST | `{ sequences: string[], dummy: bool }` | `StepResult[]` with prediction |
| `/api/immunogenicity` (scoring) | POST | `{ rows: dict[] }` | Immunogenicity score + class (High/Medium/Low) |
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
| `/api/reference` | POST | `{ geneName, missenseCSV, frequencyCSV }` | Reference + mutated sequences |
| `/api/msa/submit` | POST | sequences | `{ jobId }` |
| `/api/msa/poll` | GET | jobId | `{ status, alignment, stats }` |

## Pipeline Steps (15 total)

| Step | Name | Tool | Notes |
|------|------|------|-------|
| 1 | Parse COSMIC CSV | Custom | Supports COSMIC CSV or cBioPortal data; `parseAAMutation()` extracts Ref_AA from input string (may be wrong for compound mutations) |
| 2 | Mutation Frequency | Custom | Hotspot detection, MAF ranking; frequency CSV used for mutated sequence generation |
| 3 | Reference Sequence | UniProt/Ensembl | `organism_id:9606` (not `organism`); `generateMutatedSequence` corrects Ref_AA to wild-type, picks highest-frequency Alt_AA, skips stop codons |
| 4 | MSA Alignment | MAFFT (EBI) | REST API polling, PNG visualization; `------` gaps in output are alignment gaps |
| 5 | MHC-I Binding | NetMHCpan 4.1 | EL+BA predictors, 27 alleles, chunked via `/api/epitopes/chunked`; returns `netmhcpan_ba_ic50` |
| 6 | MHC-II Binding | NetMHCIIpan 4.1 | EL+BA predictors, 27 alleles, chunked; returns `netmhcpan_ba_ic50` |
| 7 | B-cell Epitopes | BepiPred 3.0 | 10-25 aa peptides only, chunked; results in `residue_table` (not `peptide_table`); epitopes extracted from contiguous `'E'` assignments |
| 8 | Neoantigen Filter | Custom | Novel-only + IC50-based HLA dedup; lowest IC50 wins, percentile + score as tiebreakers |
| 9 | Pre-filter + Immunogenicity | VaxiJen 3.0 | FASTA upload in batches of 100; B-cell peptides (no IC50) pass if IMMUNOGEN; MHC peptides need IMMUNOGEN + IC50 < threshold |
| 10 | Antigenicity | VaxiJen 3.0 | Camoufox form click submission (single peptides from pre-filtered set) |
| 11 | Allergenicity | AllerTOP v2.1 | Camoufox, one-by-one, register+login (3 fields: username, email, password) |
| 12 | Toxicity | ToxinPred 3 | Camoufox, FASTA format (`>seq{i}\n{s}`) |
| 13 | Physicochemical | ExPASy ProtParam | 15 fields + 20 AA composition; called from `/api/protparam` |
| 14 | Population Coverage | IEDB Standalone | World population coverage; tool embedded in `backend/population_coverage/` |
| 15 | Consolidate & Export | Custom | 3 CSVs: MHC-I, MHC-II, B-cell (72 cols each) |

## Browser Automation Rules
1. **VaxiJen 3.0**: Register+login per session, FASTA file upload via `input[type='file']`, 100-sequence batch limit
2. **VaxiJen 3.0 URL**: `https://www.ddg-pharmfac.net/vaxijen3/home/`
3. **VaxiJen 3.0 Signup**: `https://www.ddg-pharmfac.net/vaxijen3/accounts/signup/`
4. **VaxiJen 3.0 Login**: `https://www.ddg-pharmfac.net/vaxijen3/accounts/login/?next=/vaxijen3/`
5. **AllerTOP**: One peptide at a time, register+login first (3 fields: username, email, password), use `type()` not `fill()` for login
6. **AllerTOP URL**: `https://www.ddg-pharmfac.net/allertop_v2/`
7. **ToxinPred**: FASTA format with `>seq{i}\n{s}` headers — multi-sequence works
8. **ToxinPred URL**: `https://webs.iiitd.edu.in/raghava/toxinpred3/prediction.php`
9. All tools use Camoufox (anti-detection Firefox) via `AsyncCamoufox(headless=True)`
10. Cloudflare bypass: wait for title to not contain "just a moment", then `networkidle`

## IEDB Next-Gen Tools API
- **URL**: `https://api-nextgen-tools.iedb.org/api/v1`
- Requests both `netmhcpan_el` AND `netmhcpan_ba` predictors
- Returns `netmhcpan_ba_ic50` column (IC50 in nM) — used for binding classification
- MHC-I: 27 HLA-A/B alleles
- MHC-II: 27 HLA-DRB/DQA/DQB/DPA/DPB alleles
- B-cell: BepiPred 3.0 linear epitope prediction

## B-cell Epitope Extraction
- IEDB B-cell results return `residue_table` and `linear_epitope_table`, NOT `peptide_table`
- `iedbPost` in `src/lib/step5-7-epitopes.ts` handles all3 table types
- Epitopes extracted from `residue_table` by finding contiguous `'E'` (epitope) assignments with length >= 8

## Mutated Sequence Generation (Step 3)
- `generateMutatedSequence()` in `src/lib/step3-fetch-reference.ts`
- Corrects Ref_CSV's Ref_AA to match actual wild-type reference
- Groups mutations by position, picks highest-frequency Alt_AA from frequency CSV
- Skips stop codons (`*`)
- Compound mutations (e.g., R→H when wild-type is L) treated as L→H
- Called from `/api/reference` route with `frequencyCSV` parameter
- **COSMIC Ref_AA Bug**: `parseAAMutation()` in step1 extracts Ref_AA from input string without validating against reference; 57% of entries have wrong Ref_AA due to compound mutations

## ExPASy ProtParam
- **CGI endpoint**: `https://web.expasy.org/cgi-bin/protparam/protparam` (NOT the form page)
- HTML wraps labels in `<strong>` tags — strip before regex matching
- Returns: AA count, pI, MW, charged residues, instability, aliphatic, GRAVY, extinction, half-life, formula, total atoms, AA composition
- Called from Next.js API route `/api/protparam`, NOT from backend

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
- Columns 71-72: Immunogenicity (score + class)

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
- VaxiJen 3.0 has 100-sequence batch limit — >100 hangs forever
- B-cell peptides have no IC50 — pre-filter must not require IC50 for them
- VaxiJen result format: `Results for protein seqN: Probable IMMUNOGEN/NON-IMMUNOGEN with a probability of X%`
- Camoufox on Windows requires WSL2 backend enabled in Docker Desktop

## TP53 Reference Notes
- TP53 wild-type is 393 aa (UniProt P04637)
- `------` in MSA output is alignment gap from MAFFT (Step 4), normal
- User's manually curated mutated sequence (230 mutations) could not be generated from provided COSMIC files — 33 Alt_AAs don't exist in either COSMIC file
