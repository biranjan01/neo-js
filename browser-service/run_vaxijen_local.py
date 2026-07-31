#!/usr/bin/env python3
"""
VaxiJen Local Runner
Run this script locally to predict antigenicity.
Input: peptides from stdin or file
Output: results to stdout and vaxijen_results.json

Usage:
  echo -e "SIINFEKL\nAYCTENQL" | python run_vaxijen_local.py
  python run_vaxijen_local.py --file peptides.txt
  python run_vaxijen_local.py  # interactive mode

Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)
"""

import sys
import re
import time
import json
import argparse

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"


def create_fasta(sequences):
    return "\n".join(f">seq{i+1}\n{s}" for i, s in enumerate(sequences))


def run_vaxijen(sequences, target="Tumour", threshold=0.5, batch_size=5):
    from camoufox.sync_api import Camoufox

    results = []
    num_batches = (len(sequences) + batch_size - 1) // batch_size

    with Camoufox(headless=True) as browser:
        page = browser.new_page()

        page.goto(VAXIJEN_URL, wait_until="domcontentloaded", timeout=60000)

        for i in range(30):
            if "moment" not in page.title().lower():
                print(f"Cloudflare passed after {i*2}s")
                break
            time.sleep(2)
        else:
            print("ERROR: Cloudflare did not pass")
            return []

        page.wait_for_load_state("networkidle")
        time.sleep(3)
        page.wait_for_selector("textarea[name='seq']", timeout=15000)

        for batch_idx in range(num_batches):
            batch = sequences[batch_idx * batch_size : (batch_idx + 1) * batch_size]
            print(f"Batch {batch_idx + 1}/{num_batches}: {len(batch)} sequences...")

            fasta = create_fasta(batch)
            page.fill("textarea[name='seq']", fasta)
            page.select_option("select[name='Target']", value=target.lower())
            page.fill("input[name='threshold']", str(threshold))
            page.click("input[name='submit']")
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
                    print(f"  {batch[k]}: {score} ({pred})")

            if batch_idx < num_batches - 1:
                page.goto(VAXIJEN_URL, wait_until="domcontentloaded", timeout=60000)
                for _ in range(15):
                    if "moment" not in page.title().lower():
                        break
                    time.sleep(2)
                page.wait_for_load_state("networkidle")
                time.sleep(3)
                page.wait_for_selector("textarea[name='seq']", timeout=15000)

    return results


def main():
    parser = argparse.ArgumentParser(description="VaxiJen Antigenicity Prediction (local)")
    parser.add_argument("--file", help="File with sequences (one per line)")
    parser.add_argument("--target", default="Tumour", help="Target organism (default: Tumour)")
    parser.add_argument("--threshold", type=float, default=0.5, help="Threshold (default: 0.5)")
    parser.add_argument("--batch", type=int, default=5, help="Batch size (default: 5)")
    parser.add_argument("--output", default="vaxijen_results.json", help="Output JSON file")
    args = parser.parse_args()

    if args.file:
        with open(args.file) as f:
            sequences = [line.strip() for line in f if line.strip() and not line.strip().startswith(">")]
    else:
        if sys.stdin.isatty():
            print("Enter sequences (one per line, Ctrl+D to finish):")
        sequences = [line.strip() for line in sys.stdin if line.strip() and not line.strip().startswith(">")]

    if not sequences:
        print("No sequences provided")
        sys.exit(1)

    print(f"Running VaxiJen on {len(sequences)} sequences (target={args.target}, threshold={args.threshold})")
    results = run_vaxijen(sequences, args.target, args.threshold, args.batch)

    if results:
        import pandas as pd
        df = pd.DataFrame(results)
        antigens = [r for r in results if r["vaxijen_prediction"] == "ANTIGEN"]

        print(f"\n=== Results: {len(results)} predictions ===")
        print(df.to_string(index=False))
        print(f"\nAntigens: {len(antigens)}, Non-antigens: {len(results) - len(antigens)}")

        output = {
            "success": True,
            "step": 9,
            "citation": "Doyon et al., BMC Bioinformatics 9:4 (2008)",
            "stats": {
                "total": len(results),
                "antigens": len(antigens),
                "nonAntigens": len(results) - len(antigens),
            },
            "results": results,
        }

        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"\nSaved to {args.output}")

        csv_file = args.output.replace(".json", ".csv")
        df.to_csv(csv_file, index=False)
        print(f"Saved CSV to {csv_file}")
    else:
        print("No results returned")
        sys.exit(1)


if __name__ == "__main__":
    main()
