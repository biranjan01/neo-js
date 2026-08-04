import streamlit as st
import json
import subprocess
import sys
import re
import time

st.set_page_config(page_title="ToxinPred 3", page_icon="☠️", layout="wide")

@st.cache_resource
def install_camoufox():
    subprocess.check_call([sys.executable, "-m", "camoufox", "fetch"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True

with st.spinner("Installing Camoufox (first run only)..."):
    install_camoufox()

TOXINPRED_URL = "https://webs.iiitd.edu.in/raghava/toxinpred3/prediction.php"

params = st.query_params
mode = params.get("mode", "")

# --- JSON API mode ---
if mode == "upload" and "seqs" in params:
    from camoufox.sync_api import Camoufox

    sequences = json.loads(params["seqs"])
    job_id = params.get("job", str(int(time.time())))

    if "results" not in st.session_state:
        st.session_state.results = {}
    if job_id not in st.session_state.results:
        st.session_state.results[job_id] = {"total": len(sequences), "done": 0, "data": []}

    with Camoufox(headless="virtual", humanize=True) as browser:
        page = browser.new_page()
        page.goto(TOXINPRED_URL, wait_until="networkidle", timeout=90000)
        title = page.title()
        if "Just a moment" in title:
            for _ in range(30):
                time.sleep(2)
                title = page.title()
                if "Just a moment" not in title:
                    break

        fasta = "\n".join(f">seq{i}\n{s}" for i, s in enumerate(sequences))

        ta = None
        for attempt in range(3):
            ta = page.query_selector("textarea")
            if ta:
                break
            time.sleep(3)

        if not ta:
            for seq in sequences:
                st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown", "error": "No textarea found"})
                st.session_state.results[job_id]["done"] += 1
        else:
            ta.fill(fasta)

            selects = page.query_selector_all("select")
            for sel in selects:
                try:
                    opts = sel.query_selector_all("option")
                    for opt in opts:
                        txt = (opt.text_content() or "").lower()
                        if "hybrid" in txt:
                            sel.select_option(value=opt.get_attribute("value"))
                            break
                except Exception:
                    pass

            submit = page.query_selector("input[type='submit']")
            if submit:
                submit.click()
            try:
                page.wait_for_load_state("networkidle", timeout=120000)
            except Exception:
                pass
            time.sleep(5)

            html = page.content()
            text = re.sub(r"<[^>]+>", " ", html)

            for seq in sequences:
                if seq in text:
                    idx = text.index(seq)
                    nearby = text[idx:idx+300]
                    if "non-toxin" in nearby.lower():
                        st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Non-Toxin"})
                    elif "toxin" in nearby.lower():
                        st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Toxin"})
                    else:
                        st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown"})
                else:
                    st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown", "error": "not found"})
                st.session_state.results[job_id]["done"] += 1

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
st.title("☠️ ToxinPred 3 Toxicity Predictor")

uploaded = st.file_uploader("Upload CSV with 'sequence' column", type="csv")
if uploaded:
    import pandas as pd
    df = pd.read_csv(uploaded)
    st.dataframe(df.head(5))
    st.info(f"{len(df)} sequences")

    if st.button("🚀 Run ToxinPred Prediction", type="primary"):
        sequences = df["sequence"].tolist()
        st.session_state.current_sequences = sequences
        st.session_state.processing = True

if st.session_state.get("processing"):
    sequences = st.session_state.current_sequences
    st.info(f"Processing {len(sequences)} sequences...")
