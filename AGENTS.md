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
- **Frontend**: Next.js (TypeScript, Tailwind v4) on port 3000
- **Backend**: FastAPI (Python) on port 8000
- **Browser automation**: Camoufox (anti-detection Firefox) for Steps 10-12
- **ProtParam**: ExPASy CGI API called from Next.js API route, NOT from backend
- **IEDB**: Chunked submission via `/api/epitopes/chunked` for large sequences
- **Population Coverage**: IEDB standalone tool embedded in backend

## File Map
- `src/app/page.tsx` — Landing page (15-step overview, citations, quick start)
- `src/app/pipeline/page.tsx` — Main pipeline UI (15 steps, stop/resume)
- `src/lib/step5-7-epitopes.ts` — IEDB API calls (chunked, 2h timeout)
- `src/lib/step8-filter-neoantigens.ts` — `mergeAllToFinalCSV()` (72 columns), IC50-based dedup
- `src/lib/step12-protparam.ts` — ExPASy ProtParam parser
- `src/lib/ipv4-fetch.ts` — IPv4-only fetch wrapper (10min socket timeout)
- `src/app/api/epitopes/chunked/route.ts` — Chunked IEDB endpoint (handles 500K+ peptides)
- `src/app/api/pipeline-state/route.ts` — Save/load pipeline state for resume
- `src/app/api/protparam/route.ts` — ProtParam proxy route
- `backend/main.py` — All browser automation endpoints + population coverage

## Key Conventions
- Tailwind v4: `@import "tailwindcss"`, no `@tailwind` directives
- IPv4-only fetch for IEDB: `src/lib/ipv4-fetch.ts`
- Dummy mode: `SeqRequest.dummy: bool = False`
- AA composition: percentages (count/length × 100), not raw counts
- ExPASy HTML: strip `<strong>` tags before regex parsing
- Step 8 dedup: lowest IC50 wins, percentile + score as tiebreakers
- Pipeline state saved to `.pipeline-state/` dir (Docker volume mounted)
