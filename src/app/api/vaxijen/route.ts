// API Route: POST /api/vaxijen
// Tries curl_cffi (Chrome impersonation) to bypass Cloudflare
// Falls back to local ACC if blocked

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { peptides } = body;

    if (!peptides || !Array.isArray(peptides) || peptides.length === 0) {
      return NextResponse.json({ error: 'No peptides provided' }, { status: 400 });
    }

    // Build FASTA
    const fasta = peptides.map((p: string, i: number) => `>pep${i + 1}\n${p}`).join('\n');

    // Try curl_cffi via Python subprocess
    const { execSync } = await import('child_process');
    const script = `
import sys, json, re
from curl_cffi import requests as cf_requests

fasta = """${fasta}"""
form_data = {
    "sequence": fasta,
    "Target": "tumour",
    "threshold": "0.5",
    "SequenceOnOff": "on",
    "SummaryMode": "off",
    "Verbose": "off",
}

try:
    resp = cf_requests.post(
        "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.cgi",
        data=form_data,
        impersonate="chrome",
        timeout=60,
    )
    if resp.status_code == 200 and "Prediction" in resp.text:
        matches = re.findall(
            r"Overall Prediction.*?=\\s*(-?[\\d.]+)\\s*\\(.*?(ANTIGEN|NON-ANTIGEN)",
            resp.text, re.IGNORECASE
        )
        results = []
        peptides = fasta.split("\\n")
        pep_seqs = [l.strip() for l in peptides if not l.startswith(">") and l.strip()]
        for i, (score, pred) in enumerate(matches):
            if i < len(pep_seqs):
                results.append({"peptide": pep_seqs[i], "score": float(score), "prediction": pred})
        print(json.dumps({"success": True, "results": results, "method": "curl_cffi"}))
    else:
        print(json.dumps({"success": False, "error": f"HTTP {resp.status_code}"}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`;

    try {
      const output = execSync(`python3 -c '${script.replace(/'/g, "\\'")}'`, {
        timeout: 120000,
        encoding: 'utf-8',
      });
      const result = JSON.parse(output.trim());
      if (result.success) {
        return NextResponse.json(result);
      }
    } catch {
      // curl_cffi failed
    }

    return NextResponse.json({ success: false, error: 'VaxiJen server blocked by Cloudflare' });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
