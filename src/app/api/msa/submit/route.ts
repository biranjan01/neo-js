// API Route: POST /api/msa/submit
// Step 4: Submit sequences to EBI MAFFT (fast, <10s)

import { NextRequest, NextResponse } from 'next/server';

const MAFFT_URL = 'https://www.ebi.ac.uk/Tools/services/rest/mafft';

export async function POST(request: NextRequest) {
  try {
    const { sequences } = await request.json();

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ error: 'sequences array required' }, { status: 400 });
    }

    // Build FASTA input
    const fasta = sequences.map((s: { header: string; sequence: string }) => `>${s.header}\n${s.sequence}`).join('\n');

    console.log(`Submitting ${sequences.length} sequences to EBI MAFFT...`);

    const r = await fetch(`${MAFFT_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'pipeline@neopeptide.app',
        format: 'fasta',
        sequence: fasta,
        type: 'pro',
        outfmt: 'fasta',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!r.ok) {
      return NextResponse.json({ error: `MAFFT submit failed: ${r.status}` }, { status: 502 });
    }

    const jobId = (await r.text()).trim();
    console.log(`MAFFT job submitted: ${jobId}`);

    return NextResponse.json({ jobId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
