import streamlit as st
import json
import subprocess
import sys
import re
import time
import os
import uuid
import tempfile

st.set_page_config(page_title="VaxiJen 3.0 Antigenicity", page_icon="🧬", layout="wide")

@st.cache_resource
def install_camoufox():
    subprocess.check_call([sys.executable, "-m", "camoufox", "fetch"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True

with st.spinner("Installing Camoufox (first run only)..."):
    install_camoufox()

VAXIJEN3_URL = "https://www.ddg-pharmfac.net/vaxijen3/home/"

params = st.query_params
mode = params.get("mode", "")

# --- JSON API mode ---
if mode == "upload" and "seqs" in params:
    from camoufox.sync_api import Camoufox

    sequences = json.loads(params["seqs"])
    target = params.get("target", "tumour")
    job_id = params.get("job", str(int(time.time())))

    if "results" not in st.session_state:
        st.session_state.results = {}
    if job_id not in st.session_state.results:
        st.session_state.results[job_id] = {"total": len(sequences), "done": 0, "data": []}

    with Camoufox(headless="virtual", humanize=True) as browser:
        page = browser.new_page()
        page.goto(VAXIJEN3_URL, wait_until="networkidle", timeout=90000)
        title = page.title()
        if "Just a moment" in title:
            for _ in range(30):
                time.sleep(2)
                title = page.title()
                if "Just a moment" not in title:
                    break

        _uname = f"neo_{uuid.uuid4().hex[:8]}"
        _email = f"{_uname}@neopeptide.app"
        _pw = "N30Pep!2024xZ"

        try:
            page.goto("https://www.ddg-pharmfac.net/vaxijen3/accounts/signup/", wait_until="networkidle", timeout=60000)
            time.sleep(2)
            for sel, val in [("#id_username", _uname), ("#id_email", _email), ("#id_password1", _pw), ("#id_password2", _pw)]:
                el = page.query_selector(sel)
                if el:
                    el.click()
                    el.type(val, delay=50)
            time.sleep(1)
            page.click("button[type='submit'], input[type='submit']")
            time.sleep(3)
        except Exception:
            pass

        try:
            page.goto("https://www.ddg-pharmfac.net/vaxijen3/accounts/login/?next=/vaxijen3/", wait_until="networkidle", timeout=60000)
            time.sleep(3)
            for field_name, val in [("username", _uname), ("email", _email), ("password", _pw)]:
                el = page.query_selector(f"#id_{field_name}")
                if el:
                    el.click()
                    el.type(val, delay=50)
            time.sleep(1)
            page.click("button[type='submit'], input[type='submit']")
            time.sleep(3)
        except Exception:
            pass

        page.goto(VAXIJEN3_URL, wait_until="networkidle", timeout=60000)
        time.sleep(2)

        BATCH = 100
        batches = [sequences[i:i+BATCH] for i in range(0, len(sequences), BATCH)]

        for batch_idx, batch_seqs in enumerate(batches):
            fasta_lines = []
            for i, seq in enumerate(batch_seqs):
                fasta_lines.append(f">seq{i}")
                fasta_lines.append(seq)
            fasta_content = "\n".join(fasta_lines) + "\n"

            tmp_path = os.path.join(tempfile.gettempdir(), f"vaxijen_{uuid.uuid4().hex[:8]}.fasta")
            with open(tmp_path, "w") as f:
                f.write(fasta_content)

            file_input = page.query_selector("input[type='file']")
            if file_input:
                file_input.set_input_files(tmp_path)
                time.sleep(2)
            else:
                ta = page.query_selector("textarea[name='sequence']") or page.query_selector("textarea")
                if ta:
                    ta.fill(fasta_content)

            try:
                page.select_option("select[name='organism']", label="tumor peptide")
            except Exception:
                try:
                    page.select_option("select", label="tumor peptide")
                except Exception:
                    pass

            time.sleep(1)
            submit_btn = page.query_selector("button[type='submit']") or page.query_selector("input[type='submit']")
            if submit_btn:
                submit_btn.click()

            try:
                page.wait_for_load_state("domcontentloaded", timeout=120000)
            except Exception:
                pass

            for _ in range(40):
                html = page.content()
                text = re.sub(r"<[^>]+>", " ", html)
                n_results = len(re.findall(r"Results for protein seq\d+", text))
                if n_results >= len(batch_seqs):
                    break
                time.sleep(5)

            time.sleep(3)
            html = page.content()
            text_clean = re.sub(r"<[^>]+>", " ", html)
            text_clean = re.sub(r"\s+", " ", text_clean)

            for i, seq in enumerate(batch_seqs):
                pat = re.compile(
                    rf"Results for protein seq{i}:\s*Probable\s+(IMMUNOGEN|NON-IMMUNOGEN)\s+with\s+a\s+probability\s+of\s+([\d.]+)%",
                    re.IGNORECASE
                )
                m = pat.search(text_clean)
                if m:
                    pred = m.group(1).upper()
                    prob = float(m.group(2))
                    st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": pred, "score": prob})
                else:
                    st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown", "score": None})
                st.session_state.results[job_id]["done"] += 1

            try:
                os.unlink(tmp_path)
            except Exception:
                pass

            if batch_idx < len(batches) - 1:
                page.goto(VAXIJEN3_URL, wait_until="networkidle", timeout=60000)
                time.sleep(2)

    st.session_state.results[job_id]["status"] = "complete"
    st.json(st.session_state.results[job_id])
    st.stop()

# --- Poll mode ---
if mode == "poll":
    job_id = params.get("job", "")
    if job_id and "results" in st.session_state and job_id in st.session_state.results:
        st.json(st.session_state.results[job_id])
    else:
        st.json({"error": "job not found"})
    st.stop()

# --- Normal UI mode ---
st.title("🧬 VaxiJen 3.0 Immunogenicity Predictor")

uploaded = st.file_uploader("Upload CSV with 'sequence' column", type="csv")
if uploaded:
    import pandas as pd
    df = pd.read_csv(uploaded)
    st.dataframe(df.head(5))
    st.info(f"{len(df)} sequences")

    if st.button("🚀 Run Immunogenicity Prediction", type="primary"):
        sequences = df["sequence"].tolist()
        st.session_state.current_sequences = sequences
        st.session_state.processing = True

if st.session_state.get("processing"):
    sequences = st.session_state.current_sequences
    st.info(f"Processing {len(sequences)} sequences...")
    st.json({"status": "Use ?mode=upload&seqs=... for API access"})
