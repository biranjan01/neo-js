import os, sys, json, re, time, uuid, tempfile, subprocess, traceback
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.errorhandler(Exception)
def handle_exception(e):
    traceback.print_exc()
    return jsonify({"error": str(e)}), 500

# ─── VaxiJen 2 (Antigenicity) ───
VAXIJEN_SCRIPT_URL = "https://www.ddg-pharmfac.net/vaxijen/scripts/VaxiJen_scripts/VaxiJen3.pl"

@app.route("/vaxijen", methods=["POST"])
def vaxijen():
    data = request.get_json(force=True)
    sequences = data.get("sequences", [])
    target = data.get("target", "tumour")
    threshold = float(data.get("threshold", 0.5))
    if not sequences:
        return jsonify({"error": "No sequences"}), 400

    import httpx
    from camoufox.sync_api import Camoufox

    with Camoufox(headless=True, humanize=True, args=["--no-sandbox"]) as browser:
        page = browser.new_page()
        page.goto("https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html", wait_until="networkidle", timeout=90000)
        title = page.title()
        if "Just a moment" in title:
            for _ in range(30):
                time.sleep(2)
                title = page.title()
                if "Just a moment" not in title:
                    break
        all_cookies = page.context.cookies()
        user_agent = page.evaluate("navigator.userAgent")
        cf_cookies = {c["name"]: c["value"] for c in all_cookies if "ddg-pharmfac" in c.get("domain", "")}

    cookie_str = "; ".join(f"{k}={v}" for k, v in cf_cookies.items())
    headers = {"User-Agent": user_agent, "Cookie": cookie_str, "Accept": "text/html", "Content-Type": "application/x-www-form-urlencoded"}
    time.sleep(3)

    results = []
    with httpx.Client(timeout=60, follow_redirects=True, headers=headers) as client:
        for seq in sequences:
            prediction = score = None
            for attempt in range(3):
                resp = client.post(VAXIJEN_SCRIPT_URL, data={"seq": seq, "Target": target, "threshold": str(threshold), "submit": "Submit"})
                text = re.sub(r"<[^>]+>", " ", resp.text)
                m = re.search(r"Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(.*?(?:Probable\s*)?(ANTIGEN|NON-ANTIGEN)", text, re.IGNORECASE)
                if m:
                    score = float(m.group(1))
                    prediction = "ANTIGEN" if "NON" not in m.group(2).upper() else "NON-ANTIGEN"
                if prediction is not None:
                    break
                time.sleep(3)
            results.append({"sequence": seq[:50], "prediction": prediction, "score": score})
            time.sleep(1.5)

    return jsonify(results)


# ─── VaxiJen 3 (Immunogenicity) ───
VAXIJEN3_URL = "https://www.ddg-pharmfac.net/vaxijen3/home/"

@app.route("/immunogenicity", methods=["POST"])
def immunogenicity():
    data = request.get_json(force=True)
    sequences = data.get("sequences", [])
    target = data.get("target", "tumour")
    if not sequences:
        return jsonify({"error": "No sequences"}), 400

    from camoufox.sync_api import Camoufox

    BATCH = 100
    batches = [sequences[i:i+BATCH] for i in range(0, len(sequences), BATCH)]
    results = []

    with Camoufox(headless=True, humanize=True, args=["--no-sandbox"]) as browser:
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
                    results.append({"sequence": seq[:50], "prediction": pred, "score": prob})
                else:
                    results.append({"sequence": seq[:50], "prediction": "Unknown", "score": None})

            try:
                os.unlink(tmp_path)
            except Exception:
                pass

            if batch_idx < len(batches) - 1:
                page.goto(VAXIJEN3_URL, wait_until="networkidle", timeout=60000)
                time.sleep(2)

    return jsonify(results)


# ─── AllerTOP (Allergenicity) ───
ALLERTOP_URL = "https://www.ddg-pharmfac.net/allertop_v2/"

@app.route("/allertop", methods=["POST"])
def allertop():
    data = request.get_json(force=True)
    sequences = data.get("sequences", [])
    if not sequences:
        return jsonify({"error": "No sequences"}), 400

    from camoufox.sync_api import Camoufox

    results = []
    with Camoufox(headless=True, humanize=True, args=["--no-sandbox"]) as browser:
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

        for seq in sequences:
            try:
                ta = page.query_selector("textarea[name='protein']") or page.query_selector("textarea")
                if not ta:
                    results.append({"sequence": seq[:50], "prediction": "Unknown", "similar_protein": None})
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
                    results.append({"sequence": seq[:50], "prediction": pred, "similar_protein": similar_protein})
                else:
                    results.append({"sequence": seq[:50], "prediction": "Unknown", "similar_protein": similar_protein})

                page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=60000)
                time.sleep(2)

            except Exception as e:
                results.append({"sequence": seq[:50], "prediction": "Unknown", "similar_protein": None})
                try:
                    page.goto(ALLERTOP_URL, wait_until="networkidle", timeout=60000)
                    time.sleep(2)
                except Exception:
                    pass

    return jsonify(results)


# ─── ToxinPred ───
TOXINPRED_URL = "https://webs.iiitd.edu.in/raghava/toxinpred3/prediction.php"

@app.route("/toxinpred", methods=["POST"])
def toxinpred():
    data = request.get_json(force=True)
    sequences = data.get("sequences", [])
    if not sequences:
        return jsonify({"error": "No sequences"}), 400

    from camoufox.sync_api import Camoufox

    results = []
    with Camoufox(headless=True, humanize=True, args=["--no-sandbox"]) as browser:
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
                results.append({"sequence": seq[:50], "prediction": "Unknown"})
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
                        results.append({"sequence": seq[:50], "prediction": "Non-Toxin"})
                    elif "toxin" in nearby.lower():
                        results.append({"sequence": seq[:50], "prediction": "Toxin"})
                    else:
                        results.append({"sequence": seq[:50], "prediction": "Unknown"})
                else:
                    results.append({"sequence": seq[:50], "prediction": "Unknown"})

    return jsonify(results)


# ─── Population Coverage ───
@app.route("/population", methods=["POST"])
def population():
    data = request.get_json(force=True)
    epitope_alleles = data.get("epitope_alleles", [])
    population = data.get("population", "World")
    mhc_class = data.get("mhc_class", "combined")

    if not epitope_alleles:
        return jsonify({"error": "No epitope-allele pairs"}), 400

    docker_path = "/app/population_coverage"
    local_path = os.path.join(os.path.dirname(__file__), "..", "streamlit-apps", "popcoverage", "population_coverage")
    sys.path.insert(0, docker_path if os.path.isdir(docker_path) else local_path)
    from population_calculation import PopulationCoverage

    input_lines = []
    for item in epitope_alleles:
        epitope = item.get("epitope", "")
        alleles = item.get("alleles", "")
        input_lines.append(f"{epitope} {alleles}")

    input_content = "\n".join(input_lines)

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

        return jsonify(output)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(input_file)


# ─── Health ───
@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
