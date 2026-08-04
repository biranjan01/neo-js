import streamlit as st
import json
import subprocess
import sys
import re
import time
import uuid

st.set_page_config(page_title="AllerTOP v2.1", page_icon="⚠️", layout="wide")

@st.cache_resource
def install_camoufox():
    subprocess.check_call([sys.executable, "-m", "camoufox", "fetch"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True

with st.spinner("Installing Camoufox (first run only)..."):
    install_camoufox()

ALLERTOP_URL = "https://www.ddg-pharmfac.net/allertop_v2/"

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
        page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=90000)
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
            page.goto("https://www.ddg-pharmfac.net/allertop_v2/accounts/signup/", wait_until="networkidle", timeout=60000)
            time.sleep(2)
            for sel, val in [("#id_username", _uname), ("#id_email", _email), ("#id_password1", _pw), ("#id_password2", _pw)]:
                el = page.query_selector(sel)
                if el:
                    el.click()
                    el.type(val, delay=50)
            time.sleep(1)
            page.click("button[type='submit'], input[type='submit']")
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except Exception:
                pass
            time.sleep(3)
        except Exception:
            pass

        try:
            page.goto("https://www.ddg-pharmfac.net/allertop_v2/accounts/login/?next=/allertop_v2/", wait_until="networkidle", timeout=60000)
            time.sleep(3)
            for field_name, val in [("username", _uname), ("email", _email), ("password", _pw)]:
                el = page.query_selector(f"#id_{field_name}")
                if el:
                    el.click()
                    el.type(val, delay=50)
            time.sleep(1)
            page.click("button[type='submit'], input[type='submit']")
            try:
                page.wait_for_load_state("networkidle", timeout=30000)
            except Exception:
                pass
            time.sleep(3)
        except Exception:
            pass

        page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=60000)
        time.sleep(2)

        logged_in = page.evaluate("() => document.body.innerText.includes('Log Out') || document.body.innerText.includes('logout')")

        for seq in sequences:
            try:
                ta = page.query_selector("textarea[name='protein']") or page.query_selector("textarea")
                if not ta:
                    st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown", "similar_protein": None, "error": "No textarea"})
                    st.session_state.results[job_id]["done"] += 1
                    continue

                ta.click()
                ta.fill("")
                ta.fill(seq)
                time.sleep(1)

                submit_btn = page.query_selector("button[type='submit']")
                if submit_btn:
                    submit_btn.click()
                else:
                    page.get_by_role("button", name="Submit").click()

                try:
                    page.wait_for_load_state("domcontentloaded", timeout=120000)
                except Exception:
                    pass
                time.sleep(10)

                for _ in range(15):
                    html = page.content()
                    text = re.sub(r"<[^>]+>", " ", html)
                    if "Classification" in text and ("ALLERGEN" in text or "NON-ALLERGEN" in text):
                        break
                    time.sleep(3)

                html = page.content()
                text = re.sub(r"<[^>]+>", " ", html)

                pat = re.compile(r"Classification.*?:\s*(Probable\s+(?:NON-)?ALLERGEN)", re.DOTALL | re.IGNORECASE)
                m = pat.search(text)

                sim_pat = re.compile(r"Most similar protein:\s*(.+?)(?:\n|Classification)", re.DOTALL | re.IGNORECASE)
                sim_m = sim_pat.search(text)
                similar_protein = re.sub(r"\s+", " ", sim_m.group(1).strip()) if sim_m else None

                if m:
                    pred = "NON-ALLERGEN" if "NON-ALLERGEN" in m.group(1).upper() else "ALLERGEN"
                    st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": pred, "similar_protein": similar_protein})
                else:
                    st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown", "similar_protein": similar_protein})

                st.session_state.results[job_id]["done"] += 1

                page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=60000)
                time.sleep(2)

            except Exception as e:
                st.session_state.results[job_id]["data"].append({"sequence": seq[:50], "prediction": "Unknown", "error": str(e)})
                st.session_state.results[job_id]["done"] += 1
                try:
                    page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=60000)
                    time.sleep(2)
                except Exception:
                    pass

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
st.title("⚠️ AllerTOP v2.1 Allergenicity Predictor")

uploaded = st.file_uploader("Upload CSV with 'sequence' column", type="csv")
if uploaded:
    import pandas as pd
    df = pd.read_csv(uploaded)
    st.dataframe(df.head(5))
    st.info(f"{len(df)} sequences")

    if st.button("🚀 Run AllerTOP Prediction", type="primary"):
        sequences = df["sequence"].tolist()
        st.session_state.current_sequences = sequences
        st.session_state.processing = True

if st.session_state.get("processing"):
    sequences = st.session_state.current_sequences
    st.info(f"Processing {len(sequences)} sequences one-by-one...")
