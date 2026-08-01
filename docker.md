# NeoPeptide — Pipeline Progress

**Status**: All steps complete. Docker cross-platform ready.
**Last updated**: 2026-08-01

---

## Pipeline Steps

| Step | Tool | Status | Notes |
|------|------|--------|-------|
| 1 | Parse COSMIC CSV | ✅ Complete | Missense mutation parsing |
| 2 | Mutation Frequency | ✅ Complete | Hotspot detection |
| 3 | Fetch Reference | ✅ Complete | UniProt/Ensembl/NCBI |
| 4 | MSA Alignment (MAFFT) | ✅ Complete | EBI MAFFT REST API — **pending UI edits** |
| 5 | MHC-I Binding | ✅ Complete | NetMHCpan 4.1, 27 alleles |
| 6 | MHC-II Binding | ✅ Complete | NetMHCIIpan 4.1, 27 alleles |
| 7 | B-cell Epitopes | ✅ Complete | BepiPred 3.0 |
| 8 | Neoantigen Filtering | ✅ Complete | Canonical vs mutated dedup |
| 9 | VaxiJen | ✅ Complete | Camoufox form submit, dummy mode |
| 10 | AllerTOP | ✅ Complete | Camoufox one-by-one, login, similar protein |
| 11 | ToxinPred | ✅ Complete | Camoufox FASTA, Hybrid method |
| 12 | ProtParam | ✅ Complete | ExPASy CGI, 15 fields, AA% composition |
| 13 | Immunogenicity | ✅ Complete | IEDB scores from Step 5 (local var, not stale state) |
| 14 | Consolidate & Export | ✅ Complete | 72-column merged CSV |

---

## Final CSV Format (72 Columns)

### Steps 1–8: IEDB Epitope Prediction (21 columns)
Peptide, start, end, peptide length, allele, peptide index, median binding percentile, netmhcpan_el core, netmhcpan_el icore, netmhcpan_el score, netmhcpan_el percentile, netmhcpan_ba core, netmhcpan_ba icore, netmhcpan_ba IC50, netmhcpan_ba percentile, immunogenicity score, proteasome score, tap score, mhc score, processing score, processing total score

### Step 9: VaxiJen (2 columns)
VaxiJen Score, VaxiJen Prediction (ANTIGEN / NON-ANTIGEN)

### Step 13: Immunogenicity (3 columns)
Immunogen, Non-Immunogen, Probability

### Step 10: AllerTOP (3 columns)
Most Similar Protein, Allergen, Non-Allergen

### Sequence (1 column)
Sequence

### Step 11: ToxinPred (7 columns)
ML Score, MERCI Score (+ve), MERCI Score (-ve), Hybrid Score, PPV, Toxin, Non-Toxin

### Highlight (1 column)
Highlight

### Step 12: ProtParam (14 columns)
Number of amino acids, Theoretical pI, Molecular weight, Negatively charged residues, Positively charged residues, Instability index, Stability class, Aliphatic index, GRAVY, Extinction coefficient, Abs 0.1%, Estimated half-life, Formula, Total atoms

### AA Composition (20 columns)
Ala (A), Arg (R), Asn (N), Asp (D), Cys (C), Gln (Q), Glu (E), Gly (G), His (H), Ile (I), Leu (L), Lys (K), Met (M), Phe (F), Pro (P), Ser (S), Thr (T), Trp (W), Tyr (Y), Val (V)

---

## Architecture

```
Docker Compose
  ├── Frontend (Next.js, port 3000)
  │     ├── Landing page (/) — "Vaccine Design", citations, "Curated by S. Shriya"
  │     ├── Pipeline page (/pipeline) — 14-step UI
  │     ├── Skip-to-Step-9 mode — mock data for Steps 1-8 (default ON)
  │     ├── Dummy mode — instant mock for Steps 9-11 (default ON)
  │     └── /api/protparam — ExPASy ProtParam proxy
  │
  └── Backend (FastAPI, port 8000)
        ├── POST /api/vaxijen — VaxiJen 2.0 (Camoufox, form click, one-by-one)
        ├── POST /api/allertop — AllerTOP v2.1 (Camoufox, one-by-one, login)
        ├── POST /api/toxinpred — ToxinPred3 (Camoufox, FASTA)
        ├── POST /api/immunogenicity — IEDB immunogenicity scores
        ├── POST /api/consolidate — ZIP export
        └── POST /api/msa/png — MSA visualization (matplotlib)
```

---

## Build Commands
```bash
docker compose up -d --build          # Full rebuild
docker compose up -d --build frontend # Frontend only
docker compose up -d --build backend  # Backend only
docker compose logs -f frontend       # Check logs
docker compose down                   # Stop
```

### Quick Start
```bash
cp .env.example .env                  # Create config (optional, defaults work)
docker compose up -d --build          # Build and start
```

### Platform Notes
| Platform | Docker Desktop | Notes |
|----------|---------------|-------|
| **macOS** | Docker Desktop for Mac | Works out of the box (Intel/Apple Silicon) |
| **Windows** | Docker Desktop for WSL2 | Enable WSL2 backend in Docker Desktop settings |
| **Linux** | Docker Engine + Compose | `sudo usermod -aG docker $USER` then relogin |

All platforms: `http://localhost:3000` (frontend) and `http://localhost:8000` (backend).

---

## Key Implementation Notes

### VaxiJen (Step 9)
- Must use **form click submission**, NOT `fetch()` — fetch loses Cloudflare cookies
- Navigate to form → wait for Cloudflare → fill textarea → select Tumour → click submit
- Each peptide requires fresh page navigation + form submission
- Retry logic for failed peptides
- Dummy mode: `random.uniform(0.2, 2.5)` score, threshold 0.5

### AllerTOP (Step 10)
- **One peptide at a time** — multiple concatenated into one string
- Register → login (username + email + password) → fill textarea → submit
- Uses `type()` with delay (not `fill()`) for login form fields
- Extracts: prediction + Most Similar Protein (full UniProt/NCBI entry)
- Dummy mode: random ALLERGEN/NON-ALLERGEN + mock similar protein

### ToxinPred (Step 11)
- FASTA format with `>seq{i}\n{s}` headers — multi-sequence works
- Selects "Hybrid" method
- Dummy mode: random Toxin/Non-Toxin

### ExPASy ProtParam (Step 12)
- CGI endpoint: `https://web.expasy.org/cgi-bin/protparam/protparam`
- Strip `<strong>` HTML tags before regex matching
- 15 fields: AA count, pI, MW, charged residues, instability, stability class, aliphatic, GRAVY, extinction, Abs 0.1%, half-life, formula, total atoms
- AA composition as percentages (count/length × 100)
- 15s timeout per peptide

### Immunogenicity (Step 13)
- IEDB scores from Step 5 (MHC-I results)
- Uses `filterResult.mhcI` (local variable), NOT `mhciMutData` (stale React state)
- Class thresholds: score ≥ 0.7 = High, ≥ 0.4 = Medium, < 0.4 = Low

### ProtParam Merge Fix
- `ppCols` and `ppRows` used directly in merge, NOT React state `protparamData`
- Prevents stale state bug where `setProtparamData()` batches updates

---

## Bug Fixes Applied

| Date | Issue | Fix |
|------|-------|-----|
| 2026-08-01 | Step 14 message said "66-column" | Updated to "72-column" |
| 2026-08-01 | `protparamData` stale state in merge | Use local `ppCols`/`ppRows` variables |
| 2026-08-01 | Stability class missing from CSV | Added `protparam_stability` to ppCols/ppRows + FINAL_COLUMNS |
| 2026-08-01 | VaxiJen 3-column split (Antigen/Non-Antigen/Score) | Simplified to 2 columns: Score + Prediction |
| 2026-08-01 | Unused `protparam_stability` in ppCols | Removed then re-added with proper merge lookup |

---

## Pending

- [ ] MSA alignment UI edits
- [ ] End-to-end browser test with real data (uncheck dummy mode, run Steps 1-8)
