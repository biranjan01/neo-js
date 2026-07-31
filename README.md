# NeoPeptide — Neoantigen Vaccine Prediction Pipeline

Next.js web application for neoepitope vaccine prediction for cancer immunotherapy research.

## Pipeline Steps

| Step | Tool | Status | Purpose |
|------|------|--------|---------|
| 1 | Custom | Done | Parse COSMIC CSV, filter missense mutations |
| 2 | Custom | Done | Mutation frequency analysis, hotspot detection |
| 3 | UniProt/Ensembl | Done | Fetch reference sequences |
| 4 | EBI MAFFT | Done | MSA alignment, browser-driven polling |
| 5 | IEDB NetMHCpan 4.1 | Done | MHC-I epitope prediction (27 alleles, 9-mer) |
| 6 | IEDB NetMHCIIpan 4.1 | Done | MHC-II epitope prediction (27 alleles, 15-mer) |
| 7 | IEDB BepiPred 3.0 | Done | B-cell epitope prediction |
| 8 | Custom | Done | Neoantigen filtering (client-side) |
| 9 | VaxiJen 2.0 | Done | Antigenicity prediction (Camoufox + Xvfb + fetch) |
| 12 | ExPASy ProtParam | Done | Physicochemical properties |

## Deployment

### Frontend (Vercel)
```bash
npm install
npm run dev
# Production: https://neopeptide-rho.vercel.app
```

### VaxiJen Backend (Streamlit Cloud)
- Repo: `biranjan01/vaxijen-streamlit`
- URL: `https://neopeptide-8k6mkfhec6jh9mrnyjxtyr.streamlit.app/`
- Uses Camoufox + Xvfb (non-headless) to bypass Cloudflare Turnstile
- Posts to VaxiJen CGI endpoint via browser `fetch()`
- Supports checkpoint/resume for large datasets

## Architecture

```
User Browser (Vercel)
  │
  ├── Steps 1-4: Serverless API routes (polling EBI MAFFT)
  ├── Steps 5-7: IEDB Next-Gen API (chunked for >2000 aa)
  ├── Step 8: Client-side filtering
  ├── Step 9: Redirect to Streamlit Cloud → Camoufox → VaxiJen CGI
  └── Step 12: ExPASy ProtParam API (concurrent requests)
```

## Large Sequence Handling

Steps 5-7 automatically chunk sequences >2000 aa with 20aa overlap to prevent IEDB timeouts. Chunk results are merged and deduplicated by (peptide, allele) key. No manual intervention needed.

## CSV Format

Your COSMIC mutation file must have these columns:

```
Gene Name,Sample Name,CDS Mutation,AA Mutation
TP53,SAMPLE_001,c.524G>A,p.R175H
```

- **AA Mutation**: Must start with `p.` followed by RefAA, Position, AltAA

## Project Structure

```
neopeptide/
├── src/
│   ├── lib/
│   │   ├── types.ts                    # Core type definitions
│   │   ├── step1-parse-mutations.ts    # CSV parsing
│   │   ├── step2-frequency.ts          # Frequency analysis
│   │   ├── step3-reference.ts          # Reference sequence fetch
│   │   ├── step4-msa.ts                # MSA alignment (EBI MAFFT)
│   │   ├── step5-7-epitopes.ts         # IEDB epitope prediction (chunked)
│   │   ├── step8-filter-neoantigens.ts # Neoantigen filtering
│   │   ├── step9-vaxijen.ts            # VaxiJen client + local fallback
│   │   └── step12-protparam.ts         # ProtParam ExPASy API
│   └── app/
│       ├── page.tsx                    # Main UI
│       └── api/                        # API routes
├── browser-service/                    # VaxiJen Camoufox server
└── package.json
```

## Credits

Srishti Neoepitope Vaccine Prediction System
Managed by S. Shriya
