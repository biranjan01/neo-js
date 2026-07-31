#!/usr/bin/env python3
"""VaxiJen Antigenicity Prediction using Camoufox
Deployed on Streamlit Cloud — bypasses Cloudflare Turnstile
Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)
"""

import streamlit as st
import re
import time
import json
import base64
import pandas as pd

st.set_page_config(page_title="VaxiJen Predictor", page_icon="🧬", layout="wide")

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"
STREAMLIT_URL = "https://neopeptide-8k6mkfhec6jh9mrnyjxtyr.streamlit.app"

# Check for auto-run via query param
params = st.query_params
auto_data = None
if "data" in params:
    try:
        auto_data = json.loads(base64.urlsafe_b64decode(params["data"]))
    except Exception:
        st.error("Invalid data parameter")
        auto_data = None

st.title("VaxiJen Antigenicity Predictor")
st.markdown("Powered by **Camoufox** (open source, MIT) — bypasses Cloudflare Turnstile")
st.caption("Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)")
st.divider()

# If auto_data provided, run immediately
if auto_data:
    sequences = auto_data.get("sequences", [])
    target = auto_data.get("target", "Tumour")
    threshold = auto_data.get("threshold", 0.5)
    batch_size = auto_data.get("batch_size", 5)
    callback_url = auto_data.get("callback_url", "")

    st.info(f"**Auto mode:** {len(sequences)} sequences, target={target}, threshold={threshold}")

    if st.button("Run VaxiJen Prediction", type="primary", key="auto_run"):
        pass  # Will run below

    run_auto = True
else:
    col1, col2 = st.columns([2, 1])

    with col1:
        sequences_input = st.text_area(
            "Enter protein sequences (one per line, or FASTA format)",
            value="SIINFEKL\nSIINFEKLSIINFEKL",
            height=200,
        )
    with col2:
        target = st.selectbox("Target Organism", ["Tumour", "Bacteria", "Virus", "Parasite", "Fungal"])
        threshold = st.slider("Threshold", 0.0, 1.0, 0.5, 0.05)
        batch_size = st.number_input("Batch size", 1, 20, 5)

    if st.button("Run VaxiJen Prediction", type="primary"):
        raw = sequences_input.strip().split("\n")
        sequences = [line.strip() for line in raw if line.strip() and not line.strip().startswith(">")]
    else:
        sequences = []

    callback_url = ""
    run_auto = False

if auto_data and "sequences" in auto_data:
    sequences = auto_data["sequences"]
    run_auto = True

if not sequences and not run_auto:
    st.stop()

if sequences or run_auto:
    seqs = sequences if sequences else auto_data.get("sequences", [])
    tgt = target if not auto_data else auto_data.get("target", "Tumour")
    thr = threshold if not auto_data else auto_data.get("threshold", 0.5)
    bs = batch_size if not auto_data else auto_data.get("batch_size", 5)

    st.info(f"Processing {len(seqs)} sequence(s)...")
    results = []

    try:
        from camoufox.sync_api import Camoufox

        progress = st.progress(0, text="Starting Camoufox...")

        with Camoufox(headless=True) as browser:
            page = browser.new_page()

            progress.progress(5, text="Navigating to VaxiJen...")
            page.goto(VAXIJEN_URL, wait_until="commit")

            for i in range(20):
                if "moment" not in page.title().lower():
                    progress.progress(15, text="Cloudflare passed!")
                    break
                time.sleep(2)
            else:
                st.error("Cloudflare challenge did not pass")
                st.stop()

            page.wait_for_selector("textarea[name='seq']", timeout=15000)
            time.sleep(1)

            num_batches = (len(seqs) + bs - 1) // bs

            for batch_idx in range(num_batches):
                batch = seqs[batch_idx * bs : (batch_idx + 1) * bs]
                pct = 15 + int(75 * batch_idx / num_batches)
                progress.progress(pct, text=f"Batch {batch_idx+1}/{num_batches} ({len(batch)} sequences)...")

                fasta = "\n".join(f">seq{i+1}\n{s}" for i, s in enumerate(batch))

                page.fill("textarea[name='seq']", fasta)
                page.select_option("select[name='Target']", label=tgt)
                page.fill("input[name='threshold']", str(thr))
                page.click("input[name='submit']")
                page.wait_for_load_state("networkidle")
                time.sleep(3)

                content = page.content()
                matches = re.findall(RESULT_PATTERN, content, re.DOTALL)

                for i, (score, pred) in enumerate(matches):
                    if i < len(batch):
                        results.append({
                            "peptide": batch[i],
                            "vaxijen_score": float(score),
                            "vaxijen_prediction": pred,
                        })

                if batch_idx < num_batches - 1:
                    page.goto(VAXIJEN_URL, wait_until="commit")
                    for _ in range(10):
                        if "moment" not in page.title().lower():
                            break
                        time.sleep(2)
                    page.wait_for_selector("textarea[name='seq']", timeout=15000)
                    time.sleep(1)

            progress.progress(100, text="Done!")

        if results:
            st.divider()
            st.subheader(f"Results ({len(results)} predictions)")

            df = pd.DataFrame(results)
            st.dataframe(df, use_container_width=True)

            antigens = [r for r in results if r["vaxijen_prediction"] == "ANTIGEN"]
            non_antigens = [r for r in results if r["vaxijen_prediction"] == "NON-ANTIGEN"]

            col_a, col_b, col_c = st.columns(3)
            col_a.metric("Total", len(results))
            col_b.metric("Antigens", len(antigens), delta=f"{len(antigens)/len(results)*100:.0f}%")
            col_c.metric("Non-antigens", len(non_antigens))

            if antigens:
                st.success(f"**{len(antigens)} probable antigen(s) found**")

            st.divider()
            st.subheader("Download Results")

            # CSV download
            csv_data = df.to_csv(index=False)
            st.download_button(
                label="Download CSV",
                data=csv_data,
                file_name="vaxijen_results.csv",
                mime="text/csv",
            )

            # JSON for pipeline - base64 encode for easy copy
            pipeline_json = json.dumps({
                "success": True,
                "step": 9,
                "citation": "Doyon et al., BMC Bioinformatics 9:4 (2008)",
                "stats": {
                    "total": len(results),
                    "antigens": len(antigens),
                    "nonAntigens": len(non_antigens),
                },
                "results": results,
            }, indent=2)

            st.download_button(
                label="Download JSON (for NeoPeptide pipeline)",
                data=pipeline_json,
                file_name="vaxijen_results.json",
                mime="application/json",
            )

            # Show base64 encoded result for auto-integration
            encoded_result = base64.urlsafe_b64encode(pipeline_json.encode()).decode()
            st.divider()
            st.subheader("Auto-Integration Link")
            st.caption("Copy this URL to auto-load results back into NeoPeptide pipeline")
            st.code(f"{STREAMLIT_URL}?result={encoded_result[:100]}...", language="text")

            # Store in session for the callback
            st.session_state["vaxijen_result"] = encoded_result

            st.info("Go back to NeoPeptide and click **Upload VaxiJen Results** → paste the JSON above")
        else:
            st.warning("No predictions returned. Check your sequences.")

    except Exception as e:
        st.error(f"Error: {e}")
        import traceback
        with st.expander("Traceback"):
            st.code(traceback.format_exc())

# Manual input mode
st.divider()
st.subheader("Manual Input")
st.caption("Paste sequences directly (one per line)")
manual_input = st.text_area("Sequences", height=100, key="manual")
if st.button("Run Manual", key="btn_manual"):
    seqs = [s.strip() for s in manual_input.strip().split("\n") if s.strip() and not s.strip().startswith(">")]
    if seqs:
        # Reuse auto logic
        auto_data = {"sequences": seqs, "target": "Tumour", "threshold": 0.5, "batch_size": 5}
        st.rerun()

st.divider()
st.caption("Deployed on Streamlit Cloud | Camoufox bypasses Cloudflare Turnstile | Open source (MIT)")
