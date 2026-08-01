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
- **Browser automation**: Camoufox (anti-detection Firefox) for Steps 9-12
- **ProtParam**: ExPASy CGI API called from Next.js API route, NOT from backend

## File Map
- `src/app/page.tsx` — Landing page
- `src/app/pipeline/page.tsx` — Main pipeline UI (14 steps)
- `src/lib/step8-filter-neoantigens.ts` — `mergeAllToFinalCSV()` (71 columns)
- `src/lib/step12-protparam.ts` — ExPASy ProtParam parser
- `src/lib/mock-data.ts` — Skip-to-step-9 mock data
- `src/app/api/protparam/route.ts` — ProtParam proxy route
- `backend/main.py` — All browser automation endpoints

## Key Conventions
- Tailwind v4: `@import "tailwindcss"`, no `@tailwind` directives
- IPv4-only fetch for IEDB: `src/lib/ipv4-fetch.ts`
- Dummy mode: `SeqRequest.dummy: bool = False`
- AA composition: percentages (count/length × 100), not raw counts
- ExPASy HTML: strip `<strong>` tags before regex parsing
