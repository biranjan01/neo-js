import { NextRequest, NextResponse } from 'next/server';
import { callFlaskEndpoint } from '@/lib/streamlit-client';

export async function POST(req: NextRequest) {
  try {
    const { sequences, dummy } = await req.json();

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ error: 'No sequences provided' }, { status: 400 });
    }

    if (dummy) {
      const results = sequences.map((seq: string) => ({
        sequence: seq,
        prediction: Math.random() > 0.5 ? 'NON-ALLERGEN' : 'ALLERGEN',
        similar_protein: null,
      }));
      return NextResponse.json(results);
    }

    const results = await callFlaskEndpoint('/allertop', { sequences });

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'AllerTOP prediction failed' }, { status: 500 });
  }
}
