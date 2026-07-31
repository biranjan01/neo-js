#!/usr/bin/env python3
"""VaxiJen Antigenicity Prediction using Camoufox
Deployed on Streamlit Cloud — bypasses Cloudflare Turnstile
Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)
"""

import streamlit as st
import re
import time
import json
import pandas as pd

st.set_page_config(page_title="VaxiJen Predictor", page_icon="🧬", layout="wide")

# Check for API mode via query params
params = st.query_params

st.title("VaxiJen Antigenicity Predictor")
st.markdown("Powered by **Camoufox** (open source, MIT) — bypasses Cloudflare Turnstile")
st.caption("Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)")

st.divider()

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
    sequences = []
    for line in raw:
        line = line.strip()
        if line.startswith(">"):
            continue
        if line:
            sequences.append(line)

    if not sequences:
        st.error("No sequences provided")
        st.stop()

    st.info(f"Processing {len(sequences)} sequence(s)...")

    VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
    RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"

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
                progress.progress(pct, text=f"Batch {batch_idx+1}/{num_batches} ({len(batch)} sequences)...")

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

                # Go back for next batch
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

            # JSON download for pipeline integration
            json_data = json.dumps({
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
                label="Download JSON (for pipeline)",
                data=json_data,
                file_name="vaxijen_results.json",
                mime="application/json",
            )

            st.info("Upload the JSON file back to the NeoPeptide pipeline to continue from Step 10.")
        else:
            st.warning("No predictions returned. Check your sequences.")

    except Exception as e:
        st.error(f"Error: {e}")
        import traceback
        with st.expander("Traceback"):
            st.code(traceback.format_exc())

st.divider()

# Upload previous results to continue pipeline
st.subheader("Upload VaxiJen Results")
st.caption("Upload a VaxiJen JSON file from a previous run to continue the pipeline")
uploaded = st.file_uploader("Upload vaxijen_results.json", type=["json"])
if uploaded:
    data = json.load(uploaded)
    st.json(data)
    st.success(f"Loaded {data.get('stats', {}).get('total', 0)} results")

st.divider()
st.caption("Deployed on Streamlit Cloud | Camoufox bypasses Cloudflare Turnstile | Open source (MIT)")
