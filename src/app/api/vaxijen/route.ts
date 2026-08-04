import { NextRequest, NextResponse } from 'next/server';
import { callStreamlitApp, STREAMLIT_VAXIJEN } from '@/lib/streamlit-client';

export async function POST(req: NextRequest) {
  try {
    const { sequences, dummy } = await req.json();

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ error: 'No sequences provided' }, { status: 400 });
    }

    if (dummy) {
      const results = sequences.map((seq: string) => ({
        sequence: seq,
        score: Math.round((Math.random() * 2 + 0.3) * 10000) / 10000,
        prediction: Math.random() > 0.5 ? 'ANTIGEN' : 'NON-ANTIGEN',
      }));
      return NextResponse.json(results);
    }

    const results = await callStreamlitApp(STREAMLIT_VAXIJEN, sequences, {
      target: 'tumour',
      threshold: '0.5',
    });

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'VaxiJen prediction failed' }, { status: 500 });
  }
}
