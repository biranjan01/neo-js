#!/usr/bin/env python3
"""VaxiJen Antigenicity Prediction using Camoufox
Auto-runs when opened with ?data=base64 encoded peptides
Redirects back to NeoPeptide with results
Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)
"""

import streamlit as st
import re
import time
import json
import base64

st.set_page_config(page_title="VaxiJen Predictor", page_icon="🧬", layout="wide")

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"
PIPELINE_URL = "https://neopeptide-rho.vercel.app"

params = st.query_params

# --- AUTO MODE: run VaxiJen and redirect back ---
if "data" in params:
    try:
        input_data = json.loads(base64.urlsafe_b64decode(params["data"]))
    except Exception:
        st.error("Invalid data parameter")
        st.stop()

    sequences = input_data.get("sequences", [])
    target = input_data.get("target", "Tumour")
    threshold = input_data.get("threshold", 0.5)
    batch_size = input_data.get("batch_size", 5)

    st.title("VaxiJen Auto-Run")
    st.info(f"Processing **{len(sequences)}** sequences (target={target}, threshold={threshold})")

    try:
        from camoufox.sync_api import Camoufox

        results = []
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

            num_batches = (len(sequences) + batch_size - 1) // batch_size

            for batch_idx in range(num_batches):
                batch = sequences[batch_idx * batch_size : (batch_idx + 1) * batch_size]
                pct = 15 + int(75 * batch_idx / num_batches)
                progress.progress(pct, text=f"Batch {batch_idx+1}/{num_batches} ({len(batch)} seqs)...")

                fasta = "\n".join(f">seq{i+1}\n{s}" for i, s in enumerate(batch))
                page.fill("textarea[name='seq']", fasta)
                page.select_option("select[name='Target']", label=target)
                page.fill("input[name='threshold']", str(threshold))
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
            import pandas as pd
            df = pd.DataFrame(results)
            antigens = [r for r in results if r["vaxijen_prediction"] == "ANTIGEN"]

            st.divider()
            st.subheader(f"Results ({len(results)} predictions)")
            st.dataframe(df, use_container_width=True)

            col_a, col_b, col_c = st.columns(3)
            col_a.metric("Total", len(results))
            col_b.metric("Antigens", len(antigens))
            col_c.metric("Non-antigens", len(results) - len(antigens))

            if antigens:
                st.success(f"**{len(antigens)} probable antigen(s) found**")

            # Build result JSON and encode
            result_json = json.dumps({
                "success": True,
                "step": 9,
                "citation": "Doyon et al., BMC Bioinformatics 9:4 (2008)",
                "stats": {
                    "total": len(results),
                    "antigens": len(antigens),
                    "nonAntigens": len(results) - len(antigens),
                },
                "results": results,
            })
            encoded_result = base64.urlsafe_b64encode(result_json.encode()).decode()

            # Auto-redirect back to pipeline after 3 seconds
            redirect_url = f"{PIPELINE_URL}?vaxijen_result={encoded_result}"
            st.divider()
            st.subheader("Redirecting back to NeoPeptide...")

            st.markdown(f"""
            <meta http-equiv="refresh" content="3;url={redirect_url}">
            <p>Redirecting in 3 seconds... <a href="{redirect_url}">Click here if not redirected</a></p>
            """, unsafe_allow_html=True)

            st.link_button("Return to NeoPeptide Pipeline", redirect_url, type="primary")
        else:
            st.error("No predictions returned")

    except Exception as e:
        st.error(f"Error: {e}")
        import traceback
        with st.expander("Traceback"):
            st.code(traceback.format_exc())

    st.stop()

# --- MANUAL MODE: show input form ---
st.title("VaxiJen Antigenicity Predictor")
st.markdown("Powered by **Camoufox** (open source, MIT) — bypasses Cloudflare Turnstile")
st.caption("Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)")
st.divider()

col1, col2 = st.columns([2, 1])
with col1:
    sequences_input = st.text_area(
        "Enter protein sequences (one per line, or FASTA)",
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
    if not sequences:
        st.error("No sequences provided")
        st.stop()

    # Generate auto-run URL
    input_data = json.dumps({"sequences": sequences, "target": target, "threshold": threshold, "batch_size": batch_size})
    encoded = base64.urlsafe_b64encode(input_data.encode()).decode()
    auto_url = f"?data={encoded}"
    st.markdown(f"[Run automatically]({auto_url})")
    st.rerun()

st.divider()
st.caption("Deployed on Streamlit Cloud | Camoufox bypasses Cloudflare | Open source (MIT)")
