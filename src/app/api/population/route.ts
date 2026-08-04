import { NextRequest, NextResponse } from 'next/server';
import { callStreamlitApp, STREAMLIT_POPCOVERAGE } from '@/lib/streamlit-client';

export async function POST(req: NextRequest) {
  try {
    const { epitope_alleles, population, mhc_class } = await req.json();

    if (!epitope_alleles || !Array.isArray(epitope_alleles) || epitope_alleles.length === 0) {
      return NextResponse.json({ error: 'No epitope-allele pairs provided' }, { status: 400 });
    }

    if (!STREAMLIT_POPCOVERAGE) {
      return NextResponse.json({ detail: 'Streamlit population coverage app URL not configured' }, { status: 500 });
    }

    const jobId = `${Date.now()}`;
    const params = new URLSearchParams({
      mode: 'upload',
      epitope_alleles: JSON.stringify(epitope_alleles),
      population: population || 'World',
      mhc_class: mhc_class || 'combined',
      job: jobId,
    });

    const url = `${STREAMLIT_POPCOVERAGE}?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
    const html = await res.text();

    const jsonMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
      || html.match(/data-testid="stJSON"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/\{[\s\S]*"summary"[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr.replace(/<[^>]+>/g, ''));
        return NextResponse.json(parsed);
      } catch {
        // fallback
      }
    }

    return NextResponse.json({ summary: [], chart: [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Population coverage failed' }, { status: 500 });
  }
}
