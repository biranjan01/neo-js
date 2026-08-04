"""
VaxiJen Antigen Test API — Playwright browser-based
Tests direct form submission to VaxiJen (no signup required)
URL: https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html

Run: python3 vaxijen_test.py
Test: http://localhost:8899/test/quick
"""

import asyncio
import re
import uuid
import json
from fastapi import FastAPI

app = FastAPI(title="VaxiJen Antigen Test")

VAXIJEN_FORM = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html"


async def wait_for_cloudflare(page, max_wait=90):
    for i in range(max_wait // 3):
        title = await page.title()
        if "just a moment" not in title.lower():
            return True
        await asyncio.sleep(3)
    return False


async def predict_one(page, seq: str) -> dict:
    """Navigate to form, fill sequence, submit, parse result."""
    await page.goto(VAXIJEN_FORM, wait_until="domcontentloaded", timeout=120000)

    # Wait for textarea (Cloudflare may redirect)
    ta = None
    for i in range(30):
        await asyncio.sleep(3)
        ta = await page.query_selector("textarea")
        if ta:
            break
        title = await page.title()
        if "vaxijen" in title.lower():
            ta = await page.query_selector("textarea")
            if ta:
                break

    if not ta:
        return {"sequence": seq, "prediction": "Unknown", "score": None, "error": "textarea not found"}

    # Select Tumour
    try:
        await page.select_option("select", label="Tumour")
    except:
        try:
            await page.select_option("select", label="tumor")
        except:
            pass

    # Fill and submit
    await ta.fill(seq)
    submit = await page.query_selector("input[type='submit']")
    if submit:
        await submit.click()
    else:
        return {"sequence": seq, "prediction": "Unknown", "score": None, "error": "no submit button"}

    try:
        await page.wait_for_load_state("domcontentloaded", timeout=120000)
    except:
        pass
    await asyncio.sleep(3)

    # Parse result
    html = await page.content()
    text = re.sub(r"<[^>]+>", " ", html)
    m = re.search(
        r"Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(.*?(?:Probable\s*)?(ANTIGEN|NON-ANTIGEN)",
        text, re.IGNORECASE
    )
    if m:
        pred = "NON-ANTIGEN" if "NON" in m.group(2).upper() else "ANTIGEN"
        return {"sequence": seq, "prediction": pred, "score": float(m.group(1))}

    # Try alternate pattern
    m2 = re.search(r"(ANTIGEN|NON-ANTIGEN)", text, re.IGNORECASE)
    if m2:
        return {"sequence": seq, "prediction": m2.group(1).upper(), "score": None}

    return {"sequence": seq, "prediction": "Unknown", "score": None, "error": "no result pattern found"}


async def run_predict(sequences: list[str]) -> dict:
    from playwright.async_api import async_playwright

    log = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720},
        )
        page = await context.new_page()

        try:
            # Step 1: Pass Cloudflare
            log.append("Loading VaxiJen + Cloudflare...")
            await page.goto(VAXIJEN_FORM, wait_until="domcontentloaded", timeout=120000)
            cf_passed = await wait_for_cloudflare(page, max_wait=60)
            log.append(f"Cloudflare: {'passed' if cf_passed else 'BLOCKED'}")

            if not cf_passed:
                return {"status": "blocked", "reason": "Cloudflare", "log": log}

            # Step 2: Predict each sequence
            results = []
            for i, seq in enumerate(sequences):
                log.append(f"Sequence {i+1}/{len(sequences)}: {seq[:30]}...")
                result = await predict_one(page, seq)
                results.append(result)
                log.append(f"  -> {result['prediction']} ({result.get('score', 'N/A')})")

            found = sum(1 for r in results if r["prediction"] != "Unknown")
            log.append(f"Done: {found}/{len(sequences)} parsed")

            return {"status": "ok", "results": results, "log": log}

        except Exception as e:
            log.append(f"Error: {e}")
            return {"status": "error", "error": str(e), "log": log}
        finally:
            await browser.close()


@app.get("/test/session")
def test_session():
    """Quick test — can Playwright reach VaxiJen and find the form?"""
    async def _check():
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = await browser.new_page()
            try:
                await page.goto(VAXIJEN_FORM, wait_until="commit", timeout=120000)
                cf = await wait_for_cloudflare(page, max_wait=45)
                await asyncio.sleep(8)
                title = await page.title()
                # Get page text to debug
                body_text = ""
                try:
                    body_text = await page.evaluate("() => document.body?.innerText?.substring(0, 300) || 'empty'")
                except:
                    pass
                # Wait for form elements
                has_textarea = False
                for _ in range(10):
                    try:
                        has_textarea = await page.evaluate("() => !!document.querySelector('textarea')")
                        if has_textarea:
                            break
                    except:
                        pass
                    await asyncio.sleep(2)
                has_submit = False
                has_select = False
                try:
                    has_submit = await page.evaluate("() => !!document.querySelector('input[type=submit]')")
                    has_select = await page.evaluate("() => !!document.querySelector('select')")
                except:
                    pass
                return {
                    "status": "ok",
                    "cloudflare_passed": cf,
                    "title": title,
                    "url": page.url,
                    "has_textarea": has_textarea,
                    "has_submit": has_submit,
                    "has_select": has_select,
                    "body_snippet": body_text,
                }
            except Exception as e:
                return {"status": "error", "error": str(e)}
            finally:
                await browser.close()
    return asyncio.run(_check())


@app.get("/test/quick")
def test_quick():
    """Single sequence test."""
    test_seq = "MKWVTFISLLFLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFKALVLIAFAQYLQQCPFEDHVKLVNEVTEFAKTCVADESAENCDKS"
    return asyncio.run(run_predict([test_seq]))


@app.post("/test/predict")
def test_predict(sequences: list[str]):
    """Custom sequences."""
    return asyncio.run(run_predict(sequences))


@app.get("/test/multi")
def test_multi():
    """3 sequences."""
    return asyncio.run(run_predict([
        "MKWVTFISLLFLFSSAYSRGVFRRDAHKSEVAHRFKDLGEENFKALVLIAFAQYLQQCPFEDHVKLVNEVTEFAKTCVADESAENCDKS",
        "MSIIGATRLQNDKSDTYSAGPCYAGGCSAFTPRGTCGKDWDLGEQTCASGFCTSQPLCARIKKTQVCGLRYSDANKGDVANTFHAFSLL",
        "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQQIAA",
    ]))


if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("VaxiJen Antigen Test API (Playwright)")
    print("=" * 60)
    print("  GET  /test/session  — Check Cloudflare + form")
    print("  GET  /test/quick    — Single sequence")
    print("  GET  /test/multi    — 3 sequences")
    print("  POST /test/predict  — Custom sequences")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8899)
