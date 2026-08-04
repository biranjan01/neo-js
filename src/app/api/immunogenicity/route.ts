import { NextRequest, NextResponse } from 'next/server';
import { callFlaskEndpoint } from '@/lib/streamlit-client';

export async function POST(req: NextRequest) {
  try {
    const { sequences, dummy } = await req.json();

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ error: 'No sequences provided' }, { status: 400 });
    }

    if (dummy) {
      const results = sequences.map((seq: string) => {
        const pred = Math.random() > 0.5 ? 'IMMUNOGEN' : 'NON-IMMUNOGEN';
        const prob = pred === 'IMMUNOGEN'
          ? Math.round((Math.random() * 50 + 50) * 10) / 10
          : Math.round((Math.random() * 50) * 10) / 10;
        return { sequence: seq, score: prob, prediction: pred };
      });
      return NextResponse.json(results);
    }

    const results = await callFlaskEndpoint('/immunogenicity', {
      sequences,
      target: 'tumour',
    });

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'Immunogenicity prediction failed' }, { status: 500 });
  }
}
