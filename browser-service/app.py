#!/usr/bin/env python3
"""VaxiJen Antigenicity Prediction using Camoufox
Deployed on Streamlit Cloud — bypasses Cloudflare Turnstile
Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)
"""

import streamlit as st
import re
import time

st.set_page_config(page_title="VaxiJen Predictor", page_icon="🧬", layout="wide")

st.title("VaxiJen Antigenicity Predictor")
st.markdown("Powered by **Camoufox** (open source, MIT) — bypasses Cloudflare Turnstile")
st.caption("Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)")

st.divider()

col1, col2 = st.columns([2, 1])

with col1:
    sequences_input = st.text_area(
        "Enter protein sequences (one per line, or FASTA format)",
        value="SIINFEKL\nSIINFEKLSIINFEKL",
        height=150,
    )

with col2:
    target = st.selectbox("Target Organism", ["Tumour", "Bacteria", "Virus", "Parasite", "Fungal"])
    threshold = st.slider("Threshold", 0.0, 1.0, 0.5, 0.05)

if st.button("Run VaxiJen Prediction", type="primary"):
    raw = sequences_input.strip().split("\n")
    sequences = []
    for line in raw:
        line = line.strip()
        if line.startswith(">"):
            continue
        if line:
            sequences.append(line)

    st.info(f"Processing {len(sequences)} sequence(s)...")

    VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
    RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"

    try:
        from camoufox.sync_api import Camoufox

        results = []

        progress = st.progress(0, text="Starting Camoufox...")

        with Camoufox(headless=True) as browser:
            page = browser.new_page()

            progress.progress(10, text="Navigating to VaxiJen...")
            page.goto(VAXIJEN_URL, wait_until="commit")

            for i in range(20):
                if "moment" not in page.title().lower():
                    progress.progress(20, text="Cloudflare passed!")
                    break
                time.sleep(2)
            else:
                st.error("Cloudflare challenge did not pass")
                st.stop()

            page.wait_for_selector("textarea[name='seq']", timeout=15000)
            time.sleep(1)

            progress.progress(30, text="Filling form...")

            fasta = "\n".join(f">seq{i+1}\n{s}" for i, s in enumerate(sequences))
            page.fill("textarea[name='seq']", fasta)
            page.select_option("select[name='Target']", label=target)
            page.fill("input[name='threshold']", str(threshold))

            progress.progress(50, text="Submitting to VaxiJen...")
            page.click("input[name='submit']")

            progress.progress(70, text="Waiting for results...")
            page.wait_for_load_state("networkidle")
            time.sleep(3)

            content = page.content()
            progress.progress(90, text="Parsing results...")

            matches = re.findall(RESULT_PATTERN, content, re.DOTALL)

            for i, (score, pred) in enumerate(matches):
                if i < len(sequences):
                    results.append({
                        "Sequence": sequences[i][:30] + ("..." if len(sequences[i]) > 30 else ""),
                        "Score": float(score),
                        "Prediction": pred,
                        "Full Sequence": sequences[i],
                    })

            progress.progress(100, text="Done!")

        if results:
            st.divider()
            st.subheader(f"Results ({len(results)} predictions)")

            import pandas as pd
            df = pd.DataFrame(results)
            st.dataframe(df[["Sequence", "Score", "Prediction"]], use_container_width=True)

            antigens = [r for r in results if r["Prediction"] == "ANTIGEN"]
            non_antigens = [r for r in results if r["Prediction"] == "NON-ANTIGEN"]

            col_a, col_b, col_c = st.columns(3)
            col_a.metric("Total", len(results))
            col_b.metric("Antigens", len(antigens))
            col_c.metric("Non-antigens", len(non_antigens))

            if antigens:
                st.success(f"**{len(antigens)} probable antigen(s) found**")
        else:
            st.warning("No predictions returned. Check your sequences.")

    except Exception as e:
        st.error(f"Error: {e}")
        import traceback
        with st.expander("Traceback"):
            st.code(traceback.format_exc())

st.divider()
st.caption("Deployed on Streamlit Cloud | Camoufox bypasses Cloudflare Turnstile | Open source (MIT)")
