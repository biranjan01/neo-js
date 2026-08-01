// API Route: POST /api/protparam
// Step 12: ProtParam Physicochemical Properties via ExPASy

import { NextRequest, NextResponse } from 'next/server';
import { runProtparam } from '@/lib/step12-protparam';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { peptides } = body;

    if (!peptides || !Array.isArray(peptides) || peptides.length === 0) {
      return NextResponse.json(
        { error: 'No peptides provided' },
        { status: 400 }
      );
    }

    console.log(`--- Step 12: ProtParam ---`);
    console.log(`  Peptides: ${peptides.length}`);

    const ppResult = await runProtparam(peptides);

    if (!ppResult.success) {
      console.warn('  ExPASy ProtParam failed for all peptides — returning empty results');
    }

    return NextResponse.json({
      success: ppResult.results.length > 0,
      step: 12,
      stats: ppResult.stats,
      results: ppResult.results,
    });
  } catch (error) {
    console.error('ProtParam error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
