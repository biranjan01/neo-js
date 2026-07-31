#!/usr/bin/env python3
"""VaxiJen API server using Camoufox (bypasses Cloudflare)"""

import os
import re
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from camoufox.sync_api import Camoufox

app = FastAPI(title="VaxiJen API (Camoufox)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"
RESULT_PATTERN = r"Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*</b>.*?(ANTIGEN|NON-ANTIGEN)"


class VaxijenRequest(BaseModel):
    sequences: list[str]
    target: str = "tumour"
    threshold: float = 0.5


class Prediction(BaseModel):
    sequence: str
    score: float
    prediction: str


class VaxijenResponse(BaseModel):
    success: bool
    predictions: list[Prediction]
    error: str | None = None


def create_fasta(sequences: list[str]) -> str:
    return "\n".join(f">seq{i+1}\n{seq}" for i, seq in enumerate(sequences))


def submit_to_vaxijen(sequences: list[str], target: str, threshold: float) -> list[dict]:
    """Submit sequences to VaxiJen using Camoufox and return results"""
    fasta = create_fasta(sequences)
    results = []

    with Camoufox(headless=True) as browser:
        page = browser.new_page()

        # Navigate
        page.goto(VAXIJEN_URL, wait_until="commit")

        # Wait for Cloudflare
        for _ in range(30):
            title = page.title()
            if "moment" not in title.lower():
                break
            time.sleep(2)
        else:
            raise Exception("Cloudflare challenge did not pass")

        # Wait for form
        page.wait_for_selector("textarea[name='seq']", timeout=15000)
        time.sleep(1)

        # Fill form
        page.fill("textarea[name='seq']", fasta)
        page.select_option("select[name='Target']", label=target.title())
        page.fill("input[name='threshold']", str(threshold))

        # Submit
        page.click("input[name='submit']")

        # Wait for results
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        content = page.content()

        # Parse results
        matches = re.findall(RESULT_PATTERN, content, re.DOTALL)

        for i, (score, pred) in enumerate(matches):
            if i < len(sequences):
                results.append({
                    "sequence": sequences[i],
                    "score": float(score),
                    "prediction": pred,
                })

    return results


@app.post("/predict", response_model=VaxijenResponse)
def predict(req: VaxijenRequest):
    """Run VaxiJen antigenicity prediction"""
    if not req.sequences:
        raise HTTPException(status_code=400, detail="No sequences provided")

    try:
        results = submit_to_vaxijen(req.sequences, req.target, req.threshold)
        return VaxijenResponse(success=True, predictions=results)
    except Exception as e:
        return VaxijenResponse(success=False, predictions=[], error=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "service": "vaxijen-camoufox"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
