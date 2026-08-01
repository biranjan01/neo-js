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
| `/api/immunogenicity` | POST | `{ rows: dict[] }` | `{ rows: dict[] }` with scores |
| `/api/consolidate` | POST | `ConsolidateRequest` | `{ zip: base64 }` |
| `/api/msa/png` | POST | `MSARequest` | PNG image |

### Frontend (port 3000)
| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/api/protparam` | POST | `{ peptides: string[] }` | `{ success, results: ProtparamPeptide[] }` |

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
`mergeAllToFinalCSV()` in `src/lib/step8-filter-neoantigens.ts` produces 71-column CSV:
- Columns 1-21: IEDB epitope prediction
- Columns 22-23: VaxiJen (Antigen/Non-Antigen)
- Columns 24-26: Immunogenicity (from IEDB Step 5 scores)
- Columns 27-29: AllerTOP (Most Similar Protein, Allergen, Non-Allergen)
- Column 30: Sequence
- Columns 31-37: ToxinPred
- Column 38: Highlight
- Columns 39-51: ProtParam (MW, pI, stability, etc.)
- Columns 52-71: AA composition (20 amino acids as percentages)

## Common Pitfalls
- `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000` — browser resolves this, NOT Docker internal `backend:8000`
- AllerTOP login requires email field (3 fields, not 2)
- AllerTOP processes one protein per submission — multiple sequences get concatenated
- ProtParam `submitPeptide()` must pass all new fields through, not just the original 10
- Immunogenicity reads `filterResult.mhcI` (local variable), NOT `mhciMutData` (stale React state)
