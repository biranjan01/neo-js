# NeoPeptide — Neoantigen Vaccine Prediction Pipeline

Complete neoepitope vaccine prediction pipeline for cancer immunotherapy research.

**Status**: Full pipeline (Steps 1-14) running on Streamlit Cloud.

## Pipeline Steps

| Step | Tool | Method | Purpose |
|------|------|--------|---------|
| 1 | Custom | Python | Parse COSMIC CSV, filter missense mutations |
| 2 | Custom | Python | Mutation frequency analysis, hotspot detection |
| 3 | UniProt/Ensembl/NCBI | REST API | Fetch reference protein sequences |
| 4 | EBI MAFFT | REST API | Multiple Sequence Alignment |
| 5 | IEDB NetMHCpan 4.1 | REST API | MHC-I epitope prediction (27 alleles, 9-mer) |
| 6 | IEDB NetMHCIIpan 4.1 | REST API | MHC-II epitope prediction (27 alleles, 15-mer) |
| 7 | IEDB BepiPred 3.0 | REST API | Linear B-cell epitope prediction |
| 8 | Custom | Python | Neoantigen filtering (canonical vs mutated) |
| 9 | VaxiJen 2.0 | Camoufox + fetch() | Antigenicity prediction |
| 10 | AllerTOP | Camoufox | Allergenicity prediction |
| 11 | ToxinPred3 | Camoufox | Toxicity prediction |
| 12 | ExPASy ProtParam | REST API + local | Physicochemical properties |
| 13 | Custom | Python | Immunogenicity scoring |
| 14 | Custom | Python | Final consolidation + ZIP download |

## Deployment

### Streamlit Cloud (Full Pipeline)
- Repo: `biranjan01/vaxijen-streamlit`
- URL: `https://neopeptide-8k6mkfhec6jh9mrnyjxtyr.streamlit.app/`
- All 14 steps run server-side
- Camoufox + Xvfb for Cloudflare-protected tools
- Checkpoint/resume for large datasets

### Next.js (Phase 1 Only — Steps 1-8)
- Repo: `biranjan01/neopeptide`
- URL: `https://neopeptide-rho.vercel.app`
- Steps 1-8 only, redirects to Streamlit for Phase 2

## Architecture

```
Streamlit Cloud (single app)
  ├── Steps 1-2: CSV parsing + frequency (pandas)
  ├── Step 3: Reference fetch (UniProt → Ensembl → NCBI)
  ├── Step 4: MSA alignment (EBI MAFFT polling)
  ├── Steps 5-7: IEDB epitope prediction (chunked, 2000aa)
  ├── Step 8: Neoantigen filtering
  ├── Step 9: VaxiJen (Camoufox non-headless + Xvfb)
  ├── Step 10: AllerTOP (Camoufox)
  ├── Step 11: ToxinPred (Camoufox)
  ├── Step 12: ProtParam (ExPASy API + local fallback)
  ├── Step 13: Immunogenicity scoring
  └── Step 14: Consolidation + ZIP download
```

## Large Sequence Handling

Steps 5-7 automatically chunk sequences >2000 aa with 20aa overlap to prevent IEDB timeouts. Chunk results are merged and deduplicated by (peptide, allele) key.

## CSV Format

Your COSMIC mutation file must have these columns:

```
Gene Name,Sample Name,CDS Mutation,AA Mutation
TP53,SAMPLE_001,c.524G>A,p.R175H
```

- **AA Mutation**: Must start with `p.` followed by RefAA, Position, AltAA

## 27 Alleles

**MHC-I (NetMHCpan 4.1)**: HLA-A*01:01, A*02:01, A*02:03, A*02:06, A*03:01, A*11:01, A*23:01, A*24:02, A*26:01, A*30:01, A*30:02, A*31:01, A*32:01, A*33:01, A*68:01, A*68:02, B*07:02, B*08:01, B*15:01, B*35:01, B*40:01, B*44:02, B*44:03, B*51:01, B*53:01, B*57:01, B*58:01

**MHC-II (NetMHCIIpan 4.1)**: DRB1*01:01, DRB1*03:01, DRB1*04:01, DRB1*04:05, DRB1*07:01, DRB1*08:02, DRB1*09:01, DRB1*11:01, DRB1*12:01, DRB1*13:02, DRB1*15:01, DRB3*01:01, DRB3*02:02, DRB4*01:01, DRB5*01:01, DQA1*05:01/DQB1*02:01, DQA1*05:01/DQB1*03:01, DQA1*03:01/DQB1*03:02, DQA1*04:01/DQB1*04:02, DQA1*01:01/DQB1*05:01, DQA1*01:02/DQB1*06:02, DPA1*02:01/DPB1*01:01, DPA1*01:03/DPB1*02:01, DPA1*01:03/DPB1*04:01, DPA1*03:01/DPB1*04:02, DPA1*02:01/DPB1*05:01, DPA1*02:01/DPB1*14:01

## Credits

Srishti Neoepitope Vaccine Prediction System
Managed by S. Shriya
