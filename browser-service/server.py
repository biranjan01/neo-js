#!/usr/bin/env python3
"""VaxiJen API server using Camoufox (bypasses Cloudflare)"""

import os
import re
import time
import traceback
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    from camoufox.sync_api import Camoufox

    fasta = create_fasta(sequences)
    results = []

    print(f"[VaxiJen] Starting Camoufox for {len(sequences)} sequences...")
    with Camoufox(headless=True) as browser:
        print("[VaxiJen] Camoufox started, navigating...")
        page = browser.new_page()

        page.goto(VAXIJEN_URL, wait_until="commit")

        # Wait for Cloudflare
        for i in range(20):
            title = page.title()
            if "moment" not in title.lower():
                print(f"[VaxiJen] Cloudflare passed after {i*2}s")
                break
            time.sleep(2)
        else:
            raise Exception("Cloudflare challenge did not pass")

        page.wait_for_selector("textarea[name='seq']", timeout=15000)
        time.sleep(1)

        page.fill("textarea[name='seq']", fasta)
        page.select_option("select[name='Target']", label=target.title())
        page.fill("input[name='threshold']", str(threshold))

        page.click("input[name='submit']")

        page.wait_for_load_state("networkidle")
        time.sleep(3)

        content = page.content()

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
    if not req.sequences:
        raise HTTPException(status_code=400, detail="No sequences provided")

    try:
        print(f"[VaxiJen] Predict called with {len(req.sequences)} sequences")
        results = submit_to_vaxijen(req.sequences, req.target, req.threshold)
        print(f"[VaxiJen] Got {len(results)} results")
        return VaxijenResponse(success=True, predictions=results)
    except Exception as e:
        tb = traceback.format_exc()
        print(f"[VaxiJen] Error: {e}\n{tb}")
        return VaxijenResponse(success=False, predictions=[], error=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "service": "vaxijen-camoufox"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
