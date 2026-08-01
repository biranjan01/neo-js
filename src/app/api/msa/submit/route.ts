// API Route: POST /api/msa/submit
// Step 4: Submit sequences to EBI MAFFT

import { NextRequest, NextResponse } from 'next/server';
import { ipv4Fetch } from '@/lib/ipv4-fetch';

const MAFFT_URL = 'https://www.ebi.ac.uk/Tools/services/rest/mafft';

export async function POST(request: NextRequest) {
  try {
    const { sequences } = await request.json();

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ error: 'sequences array required' }, { status: 400 });
    }

    const fasta = sequences.map((s: { header: string; sequence: string }) => `>${s.header}\n${s.sequence}`).join('\n');

    console.log(`Submitting ${sequences.length} sequences to EBI MAFFT...`);

    const body = new URLSearchParams({
      email: 'test@example.com',
      format: 'fasta',
      sequence: fasta,
      type: 'pro',
      outfmt: 'fasta',
    });

    const r = await ipv4Fetch(`${MAFFT_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      timeout: 120000,
    });

    const text = await r.text();
    // EBI returns XML error if email is invalid
    if (text.includes('<?xml') || text.includes('<error>')) {
      console.error('MAFFT error:', text.substring(0, 300));
      return NextResponse.json({ error: 'MAFFT submission failed' }, { status: 502 });
    }

    const jobId = text.trim();
    console.log(`MAFFT job submitted: ${jobId}`);

    return NextResponse.json({ jobId });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
