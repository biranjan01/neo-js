import streamlit as st
import json
import os
import sys
import tempfile
import time

st.set_page_config(page_title="IEDB Population Coverage", page_icon="🌍", layout="wide")

# Add population_coverage to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "population_coverage"))

from population_calculation import PopulationCoverage
from util import read_input_file, print_chart_table, generate_plot, get_population_list

params = st.query_params
mode = params.get("mode", "")

# --- JSON API mode ---
if mode == "upload" and "epitope_alleles" in params:
    epitope_alleles = json.loads(params["epitope_alleles"])
    population = params.get("population", "World")
    mhc_class = params.get("mhc_class", "combined")
    job_id = params.get("job", str(int(time.time())))

    # Build input file for the population coverage tool
    input_lines = []
    for item in epitope_alleles:
        epitope = item.get("epitope", "")
        alleles = item.get("alleles", "")
        input_lines.append(f"{epitope} {alleles}")

    input_content = "\n".join(input_lines)

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(input_content)
        input_file = f.name

    try:
        pcal = PopulationCoverage()
        result, negative = pcal.calculate_coverage(
            population=[population],
            mhc_class=[mhc_class],
            filename=input_file
        )

        output = {"summary": [], "chart": []}

        for r in result:
            pop = r.get("population", "")
            cov = r.get("coverage", 0)
            avg_hit = r.get("average_hit", 0)
            pc90 = r.get("pc90", 0)
            epitope_hits = r.get("epitope_hits", [])
            percent_individuals = r.get("percent_individuals", [])
            cumulative = r.get("cumulative_coverage", [])

            output["summary"].append({
                "population": pop,
                "coverage": f"{round(cov * 100, 2)}%",
                "average_hit": round(avg_hit, 2),
                "pc90": round(pc90, 2),
            })

            output["chart"].append({
                "epitope_hits": epitope_hits,
                "percent_individuals": [round(pi * 100, 2) for pi in percent_individuals],
                "cumulative_coverage": [round(cc, 2) for cc in cumulative],
            })

        for n in negative:
            output["summary"].append({
                "population": n.get("population", ""),
                "coverage": "0%",
                "average_hit": 0,
                "pc90": 0,
            })

        st.session_state.results = {job_id: output}
        st.json(output)
    except Exception as e:
        st.json({"error": str(e)})
    finally:
        os.unlink(input_file)

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
st.title("🌍 IEDB Population Coverage Calculator")

st.info("Calculate HLA population coverage for epitope-allele combinations using the IEDB standalone tool.")

col1, col2 = st.columns(2)

with col1:
    epitope_input = st.text_area(
        "Epitope-Allele pairs (one per line: EPITope ALLELES)",
        value="SIINFEKL HLA-A*02:01\nGILGFVFTL HLA-A*02:01\nKLGGALQAK HLA-A*03:01",
        height=150,
    )

with col2:
    population = st.selectbox(
        "Population",
        ["World", "Europe", "Asia", "Africa", "North America", "South America", "Oceania"],
    )
    mhc_class = st.selectbox("MHC Class", ["combined", "I", "II"])

if st.button("🚀 Calculate Coverage", type="primary"):
    lines = [l.strip() for l in epitope_input.strip().split("\n") if l.strip()]
    input_lines = []
    for line in lines:
        parts = line.split(None, 1)
        if len(parts) == 2:
            input_lines.append(f"{parts[0]} {parts[1]}")

    if not input_lines:
        st.error("Please enter at least one epitope-allele pair")
    else:
        input_content = "\n".join(input_lines)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            f.write(input_content)
            input_file = f.name

        try:
            with st.spinner("Calculating population coverage..."):
                pcal = PopulationCoverage()
                result, negative = pcal.calculate_coverage(
                    population=[population],
                    mhc_class=[mhc_class],
                    filename=input_file,
                )

            if result:
                for r in result:
                    pop = r.get("population", "")
                    mhc = r.get("mhc_class", "")
                    cov = round(r.get("coverage", 0) * 100, 2)
                    avg_hit = round(r.get("average_hit", 0), 2)
                    pc90 = round(r.get("pc90", 0), 2)

                    st.subheader(f"{pop} — Class {mhc}")
                    c1, c2, c3 = st.columns(3)
                    c1.metric("Coverage", f"{cov}%")
                    c2.metric("Average Hit", f"{avg_hit}")
                    c3.metric("PC90", f"{pc90}")

                    epitope_hits = r.get("epitope_hits", [])
                    percent_individuals = [round(pi * 100, 2) for pi in r.get("percent_individuals", [])]
                    cumulative = [round(cc, 2) for cc in r.get("cumulative_coverage", [])]

                    import pandas as pd
                    chart_df = pd.DataFrame({
                        "Epitope Hits": epitope_hits,
                        "% Individuals": percent_individuals,
                        "Cumulative Coverage": cumulative,
                    })
                    st.dataframe(chart_df)

                    st.line_chart(chart_df.set_index("Epitope Hits"))

            if negative:
                st.warning("Some combinations not available:")
                for n in negative:
                    st.write(f"- {n.get('population')} ({n.get('mhc_class')}): No data")

        except Exception as e:
            st.error(f"Error: {e}")
        finally:
            os.unlink(input_file)
