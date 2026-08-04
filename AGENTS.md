<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# NeoPeptide Agent Rules

## Build Commands
```bash
docker compose up -d --build        # Full rebuild + start
docker compose up -d --build frontend  # Frontend only
docker compose up -d --build backend   # Backend only
npm run build                        # Next.js build (check before Docker)
```

## Architecture
- **Frontend**: Next.js 16 (TypeScript, Tailwind v4) on port 3000
- **Backend**: FastAPI (Python 3.11) on port 8000
- **Browser automation**: Camoufox (anti-detection Firefox) for Steps 9-11
- **ProtParam**: ExPASy CGI API called from Next.js API route (`/api/protparam`), NOT from backend
- **IEDB**: Combined MHC-I+II call via `/api/epitopes/combined` for Step 4-5; chunked via `/api/epitopes/chunked` for Step 6
- **Population Coverage**: IEDB standalone tool embedded in backend
- **Immunogenicity**: VaxiJen 3.0 with Camoufox, FASTA file upload, 100-sequence batch limit
- **IPv4-only fetch**: Custom `ipv4Fetch` wrapper for IEDB API (`src/lib/ipv4-fetch.ts`)

## File Map
- `src/app/page.tsx` — Landing page (14-step overview, citations, quick start)
- `src/app/pipeline/page.tsx` — Main pipeline UI (14 steps, stop/resume, mutation display, .txt download)
- `src/lib/step1-parse-mutations.ts` — COSMIC/cBioPortal CSV parser
- `src/lib/step2-frequency.ts` — Mutation frequency analysis
- `src/lib/step3-fetch-reference.ts` — UniProt reference + mutated sequence generation + mutation position tracking
- `src/lib/step5-7-epitopes.ts` — IEDB API calls: `step4_5MHCIAndII()` combined, `step6_BCell()` chunked
- `src/lib/step8-filter-neoantigens.ts` — `mergeAllToFinalCSV()` (72 columns), IC50-based dedup
- `src/lib/step12-protparam.ts` — ExPASy ProtParam parser
- `src/lib/ipv4-fetch.ts` — IPv4-only fetch wrapper (10min socket timeout)
- `src/app/api/epitopes/combined/route.ts` — Combined MHC-I+II endpoint (Steps 4-5)
- `src/app/api/epitopes/chunked/route.ts` — Chunked IEDB endpoint for B-cell (Step 6)
- `src/app/api/pipeline-state/route.ts` — Save/load pipeline state for resume
- `src/app/api/protparam/route.ts` — ProtParam proxy route
- `src/app/api/reference/route.ts` — Reference + mutated sequence generation
- `backend/main.py` — All browser automation endpoints + population coverage
- `backend/population_coverage/` — IEDB population coverage tool (standalone)

## Key Conventions
- Tailwind v4: `@import "tailwindcss"`, no `@tailwind` directives
- IPv4-only fetch for IEDB: `src/lib/ipv4-fetch.ts`
- Dummy mode: `SeqRequest.dummy: bool = False` (available on all browser endpoints)
- AA composition: percentages (count/length × 100), not raw counts
- ExPASy HTML: strip `<strong>` tags before regex parsing
- Step 7 dedup: lowest IC50 wins, percentile + score as tiebreakers
- Pipeline state saved to `.pipeline-state/` dir (Docker volume mounted)
- VaxiJen 3.0: register+login per session, FASTA upload, 100-sequence batch limit
- B-cell pre-filter: passes IMMUNOGEN peptides without IC50 check (B-cell peptides have no IC50)

## IEDB Next-Gen Tools API
- **URL**: `https://api-nextgen-tools.iedb.org/api/v1`
- **Combined endpoint**: `/api/epitopes/combined` — returns both MHC-I and MHC-II in single call
- Requests both `netmhcpan_el` AND `netmhcpan_ba` predictors
- Returns `netmhcpan_ba_ic50` column (IC50 in nM)
- MHC-I: 27 HLA-A/B alleles via `MHC_I_27`
- MHC-II: 27 HLA-DRB/DQA/DQB/DPA/DPB alleles via `MHC_II_27`

## B-cell Epitope Extraction (Step 6)
- Results return `residue_table` and `linear_epitope_table`, NOT `peptide_table`
- Epitopes extracted from `residue_table` by finding contiguous `'E'` (epitope) assignments
- Minimum length: 8 residues
- IEDB endpoint handles all 3 result table types

## Mutated Sequence Generation (Step 3)
- Corrects Ref_AA to match actual wild-type reference (COSMIC Ref_AA often wrong due to compound mutations)
- Groups mutations by position, picks highest-frequency Alt_AA from frequency CSV
- Skips stop codons (`*`)
- Compound mutations (e.g., R→H when wild-type is L) treated as L→H
- 57% of COSMIC entries have wrong Ref_AA (traced to `parseAAMutation()` in step1)
- **Mutation position tracking**: Computes ref vs mut sequence difference, stores positions in `mutationPositions` Map

## Mutation Visualization
- Linear sequence display with position numbers (every 10th position labeled)
- Amber/orange background on mutated positions
- Mutation summary table: position, reference AA, mutated AA
- Downloadable `.txt` file with: position numbers, ref sequence, mut sequence, mutation summary
- Frontend computes mutation positions from ref vs mut sequences

## VaxiJen 3.0 Immunogenicity (Step 8)
- **URL**: `https://www.ddg-pharmfac.net/vaxijen3/home/`
- Requires account registration + login (auto-created per session)
- **FASTA file upload** via `input[type='file']` (NOT textarea for large batches)
- **100-sequence batch limit** — >100 sequences hangs forever
- Backend chunks into batches of 100, uploads each separately
- Result format: `Results for protein seqN: Probable IMMUNOGEN/NON-IMMUNOGEN with a probability of X%`
- Frontend timeout: 3,600,000ms (1 hour)
- ~53 seconds per batch of 100

## Step 8 Pre-filter Logic
- **MHC peptides** (have IC50): require `IMMUNOGEN` AND `IC50 < threshold`
- **B-cell peptides** (no IC50): require `IMMUNOGEN` only
- Previously required IC50 for all peptides, which dropped all B-cell peptides

## Windows Docker Compatibility
- Camoufox may fail on Windows without WSL2 backend
- Enable in Docker Desktop → Settings → General → "Use the WSL 2 based engine"
- Install WSL2: `wsl --install` in PowerShell
- Steps 9-11 have dummy mode as fallback if Camoufox can't launch
