import { NextRequest, NextResponse } from 'next/server';
import { callFlaskEndpoint } from '@/lib/streamlit-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { epitope_alleles, population, mhc_class } = body;

    if (!epitope_alleles || !Array.isArray(epitope_alleles) || epitope_alleles.length === 0) {
      return NextResponse.json({ error: 'No epitope-allele pairs provided' }, { status: 400 });
    }

    const result = await callFlaskEndpoint('/population', {
      epitope_alleles,
      population: population || 'World',
      mhc_class: mhc_class || 'combined',
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ detail: error.message || 'Population coverage failed' }, { status: 500 });
  }
}
