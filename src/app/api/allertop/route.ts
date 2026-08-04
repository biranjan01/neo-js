import { NextRequest, NextResponse } from 'next/server';
import { callStreamlitApp, STREAMLIT_ALLERTOP } from '@/lib/streamlit-client';

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
        similar_protein: 'sp|DUMMY|MOCK_HUMAN Mock protein OS=Homo sapiens',
      }));
      return NextResponse.json(results);
    }

    if (!STREAMLIT_ALLERTOP) {
      return NextResponse.json({ detail: 'Streamlit AllerTOP app URL not configured' }, { status: 500 });
    }

    const results = await callStreamlitApp(STREAMLIT_ALLERTOP, sequences);

    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'AllerTOP prediction failed' }, { status: 500 });
  }
}
