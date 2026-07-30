# Srishti Neoantigen Pipeline — Web Version

Next.js web application for the Srishti Neoantigen Vaccine Prediction Pipeline.

## Current Steps (1-2)

- **Step 1**: Parse COSMIC CSV, filter missense mutations
- **Step 2**: Mutation frequency analysis, hotspot detection

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## CSV Format

Your COSMIC mutation file must have these columns:

```
Gene Name,Sample Name,CDS Mutation,AA Mutation
TP53,SAMPLE_001,c.524G>A,p.R175H
TP53,SAMPLE_002,c.818G>A,p.R273H
```

- **AA Mutation**: Must start with `p.` followed by RefAA, Position, AltAA (e.g., `p.R175H`)

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Project Structure

```
src/
├── lib/
│   ├── types.ts                    # Core type definitions
│   ├── step1-parse-mutations.ts    # Step 1: CSV parsing
│   └── step2-frequency.ts          # Step 2: Frequency analysis
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Main UI
│   ├── globals.css                 # Global styles
│   └── api/
│       └── process/
│           └── route.ts            # API endpoint
```

## Next Steps

- [ ] Step 3: Fetch reference sequences (UniProt/Ensembl API)
- [ ] Step 4: MSA alignment (EBI MAFFT API)
- [ ] Steps 5-7: Epitope prediction (IEDB API)
- [ ] Step 8: Neoantigen filtering
- [ ] Steps 9-12: Browser automation (needs backend)
- [ ] Steps 13-14: Scoring and consolidation

## Credits

Srishti Neoepitope Vaccine Prediction System
Managed by S. Shriya
