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
import traceback

st.set_page_config(page_title="VaxiJen Predictor", page_icon="🧬", layout="wide")

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"
PIPELINE_URL = "https://neopeptide-rho.vercel.app"


def run_vaxijen(sequences, target, threshold, batch_size):
    """Core VaxiJen prediction using Camoufox"""
    from camoufox.sync_api import Camoufox

    results = []
    progress = st.progress(0, text="Starting Camoufox...")

    with Camoufox(headless=True) as browser:
        page = browser.new_page()

        progress.progress(5, text="Navigating to VaxiJen...")
        page.goto(VAXIJEN_URL, wait_until="commit")

        # Wait for Cloudflare
        passed = False
        for i in range(20):
            title = page.title()
            if "moment" not in title.lower():
                progress.progress(15, text="Cloudflare passed!")
                passed = True
                break
            time.sleep(2)

        if not passed:
            st.error("Cloudflare challenge did not pass in 40 seconds")
            return None

        # Wait for form
        try:
            page.wait_for_selector("textarea[name='seq']", timeout=15000)
        except Exception:
            st.error("Could not find VaxiJen form")
            return None
        time.sleep(1)

        num_batches = (len(sequences) + batch_size - 1) // batch_size

        for batch_idx in range(num_batches):
            batch = sequences[batch_idx * batch_size : (batch_idx + 1) * batch_size]
            pct = 15 + int(75 * batch_idx / num_batches)
            progress.progress(pct, text=f"Batch {batch_idx + 1}/{num_batches} ({len(batch)} seqs)...")

            fasta = "\n".join(f">seq{j+1}\n{s}" for j, s in enumerate(batch))

            # Fill form
            page.fill("textarea[name='seq']", fasta)

            # Select target - use value instead of label
            page.select_option("select[name='Target']", value=target.lower())

            # Set threshold
            page.fill("input[name='threshold']", str(threshold))

            # Submit
            page.click("input[name='submit']")

            # Wait for response page
            page.wait_for_load_state("networkidle")
            time.sleep(5)

            content = page.content()
            matches = re.findall(RESULT_PATTERN, content, re.DOTALL)

            for k, (score, pred) in enumerate(matches):
                if k < len(batch):
                    results.append({
                        "peptide": batch[k],
                        "vaxijen_score": float(score),
                        "vaxijen_prediction": pred,
                    })

            # Go back for next batch
            if batch_idx < num_batches - 1:
                page.goto(VAXIJEN_URL, wait_until="commit")
                for _ in range(10):
                    title = page.title()
                    if "moment" not in title.lower():
                        break
                    time.sleep(2)
                try:
                    page.wait_for_selector("textarea[name='seq']", timeout=15000)
                except Exception:
                    pass
                time.sleep(1)

        progress.progress(100, text="Done!")

    return results


# ===== AUTO MODE =====
params = st.query_params
if "data" in params:
    try:
        input_data = json.loads(base64.urlsafe_b64decode(params["data"]))
    except Exception as e:
        st.error(f"Invalid data parameter: {e}")
        st.stop()

    sequences = input_data.get("sequences", [])
    target = input_data.get("target", "Tumour")
    threshold = input_data.get("threshold", 0.5)
    batch_size = input_data.get("batch_size", 5)

    st.title("VaxiJen Auto-Run")
    st.info(f"Processing **{len(sequences)}** sequences (target={target}, threshold={threshold})")

    if "vaxijen_done" not in st.session_state:
        st.session_state.vaxijen_done = False

    if not st.session_state.vaxijen_done:
        try:
            results = run_vaxijen(sequences, target, threshold, batch_size)

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

                # Build result JSON
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
                redirect_url = f"{PIPELINE_URL}?vaxijen_result={encoded_result}"

                st.divider()
                st.subheader("Returning to NeoPeptide...")
                st.markdown(f"### [Click here to return to NeoPeptide Pipeline]({redirect_url})")
                st.caption("Redirecting in 5 seconds...")

                st.session_state.vaxijen_done = True
                st.markdown(f'<meta http-equiv="refresh" content="5;url={redirect_url}">', unsafe_allow_html=True)
            else:
                st.error("No predictions returned")
        except Exception as e:
            st.error(f"Error: {e}")
            with st.expander("Traceback"):
                st.code(traceback.format_exc())
    else:
        st.success("Results already sent back to NeoPeptide")

    st.stop()


# ===== MANUAL MODE =====
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

    try:
        results = run_vaxijen(sequences, target, threshold, batch_size)

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

            # Download buttons
            st.divider()
            csv_data = df.to_csv(index=False)
            st.download_button("Download CSV", csv_data, "vaxijen_results.csv", "text/csv")

            result_json = json.dumps({
                "success": True, "step": 9,
                "citation": "Doyon et al., BMC Bioinformatics 9:4 (2008)",
                "stats": {"total": len(results), "antigens": len(antigens), "nonAntigens": len(results) - len(antigens)},
                "results": results,
            }, indent=2)
            st.download_button("Download JSON (for NeoPeptide pipeline)", result_json, "vaxijen_results.json", "application/json")
        else:
            st.error("No predictions returned")
    except Exception as e:
        st.error(f"Error: {e}")
        with st.expander("Traceback"):
            st.code(traceback.format_exc())

st.divider()
st.caption("Deployed on Streamlit Cloud | Camoufox bypasses Cloudflare | Open source (MIT)")
