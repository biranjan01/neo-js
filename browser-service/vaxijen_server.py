#!/usr/bin/env python3
"""
VaxiJen API Server — runs locally, uses your residential IP to bypass Cloudflare.
Expose via: cloudflared tunnel --url http://localhost:8000

Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)
"""

import os
import re
import time
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="VaxiJen API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"


class VaxijenRequest(BaseModel):
    sequences: list[str]
    target: str = "tumour"
    threshold: float = 0.5
    batch_size: int = 5


class VaxijenResponse(BaseModel):
    success: bool
    results: list[dict]
    stats: dict
    error: str | None = None


@app.get("/health")
def health():
    return {"status": "ok", "service": "vaxijen-local"}


@app.post("/predict", response_model=VaxijenResponse)
def predict(req: VaxijenRequest):
    from camoufox.sync_api import Camoufox

    if not req.sequences:
        raise HTTPException(status_code=400, detail="No sequences")

    all_results = []
    unique = list(dict.fromkeys(req.sequences))

    try:
        with Camoufox(headless=True) as browser:
            page = browser.new_page()
            page.goto(VAXIJEN_URL, wait_until="domcontentloaded", timeout=60000)

            for _ in range(20):
                if "moment" not in page.title().lower():
                    break
                time.sleep(2)
            else:
                return VaxijenResponse(success=False, results=[], stats={}, error="Cloudflare blocked")

            page.wait_for_load_state("networkidle")
            time.sleep(2)
            page.wait_for_selector("textarea[name='seq']", timeout=15000)

            batches = [unique[i:i+req.batch_size] for i in range(0, len(unique), req.batch_size)]

            for batch in batches:
                fasta = "\n".join(f">seq{j+1}\n{s}" for j, s in enumerate(batch))
                page.fill("textarea[name='seq']", fasta)
                page.select_option("select[name='Target']", value=req.target.lower())
                page.fill("input[name='threshold']", str(req.threshold))
                page.click("input[name='submit']")
                page.wait_for_load_state("networkidle")
                time.sleep(5)

                content = page.content()
                matches = re.findall(RESULT_PATTERN, content, re.DOTALL)

                for k, (score, pred) in enumerate(matches):
                    if k < len(batch):
                        all_results.append({
                            "peptide": batch[k],
                            "vaxijen_score": float(score),
                            "vaxijen_prediction": pred,
                        })

                if len(batches) > 1:
                    page.goto(VAXIJEN_URL, wait_until="domcontentloaded", timeout=60000)
                    for _ in range(10):
                        if "moment" not in page.title().lower():
                            break
                        time.sleep(2)
                    page.wait_for_load_state("networkidle")
                    time.sleep(2)
                    page.wait_for_selector("textarea[name='seq']", timeout=15000)

    except Exception as e:
        return VaxijenResponse(success=False, results=[], stats={}, error=str(e))

    antigens = sum(1 for r in all_results if r["vaxijen_prediction"] == "ANTIGEN")
    return VaxijenResponse(
        success=True,
        results=all_results,
        stats={"total": len(all_results), "antigens": antigens, "nonAntigens": len(all_results) - antigens},
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
