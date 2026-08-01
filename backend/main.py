#!/usr/bin/env python3
"""
NeoPeptide Backend — FastAPI for Steps 9-14
Fast pattern: Browser passes Cloudflare ONCE → fetch() API calls for all peptides
"""
import gc
import re
import json
import time
import asyncio
import subprocess
import base64
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="NeoPeptide Backend")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

VAXIJEN_FORM = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
VAXIJEN_CGI = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen3.pl"
ALLERTOP_URL_OLD = "https://www.ddg-pharmfac.net/AllerTOP/"
ALLERTOP_URL = "https://www.ddg-pharmfac.net/allertop_v2/"
TOXINPRED_URL = "https://webs.iiitd.edu.in/raghava/toxinpred3/prediction.php"


class SeqRequest(BaseModel):
    sequences: list[str]
    dummy: bool = False


class StepResult(BaseModel):
    sequence: str
    score: Optional[float] = None
    prediction: Optional[str] = None
    similar_protein: Optional[str] = None
    error: Optional[str] = None


class ImmunogenicityRequest(BaseModel):
    rows: list[dict]


class CosmicCBioRequest(BaseModel):
    gene: str
    cancer_type: str = ""


class ConsolidateRequest(BaseModel):
    gene_name: str
    mhc1_wild_csv: str = ""
    mhc1_mutated_csv: str = ""
    mhc1_final_csv: str = ""
    mhc2_wild_csv: str = ""
    mhc2_mutated_csv: str = ""
    mhc2_final_csv: str = ""
    vaxijen_csv: str = ""
    allertop_csv: str = ""
    toxinpred_csv: str = ""
    protparam_csv: str = ""
    immunogenicity_csv: str = ""


def _log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _cleanup():
    gc.collect()
    for p in ["geckodriver", "firefox", "camoufox"]:
        subprocess.run(["pkill", "-f", p], capture_output=True)
    time.sleep(1)
    gc.collect()


def _parse_vaxijen(html):
    text = re.sub(r"<[^>]+>", " ", html)
    m = re.search(
        r"Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(.*?(?:Probable\s*)?(ANTIGEN|NON-ANTIGEN)",
        text, re.IGNORECASE,
    )
    if m:
        pred = "ANTIGEN" if "NON" not in m.group(2).upper() else "NON-ANTIGEN"
        return float(m.group(1)), pred
    return None, None


import random

def _dummy_vaxijen(sequences):
    """Dummy VaxiJen: random scores for dev/testing"""
    _log("  [DUMMY] Returning mock VaxiJen results")
    results = []
    for seq in sequences:
        score = round(random.uniform(0.2, 2.5), 4)
        pred = "ANTIGEN" if score >= 0.5 else "NON-ANTIGEN"
        results.append(StepResult(sequence=seq, score=score, prediction=pred))
    return results


def _dummy_allertop(sequences):
    """Dummy AllerTOP: random predictions for dev/testing"""
    _log("  [DUMMY] Returning mock AllerTOP results")
    results = []
    for seq in sequences:
        pred = random.choice(["Probable NON-ALLERGEN", "Probable ALLERGEN"])
        results.append(StepResult(sequence=seq, prediction=pred, similar_protein=f"sp|DUMMY|MOCK_HUMAN Mock protein OS=Homo sapiens"))
    return results


def _dummy_toxinpred(sequences):
    """Dummy ToxinPred: random predictions for dev/testing"""
    _log("  [DUMMY] Returning mock ToxinPred results")
    results = []
    for seq in sequences:
        pred = random.choice(["Non-Toxin", "Toxin"])
        results.append(StepResult(sequence=seq, prediction=pred))
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 9: VAXIJEN — Browser once, form submit per peptide
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/vaxijen", response_model=list[StepResult])
async def vaxijen_predict(req: SeqRequest):
    # Dummy mode: return mock results instantly
    if req.dummy:
        return _dummy_vaxijen(req.sequences)

    from camoufox.async_api import AsyncCamoufox

    _log(f"VaxiJen: {len(req.sequences)} peptides")
    results_map = {}

    async with AsyncCamoufox(headless=True) as browser:
        page = await browser.new_page()

        # Step 1: Load form page, pass Cloudflare
        _log("  Loading form page + Cloudflare...")
        await page.goto(VAXIJEN_FORM, wait_until="domcontentloaded", timeout=120000)

        # Wait for Cloudflare challenge to resolve
        ta = None
        for i in range(30):
            await asyncio.sleep(3)
            title = await page.title()
            if "just a moment" in title.lower():
                _log(f"  Cloudflare challenge active, waiting... ({i*3}s)")
                continue
            ta = await page.query_selector("textarea")
            if ta:
                break
            if "vaxijen" in title.lower():
                ta = await page.query_selector("textarea")
                if ta:
                    break
        if not ta:
            raise ValueError("Cloudflare stuck — could not find textarea")
        _log("  Cloudflare passed")

        # Step 2: Select Tumour once
        try:
            await page.select_option("select", label="Tumour")
        except Exception:
            pass

        # Step 3: Submit each peptide via form click (fetch() loses Cloudflare cookies)
        _log(f"  Submitting {len(req.sequences)} peptides via form...")

        for seq in req.sequences:
            # Navigate back to form each time
            await page.goto(VAXIJEN_FORM, wait_until="domcontentloaded", timeout=60000)
            for i in range(10):
                await asyncio.sleep(2)
                ta = await page.query_selector("textarea")
                if ta:
                    break
                title = await page.title()
                if "vaxijen" in title.lower():
                    ta = await page.query_selector("textarea")
                    if ta:
                        break
            if not ta:
                results_map[seq] = StepResult(sequence=seq, error="textarea not found")
                continue

            # Select Tumour
            try:
                await page.select_option("select", label="Tumour")
            except Exception:
                pass

            # Fill and submit
            await ta.fill(seq)
            submit = await page.query_selector("input[type='submit']")
            if submit:
                await submit.click()
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=30000)
            except Exception:
                pass
            await asyncio.sleep(3)

            html = await page.content()
            text = re.sub(r"<[^>]+>", " ", html)
            m = re.search(r"Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(.*?(?:Probable\s*)?(ANTIGEN|NON-ANTIGEN)", text, re.IGNORECASE)
            if m:
                pred = "NON-ANTIGEN" if "NON" in m.group(2).upper() else "ANTIGEN"
                results_map[seq] = StepResult(sequence=seq, score=float(m.group(1)), prediction=pred)
                _log(f"    {seq[:20]}... -> {pred} ({m.group(1)})")
            else:
                results_map[seq] = StepResult(sequence=seq, error="no match in response")
                _log(f"    {seq[:20]}... -> NO MATCH")

        # Retry failed peptides
        failed_seqs = [seq for seq, r in results_map.items() if r.error]
        if failed_seqs:
            _log(f"  Retrying {len(failed_seqs)} failed peptides...")
            for seq in failed_seqs:
                await page.goto(VAXIJEN_FORM, wait_until="domcontentloaded", timeout=60000)
                for i in range(10):
                    await asyncio.sleep(2)
                    ta = await page.query_selector("textarea")
                    if ta: break
                if not ta:
                    continue
                try:
                    await page.select_option("select", label="Tumour")
                except Exception:
                    pass
                await ta.fill(seq)
                submit = await page.query_selector("input[type='submit']")
                if submit:
                    await submit.click()
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=30000)
                except Exception:
                    pass
                await asyncio.sleep(3)
                html = await page.content()
                text = re.sub(r"<[^>]+>", " ", html)
                m = re.search(r"Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(.*?(?:Probable\s*)?(ANTIGEN|NON-ANTIGEN)", text, re.IGNORECASE)
                if m:
                    pred = "NON-ANTIGEN" if "NON" in m.group(2).upper() else "ANTIGEN"
                    results_map[seq] = StepResult(sequence=seq, score=float(m.group(1)), prediction=pred)
                    _log(f"    RETRY OK: {seq[:20]}... -> {pred} ({m.group(1)})")
                else:
                    _log(f"    RETRY FAIL: {seq[:20]}...")

    _cleanup()
    return [results_map.get(seq, StepResult(sequence=seq, error="missing")) for seq in req.sequences]


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 10: ALLERTOP — Browser once, register/login via nav, submit via fetch()
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/allertop", response_model=list[StepResult])
async def allertop_predict(req: SeqRequest):
    if req.dummy:
        return _dummy_allertop(req.sequences)
    from camoufox.async_api import AsyncCamoufox

    _log(f"AllerTOP: {len(req.sequences)} peptides")
    results = []

    try:
        async with AsyncCamoufox(headless=True) as browser:
            page = await browser.new_page()

            # Step 1: Load AllerTOP v2, pass Cloudflare
            _log("  Loading AllerTOP v2 + Cloudflare...")
            await page.goto(ALLERTOP_URL, wait_until="commit", timeout=90000)
            for _ in range(20):
                await asyncio.sleep(3)
                title = await page.title()
                if "just a moment" not in title.lower():
                    break
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            await asyncio.sleep(3)
            _log(f"  Cloudflare passed, URL: {page.url}")

            # Step 2: Register via page navigation
            import uuid
            _uname = f"neo_{uuid.uuid4().hex[:8]}"
            _email = f"{_uname}@neopeptide.app"
            _pw = "N30Pep!2024xZ"

            _log(f"  Registering: {_uname}")
            try:
                await page.goto("https://www.ddg-pharmfac.net/allertop_v2/accounts/signup/", wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)
                for sel, val in [
                    ("#id_username", _uname),
                    ("#id_email", _email),
                    ("#id_password1", _pw),
                    ("#id_password2", _pw),
                ]:
                    el = await page.query_selector(sel)
                    if el:
                        await el.click()
                        await el.type(val, delay=50)
                await asyncio.sleep(1)
                await page.click("button[type='submit'], input[type='submit']")
                try:
                    await page.wait_for_load_state("networkidle", timeout=10000)
                except Exception:
                    pass
                await asyncio.sleep(3)
                _log(f"  After register URL: {page.url}")
                # Check for errors
                errors = await page.evaluate("() => Array.from(document.querySelectorAll('.errorlist, .alert-danger')).map(e => e.textContent.trim()).filter(Boolean)")
                if errors:
                    _log(f"  Register errors: {errors}")
            except Exception as e:
                _log(f"  Register failed: {e}")

            # Step 3: Login via page navigation
            _log(f"  Logging in...")
            try:
                await page.goto("https://www.ddg-pharmfac.net/allertop_v2/accounts/login/?next=/allertop_v2/", wait_until="networkidle", timeout=30000)
                await asyncio.sleep(3)
                for field_name, val in [("username", _uname), ("email", _email), ("password", _pw)]:
                    el = await page.query_selector(f"#id_{field_name}")
                    if el:
                        await el.click()
                        await el.type(val, delay=50)
                    else:
                        _log(f"  Login field missing: #id_{field_name}")
                await asyncio.sleep(1)
                await page.click("button[type='submit'], input[type='submit']")
                try:
                    await page.wait_for_load_state("networkidle", timeout=10000)
                except Exception:
                    pass
                await asyncio.sleep(3)
                _log(f"  After login URL: {page.url}")
            except Exception as e:
                _log(f"  Login failed: {e}")

            # Step 4: Navigate to AllerTOP page (should be logged in now)
            await page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            _log(f"  Ready, URL: {page.url}")

            # Check if logged in
            logged_in = await page.evaluate("() => document.body.innerText.includes('Log Out') || document.body.innerText.includes('logout')")
            _log(f"  Logged in: {logged_in}")

            # Step 5: Submit ONE peptide at a time (AllerTOP processes one protein per submission)
            for seq in req.sequences:
                _log(f"  Submitting: {seq}")
                try:
                    # Fill textarea
                    ta = await page.query_selector("textarea[name='protein']")
                    if not ta:
                        ta = await page.query_selector("textarea")
                    if not ta:
                        _log(f"  No textarea found for {seq}")
                        results.append(StepResult(sequence=seq, prediction="Unknown", error="No textarea"))
                        continue

                    await ta.click()
                    await ta.fill("")
                    await ta.fill(seq)
                    await asyncio.sleep(1)

                    # Submit
                    submit_btn = await page.query_selector("button[type='submit']")
                    if submit_btn:
                        await submit_btn.click()
                    else:
                        await page.get_by_role("button", name="Submit").click()

                    # Wait for results
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=60000)
                    except Exception:
                        pass
                    await asyncio.sleep(8)

                    # Wait for classification to appear
                    for i in range(10):
                        html = await page.content()
                        text = re.sub(r"<[^>]+>", " ", html)
                        if "Classification" in text and ("ALLERGEN" in text or "NON-ALLERGEN" in text):
                            break
                        await asyncio.sleep(3)

                    html = await page.content()
                    text = re.sub(r"<[^>]+>", " ", html)

                    # Parse: look for Classification...: Probable ALLERGEN / Probable NON-ALLERGEN
                    pat = re.compile(
                        rf"Classification.*?:\s*(Probable\s+(?:NON-)?ALLERGEN)",
                        re.DOTALL | re.IGNORECASE
                    )
                    m = pat.search(text)

                    # Extract Most Similar Protein
                    sim_pat = re.compile(
                        r"Most similar protein:\s*(.+?)(?:\n|Classification)",
                        re.DOTALL | re.IGNORECASE
                    )
                    sim_m = sim_pat.search(text)
                    similar_protein = sim_m.group(1).strip() if sim_m else None
                    if similar_protein:
                        similar_protein = re.sub(r"\s+", " ", similar_protein).strip()
                        _log(f"  {seq} → similar protein: {similar_protein[:80]}")

                    if m:
                        pred = m.group(1).strip().upper()
                        if "NON-ALLERGEN" in pred:
                            results.append(StepResult(sequence=seq, prediction="NON-ALLERGEN", similar_protein=similar_protein))
                        else:
                            results.append(StepResult(sequence=seq, prediction="ALLERGEN", similar_protein=similar_protein))
                        _log(f"  {seq} → {pred}")
                    else:
                        _log(f"  {seq} → No classification found")
                        results.append(StepResult(sequence=seq, prediction="Unknown", similar_protein=similar_protein))

                    # Go back to form for next peptide
                    await page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=30000)
                    await asyncio.sleep(2)

                except Exception as e:
                    _log(f"  {seq} → Error: {e}")
                    results.append(StepResult(sequence=seq, prediction="Unknown", error=str(e)))
                    try:
                        await page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=30000)
                        await asyncio.sleep(2)
                    except Exception:
                        pass

    except Exception as e:
        _log(f"  AllerTOP error: {e}")
        import traceback
        traceback.print_exc()
        for seq in req.sequences:
            results.append(StepResult(sequence=seq, prediction="Error", error=str(e)))

    _cleanup()
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 11: TOXINPRED — Browser once, upload all
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/toxinpred", response_model=list[StepResult])
async def toxinpred_predict(req: SeqRequest):
    if req.dummy:
        return _dummy_toxinpred(req.sequences)
    from camoufox.async_api import AsyncCamoufox

    _log(f"ToxinPred: {len(req.sequences)} peptides")
    results = []

    async with AsyncCamoufox(headless=True) as browser:
        page = await browser.new_page()

        _log("  Loading ToxinPred + Cloudflare...")
        await page.goto(TOXINPRED_URL, wait_until="commit", timeout=60000)
        for _ in range(15):
            await asyncio.sleep(3)
            title = await page.title()
            if "just a moment" not in title.lower():
                break
        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        await asyncio.sleep(3)
        _log(f"  Cloudflare passed, URL: {page.url}")

        fasta = "\n".join(f">seq{i}\n{s}" for i, s in enumerate(req.sequences))
        for attempt in range(3):
            ta = await page.query_selector("textarea")
            if ta:
                break
            _log(f"  No textarea yet, retry {attempt+1}...")
            await asyncio.sleep(3)
        if not ta:
            raise ValueError("No textarea found after retries")
        await ta.fill(fasta)

        # Select Hybrid method
        selects = await page.query_selector_all("select")
        for sel in selects:
            try:
                opts = await sel.query_selector_all("option")
                for opt in opts:
                    txt = (await opt.text_content() or "").lower()
                    if "hybrid" in txt:
                        await sel.select_option(value=await opt.get_attribute("value"))
                        break
            except Exception:
                pass

        submit = await page.query_selector("input[type='submit']")
        if submit:
            await submit.click()
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(5)

        html = await page.content()
        text = re.sub(r"<[^>]+>", " ", html)

        for seq in req.sequences:
            if seq in text:
                idx = text.index(seq)
                nearby = text[idx:idx+300]
                if "non-toxin" in nearby.lower():
                    results.append(StepResult(sequence=seq, prediction="Non-Toxin"))
                elif "toxin" in nearby.lower():
                    results.append(StepResult(sequence=seq, prediction="Toxin"))
                else:
                    results.append(StepResult(sequence=seq, prediction="Unknown"))
            else:
                results.append(StepResult(sequence=seq, error="not found"))

    _cleanup()
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 13: IMMUNOGENICITY SCORING
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/immunogenicity")
async def immunogenicity_score(req: ImmunogenicityRequest):
    import pandas as pd

    df = pd.DataFrame(req.rows)

    def _score(row):
        s = 0.0
        vax = str(row.get("vaxijen_pred", "")).upper()
        if "ANTIGEN" in vax and "NON" not in vax:
            s += 0.4
        tox = str(row.get("toxinpred_pred", "")).lower()
        if "non-toxin" in tox or tox == "non toxin":
            s += 0.3
        aller = str(row.get("allertop_pred", "")).lower()
        if "non-allergen" in aller or "non allergen" in aller:
            s += 0.3
        return round(s, 2)

    def _classify(score):
        if score >= 0.7:
            return "High"
        if score >= 0.4:
            return "Medium"
        return "Low"

    df["immunogenicity_score"] = df.apply(_score, axis=1)
    df["immunogenicity_class"] = df["immunogenicity_score"].apply(_classify)
    df = df.sort_values("immunogenicity_score", ascending=False).reset_index(drop=True)
    return {"rows": df.to_dict(orient="records")}


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 14: CONSOLIDATION — ZIP with named CSVs
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/api/consolidate")
async def consolidate(req: ConsolidateRequest):
    import zipfile
    import io
    import base64

    g = req.gene_name.upper()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        def _add(name, content):
            if content and content.strip():
                zf.writestr(name, content)

        _add(f"{g}_MHC1_wildtype.csv",      req.mhc1_wild_csv)
        _add(f"{g}_MHC1_mutated.csv",       req.mhc1_mutated_csv)
        _add(f"{g}_MHC1_neoantigens.csv",   req.mhc1_final_csv)
        _add(f"{g}_MHC2_wildtype.csv",      req.mhc2_wild_csv)
        _add(f"{g}_MHC2_mutated.csv",       req.mhc2_mutated_csv)
        _add(f"{g}_MHC2_neoantigens.csv",   req.mhc2_final_csv)
        _add(f"{g}_vaxijen.csv",            req.vaxijen_csv)
        _add(f"{g}_allertop.csv",           req.allertop_csv)
        _add(f"{g}_toxinpred.csv",          req.toxinpred_csv)
        _add(f"{g}_protparam.csv",          req.protparam_csv)
        _add(f"{g}_immunogenicity.csv",     req.immunogenicity_csv)

    buf.seek(0)
    return {"zip": base64.b64encode(buf.read()).decode()}


@app.get("/health")
async def health():
    return {"status": "ok"}


# ═══════════════════════════════════════════════════════════════════════════════
# MSA ALIGNMENT PNG
# ═══════════════════════════════════════════════════════════════════════════════
class MSARequest(BaseModel):
    fasta: str
    gene_name: str = "Gene"
    mutations: list[str] = []  # e.g. ["R175H", "E6K"] — highlight these positions


@app.post("/api/msa/png")
async def msa_png(req: MSARequest):
    import io
    import base64
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches
    from collections import Counter

    # ── Parse FASTA ──
    sequences = {}
    order = []
    current = None
    for line in req.fasta.strip().split("\n"):
        line = line.strip()
        if line.startswith(">"):
            current = line[1:].strip()
            short_name = current.split()[0]
            sequences[short_name] = ""
            order.append(short_name)
        elif current is not None:
            sequences[short_name] += line.upper()

    if not sequences:
        return {"error": "No sequences found"}

    names = list(sequences.keys())
    seqs = [sequences[n] for n in names]
    aln_len = max(len(s) for s in seqs)
    n_seqs = len(seqs)

    # Pad sequences to same length
    seqs = [s.ljust(aln_len, "-") for s in seqs]

    # ── Identify mutation positions (first seq vs each other seq) ──
    mutation_cols = set()
    if n_seqs >= 2:
        ref = seqs[0]
        for other in seqs[1:]:
            for col in range(aln_len):
                if ref[col] != other[col] and ref[col] != "-" and other[col] != "-":
                    mutation_cols.add(col)

    # ── AA color scheme (Clustal-like, improved) ──
    aa_colors = {
        "A": "#CCFF00", "G": "#CCFF00", "P": "#CCFF00", "S": "#CCFF00", "T": "#CCFF00",
        "C": "#FFFF00", "M": "#FFFF00",
        "D": "#FF0000", "E": "#FF0000", "N": "#FF0000", "Q": "#FF0000",
        "K": "#6464FF", "R": "#6464FF", "H": "#6464FF",
        "F": "#FF80C0", "W": "#FF80C0", "Y": "#FF80C0",
        "I": "#80FFFF", "L": "#80FFFF", "V": "#80FFFF",
        "-": "#2a2a3e", "X": "#808080",
    }

    # ── Conservation + similarity per column ──
    def aa_group(aa):
        """Return biochemical group for similarity scoring."""
        if aa in "AGVILMFW":     return "hydrophobic"
        if aa in "DECNQ":        return "polar"
        if aa in "KRH":          return "positive"
        if aa in "ST":           return "hydroxyl"
        if aa == "P":            return "proline"
        return "other"

    conservation = []
    conservation_symbol = []
    for col in range(aln_len):
        residues = [seqs[r][col] for r in range(n_seqs)]
        non_gap = [r for r in residues if r != "-"]
        if not non_gap:
            conservation.append(0)
            conservation_symbol.append(" ")
        else:
            c = Counter(non_gap)
            top_count = c.most_common(1)[0][1]
            ratio = top_count / n_seqs
            conservation.append(ratio)
            if ratio == 1.0:
                conservation_symbol.append("*")
            elif len(c) <= 2 and len(set(aa_group(x) for x in non_gap)) == 1:
                conservation_symbol.append(":")
            elif len(set(aa_group(x) for x in non_gap)) <= 2:
                conservation_symbol.append(".")
            else:
                conservation_symbol.append(" ")

    # ── Figure layout ──
    # Show at most 120 columns visible, scroll window around mutations if longer
    MAX_VISIBLE = 120
    start_col = 0
    if aln_len > MAX_VISIBLE and mutation_cols:
        center = min(mutation_cols)
        start_col = max(0, center - MAX_VISIBLE // 3)
        start_col = min(start_col, aln_len - MAX_VISIBLE)

    end_col = min(aln_len, start_col + MAX_VISIBLE) if aln_len > MAX_VISIBLE else aln_len
    visible_len = end_col - start_col

    label_width = max(len(n) for n in names) * 0.12 + 0.8
    col_width = max(0.18, min(0.35, 12.0 / visible_len))
    row_height = 0.7
    conserv_height = 1.5
    symbol_height = 0.3
    fig_width = label_width + visible_len * col_width + 1.0
    fig_height = max(3.5, n_seqs * row_height + conserv_height + symbol_height + 2.0)

    fig = plt.figure(figsize=(fig_width, fig_height), facecolor="#1a1a2e")

    # Grid: sequences | conservation symbols | conservation bar
    gs = fig.add_gridspec(
        3, 1,
        height_ratios=[n_seqs, symbol_height / conserv_height, conserv_height / conserv_height],
        hspace=0.08,
        left=label_width / fig_width,
        right=0.98,
        top=0.92,
        bottom=0.08,
    )

    ax_seq = fig.add_subplot(gs[0])
    ax_sym = fig.add_subplot(gs[1])
    ax_cons = fig.add_subplot(gs[2])

    # ── Sequence heatmap ──
    ax_seq.set_facecolor("#1a1a2e")
    ax_seq.set_xlim(-0.5, visible_len - 0.5)
    ax_seq.set_ylim(-0.5, n_seqs - 0.5)
    ax_seq.invert_yaxis()

    for row_idx in range(n_seqs):
        ax_seq.text(-0.3, row_idx, names[row_idx], fontsize=7, fontfamily="monospace",
                   ha="right", va="center", color="#e0e0e0", fontweight="bold")
        for col_idx in range(start_col, end_col):
            local_col = col_idx - start_col
            aa = seqs[row_idx][col_idx]
            color = aa_colors.get(aa, "#808080")
            # Highlight mutation columns with bright border
            is_mutation = col_idx in mutation_cols
            edge_color = "#FFD700" if is_mutation else "#1a1a2e"
            edge_width = 1.5 if is_mutation else 0.3
            ax_seq.add_patch(mpatches.Rectangle(
                (local_col - 0.45, row_idx - 0.45), 0.9, 0.9,
                facecolor=color, edgecolor=edge_color, linewidth=edge_width))
            if col_width > 0.14:
                ax_seq.text(local_col, row_idx, aa, fontsize=4.5, ha="center", va="center",
                           color="#000000", fontfamily="monospace", fontweight="bold")

    # Position numbers every 10
    tick_positions = []
    tick_labels = []
    for col_idx in range(start_col, end_col):
        real_pos = col_idx + 1
        if real_pos % 10 == 0 or real_pos == 1:
            local_col = col_idx - start_col
            tick_positions.append(local_col)
            tick_labels.append(str(real_pos))
    ax_seq.set_xticks(tick_positions)
    ax_seq.set_xticklabels(tick_labels, fontsize=5, color="#a0a0a0")
    ax_seq.set_yticks([])
    for spine in ax_seq.spines.values():
        spine.set_visible(False)

    # ── Mutation markers ──
    if mutation_cols:
        for col_idx in mutation_cols:
            if start_col <= col_idx < end_col:
                local_col = col_idx - start_col
                ax_seq.annotate("▼", xy=(local_col, -0.7), fontsize=8, color="#FFD700",
                               ha="center", va="center", fontweight="bold")

    # ── Conservation symbols (* : .) ──
    ax_sym.set_facecolor("#1a1a2e")
    ax_sym.set_xlim(-0.5, visible_len - 0.5)
    ax_sym.set_ylim(0, 1)
    ax_sym.axis("off")
    for col_idx in range(start_col, end_col):
        local_col = col_idx - start_col
        sym = conservation_symbol[col_idx]
        color = "#22c55e" if sym == "*" else "#f59e0b" if sym == ":" else "#6b7280" if sym == "." else "#333344"
        if sym != " ":
            ax_sym.text(local_col, 0.5, sym, fontsize=6, ha="center", va="center",
                       color=color, fontfamily="monospace", fontweight="bold")

    # ── Conservation bar ──
    ax_cons.set_facecolor("#1a1a2e")
    ax_cons.set_xlim(-0.5, visible_len - 0.5)
    ax_cons.set_ylim(0, 1.15)
    vis_conservation = conservation[start_col:end_col]
    colors_bar = ["#ef4444" if c < 0.5 else "#f59e0b" if c < 0.8 else "#22c55e" for c in vis_conservation]
    ax_cons.bar(range(visible_len), vis_conservation, color=colors_bar, width=0.8, edgecolor="none")
    ax_cons.axhline(y=0.5, color="#ffffff20", linestyle="--", linewidth=0.5)
    ax_cons.set_xlabel("Alignment Position", fontsize=7, color="#a0a0a0")
    ax_cons.set_ylabel("Conservation", fontsize=7, color="#a0a0a0")
    ax_cons.tick_params(colors="#a0a0a0", labelsize=5)
    for spine in ax_cons.spines.values():
        spine.set_color("#ffffff20")

    # Legend
    legend_patches = [
        mpatches.Patch(color="#22c55e", label="Conserved (*)"),
        mpatches.Patch(color="#f59e0b", label="Similar (:/."),
        mpatches.Patch(color="#ef4444", label="Variable"),
        mpatches.Patch(facecolor="#1a1a2e", edgecolor="#FFD700", linewidth=2, label="Mutation site"),
    ]
    ax_cons.legend(handles=legend_patches, loc="upper right", fontsize=5,
                   facecolor="#1a1a2e", edgecolor="#ffffff40", labelcolor="#a0a0a0", ncol=2)

    # ── Title ──
    mut_info = ""
    if req.mutations:
        mut_info = f" — Mutations: {', '.join(req.mutations)}"
    elif mutation_cols:
        mut_info = f" — {len(mutation_cols)} variant position(s)"
    fig.suptitle(f"{req.gene_name} — Multiple Sequence Alignment{mut_info}",
                 fontsize=11, color="#e0e0e0", fontweight="bold", y=0.97)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=200, facecolor="#1a1a2e", bbox_inches="tight", pad_inches=0.3)
    plt.close(fig)
    buf.seek(0)

    return {"png": base64.b64encode(buf.read()).decode()}


# ═══════════════════════════════════════════════════════════════════════════════
# COSMIC + cBioPortal — Mutation Data Source
# ═══════════════════════════════════════════════════════════════════════════════
import requests as _requests
import csv as _csv
import io as _io

# cBioPortal cancer type → study ID mapping
CBIO_STUDIES = {
    "breast": ["brca_tcga_pan_can_atlas_2018", "brca_metabric2012"],
    "lung": ["luad_tcga_pan_can_atlas_2018", "lusc_tcga_pan_can_atlas_2018"],
    "colon": ["coadread_tcga_pan_can_atlas_2018"],
    "rectal": ["coadread_tcga_pan_can_atlas_2018"],
    "prostate": ["prad_tcga_pan_can_atlas_2018"],
    "ovarian": ["ov_tcga_pan_can_atlas_2018"],
    "glioblastoma": ["gbm_tcga_pan_can_atlas_2018"],
    "head and neck": ["hnsc_tcga_pan_can_atlas_2018"],
    "thyroid": ["thca_tcga_pan_can_atlas_2018"],
    "kidney": ["kirp_tcga_pan_can_atlas_2018", "kich_tcga_pan_can_atlas_2018", "kirc_tcga_pan_can_atlas_2018"],
    "endometrial": ["ucec_tcga_pan_can_atlas_2018"],
    "brain": ["lgg_tcga_pan_can_atlas_2018", "gbm_tcga_pan_can_atlas_2018"],
    "pancreas": ["paad_tcga_pan_can_atlas_2018"],
    "melanoma": ["skcm_tcga_pan_can_atlas_2018"],
    "liver": ["lihc_tcga_pan_can_atlas_2018"],
    "stomach": ["stad_tcga_pan_can_atlas_2018"],
    "bladder": ["blca_tcga_pan_can_atlas_2018"],
    "esophageal": ["esca_tcga_pan_can_atlas_2018"],
    "sarcoma": ["sarc_tcga_pan_can_atlas_2018"],
    "adrenal": ["acc_tcga_pan_can_atlas_2018"],
    "uterine": ["ucs_tcga_pan_can_atlas_2018", "ucec_tcga_pan_can_atlas_2018"],
    "cervical": ["cesc_tcga_pan_can_atlas_2018"],
    "mesothelioma": ["meso_tcga_pan_can_atlas_2018"],
    "pheochromocytoma": ["pcpg_tcga_pan_can_atlas_2018"],
    "lymphoma": ["dlbc_tcga_pan_can_atlas_2018"],
    "testicular": ["tgct_tcga_pan_can_atlas_2018"],
    "cholangiocarcinoma": ["chol_tcga_pan_can_atlas_2018"],
    "uveal melanoma": ["uvm_tcga_pan_can_atlas_2018"],
}

# Gene name → entrezGeneId mapping (common cancer genes)
GENE_IDS = {
    "TP53": 7157, "PIK3CA": 5290, "KRAS": 3845, "BRAF": 673,
    "EGFR": 1956, "PTEN": 5728, "APC": 324, "RB1": 5925,
    "CDH1": 999, "BCL2": 596, "MYC": 4609, "ERBB2": 2064,
    "FBXW7": 7979, "CDKN2A": 1029, "ARID1A": 8286, "ATM": 472,
    "BRCA1": 672, "BRCA2": 675, "IDH1": 3417, "IDH2": 3418,
    "ALK": 238, "ROS1": 6098, "RET": 5979, "NRAS": 4893,
    "HRAS": 3265, "MAP2K1": 5604, "MAP2K2": 5605, "NF1": 4763,
    "NF2": 4771, "VHL": 7428, "SMAD4": 4089, "STK11": 6794,
    "CTNNB1": 1499, "NOTCH1": 4851, "FGFR3": 2261, "FGFR2": 2263,
    "AKT1": 207, "MTOR": 2475, "TSC1": 7248, "TSC2": 7249,
    "JAK2": 3717, "ABL1": 25, "FLT3": 2322, "KIT": 3815,
    "PDGFRA": 5156, "MET": 4233, "ERBB3": 2065, "ERBB4": 2066,
    "DDR2": 4921, "BRAF": 673, "MAPK1": 5594, "MAPK3": 5595,
    "MAX": 4149, "SMARCB1": 6598, "SMARCA4": 6597, "ARID1B": 57492,
    "SETD2": 29072, "KMT2A": 4297, "KMT2D": 79812, "NSD1": 64324,
}


@app.post("/api/cbioportal")
async def cbioportal_query(req: CosmicCBioRequest):
    """Query cBioPortal for mutation data by gene + cancer type."""
    gene = req.gene.upper().strip()
    cancer = req.cancer_type.lower().strip()

    entrez = GENE_IDS.get(gene)
    if not entrez:
        return {"error": f"Gene {gene} not in database. Add to GENE_IDS in backend."}

    studies = CBIO_STUDIES.get(cancer)
    if not studies:
        # Try partial match
        for key, vals in CBIO_STUDIES.items():
            if cancer in key or key in cancer:
                studies = vals
                break
    if not studies:
        return {"error": f"Cancer type '{cancer}' not found. Available: {', '.join(sorted(CBIO_STUDIES.keys()))}"}

    _log(f"cBioPortal: querying {gene} (entrez={entrez}) in {cancer} ({len(studies)} studies)")

    try:
        body = {
            "molecularProfileIds": [f"{s}_mutations" for s in studies],
            "entrezGeneIds": [entrez],
        }
        r = _requests.post(
            "https://www.cbioportal.org/api/mutations/fetch",
            json=body, timeout=60,
            headers={"Content-Type": "application/json"},
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        return {"error": f"cBioPortal API error: {str(e)}"}

    if not data:
        return {"error": f"No mutations found for {gene} in {cancer}"}

    # Build CSV in COSMIC format: Gene Name, Sample Name, CDS Mutation, AA Mutation
    rows = []
    for m in data:
        sample = m.get("sampleId", "")
        pc = m.get("proteinChange", "")
        # cBioPortal doesn't provide CDS mutations, so we put the protein change there too
        aa = f"p.{pc}" if pc and not pc.startswith("p.") else pc
        rows.append({
            "Gene Name": gene,
            "Sample Name": sample,
            "CDS Mutation": "",
            "AA Mutation": aa,
        })

    # Deduplicate by (sample, aa_mutation)
    seen = set()
    unique_rows = []
    for r in rows:
        key = (r["Sample Name"], r["AA Mutation"])
        if key not in seen:
            seen.add(key)
            unique_rows.append(r)

    # Write CSV
    buf = _io.StringIO()
    writer = _csv.DictWriter(buf, fieldnames=["Gene Name", "Sample Name", "CDS Mutation", "AA Mutation"])
    writer.writeheader()
    writer.writerows(unique_rows)
    csv_str = buf.getvalue()

    _log(f"cBioPortal: {len(unique_rows)} unique mutations for {gene} in {cancer}")
    return {
        "csv": csv_str,
        "total": len(unique_rows),
        "samples": len(set(r["Sample Name"] for r in unique_rows)),
        "source": "cBioPortal",
        "gene": gene,
        "cancer_type": cancer,
    }


@app.post("/api/cosmic/upload")
async def cosmic_upload(file_content: str, gene: str = ""):
    """Parse an uploaded COSMIC CSV file."""
    _log(f"COSMIC upload: parsing file for gene={gene}")

    # Parse CSV
    reader = _csv.DictReader(_io.StringIO(file_content))
    rows = list(reader)

    if not rows:
        return {"error": "Empty file or invalid CSV format"}

    # Filter by gene if specified
    if gene:
        gene = gene.upper().strip()
        gene_col = None
        for col in rows[0].keys():
            if "gene" in col.lower():
                gene_col = col
                break
        if gene_col:
            before = len(rows)
            rows = [r for r in rows if str(r.get(gene_col, "")).upper() == gene]
            _log(f"  Filtered to gene {gene}: {len(rows)}/{before} rows")

    # Normalize columns to: Gene Name, Sample Name, CDS Mutation, AA Mutation
    col_map = {}
    for col in rows[0].keys():
        cl = col.lower().strip()
        if "gene" in cl:
            col_map[col] = "Gene Name"
        elif "sample" in cl:
            col_map[col] = "Sample Name"
        elif "cds" in cl or ("mutation" in cl and "aa" not in cl and "protein" not in cl):
            col_map[col] = "CDS Mutation"
        elif "aa" in cl or "protein" in cl:
            col_map[col] = "AA Mutation"

    # Build output
    out_rows = []
    for r in rows:
        out = {"Gene Name": "", "Sample Name": "", "CDS Mutation": "", "AA Mutation": ""}
        for orig, norm in col_map.items():
            out[norm] = r.get(orig, "")
        out_rows.append(out)

    # Write normalized CSV
    buf = _io.StringIO()
    writer = _csv.DictWriter(buf, fieldnames=["Gene Name", "Sample Name", "CDS Mutation", "AA Mutation"])
    writer.writeheader()
    writer.writerows(out_rows)
    csv_str = buf.getvalue()

    _log(f"COSMIC upload: {len(out_rows)} rows parsed")
    return {
        "csv": csv_str,
        "total": len(out_rows),
        "samples": len(set(r.get("Sample Name", "") for r in out_rows)),
        "source": "COSMIC_manual",
        "gene": gene or "(all)",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# STEP 15: POPULATION COVERAGE — IEDB standalone tool
# ═══════════════════════════════════════════════════════════════════════════════
class PopCoverageRequest(BaseModel):
    epitope_alleles: list[dict]  # [{epitope: "ABC", alleles: "HLA-A*02:01,HLA-A*02:02"}, ...]
    population: list[str] = ["World"]
    mhc_class: str = "combined"


@app.post("/api/population_coverage")
async def population_coverage(req: PopCoverageRequest):
    import tempfile, shutil, os, base64

    _log(f"Population Coverage: {len(req.epitope_alleles)} epitopes, populations={req.population}")

    # Write input file (EPITOPE\tALLES per line)
    input_lines = []
    for item in req.epitope_alleles:
        epitope = item.get("epitope", "")
        alleles = item.get("alleles", "")
        if epitope and alleles:
            input_lines.append(f"{epitope}\t{alleles}")

    if not input_lines:
        return {"error": "No valid epitope-allele pairs provided"}

    # Write to temp file
    tmpdir = tempfile.mkdtemp(prefix="popcov_")
    input_file = os.path.join(tmpdir, "input.txt")
    output_dir = os.path.join(tmpdir, "plots")
    os.makedirs(output_dir)
    with open(input_file, "w") as f:
        f.write("\n".join(input_lines) + "\n")

    try:
        script = os.path.join(os.path.dirname(__file__), "population_coverage", "calculate_population_coverage.py")
        cmd = [
            "python3", script,
            "-p", ",".join(req.population),
            "-c", req.mhc_class,
            "-f", input_file,
            "--plot", output_dir,
        ]
        _log(f"  Running: {' '.join(cmd)}")
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        stdout = proc.stdout
        stderr = proc.stderr
        _log(f"  Exit code: {proc.returncode}")

        if proc.returncode != 0 and not stdout:
            return {"error": f"Population coverage failed: {stderr[:500]}"}

        # Parse stdout — extract both calculation table and chart table
        lines = stdout.strip().split("\n")
        calc_summary = []
        chart_data = []
        current_table = None
        for line in lines:
            if "coverage\taverage_hit" in line:
                current_table = "calc"
                continue
            elif "epitope_hits\tpercent_individuals" in line:
                current_table = "chart"
                continue
            if "\t" in line and current_table:
                parts = line.split("\t")
                if len(parts) >= 4:
                    if parts[0] in ("average", "standard_deviation", "population/area"):
                        continue
                    if current_table == "calc":
                        calc_summary.append({
                            "population": parts[0],
                            "coverage": parts[1],
                            "average_hit": parts[2],
                            "pc90": parts[3],
                        })
                    elif current_table == "chart":
                        chart_data.append({
                            "epitope_hits": parts[1],
                            "percent_individuals": parts[2],
                            "cumulative_coverage": parts[3],
                        })

        # Collect plot PNGs as base64
        plots = []
        if os.path.isdir(output_dir):
            for fname in sorted(os.listdir(output_dir)):
                if fname.endswith(".png"):
                    fpath = os.path.join(output_dir, fname)
                    with open(fpath, "rb") as pf:
                        b64 = base64.b64encode(pf.read()).decode("utf-8")
                    plots.append({"name": fname, "data": b64})

        return {
            "summary": calc_summary,
            "chart": chart_data,
            "plots": plots,
            "stdout": stdout[:3000],
        }

    except subprocess.TimeoutExpired:
        return {"error": "Population coverage calculation timed out (120s)"}
    except Exception as e:
        return {"error": str(e)}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
