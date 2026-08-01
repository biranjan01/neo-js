// API Route: POST /api/epitopes
// Steps 5-7: Epitope Prediction via IEDB API

import { NextRequest, NextResponse } from 'next/server';
import { step5MHCI, step6MHCII, step7BCell } from '@/lib/step5-7-epitopes';

export const maxDuration = 600; // 10 minutes

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { geneName, canonicalSeq, mutatedSeq, steps } = body;

    if (!geneName || !canonicalSeq || !mutatedSeq) {
      return NextResponse.json({ error: 'geneName, canonicalSeq, mutatedSeq required' }, { status: 400 });
    }

    const results: Record<string, unknown> = { success: true, step: 5, geneName };

    // Step 5: MHC-I
    if (!steps || steps.includes(5)) {
      console.log('--- Step 5: MHC-I Epitope Prediction ---');
      const mhci = await step5MHCI(geneName, canonicalSeq, mutatedSeq);
      results.mhci = {
        canonical: { success: mhci.canonical.success, columns: mhci.canonical.columns, rowCount: mhci.canonical.rows.length },
        mutated: { success: mhci.mutated.success, columns: mhci.mutated.columns, rowCount: mhci.mutated.rows.length },
      };
    }

    // Step 6: MHC-II
    if (!steps || steps.includes(6)) {
      console.log('--- Step 6: MHC-II Epitope Prediction ---');
      const mhcii = await step6MHCII(geneName, canonicalSeq, mutatedSeq);
      results.mhcii = {
        canonical: { success: mhcii.canonical.success, columns: mhcii.canonical.columns, rowCount: mhcii.canonical.rows.length },
        mutated: { success: mhcii.mutated.success, columns: mhcii.mutated.columns, rowCount: mhcii.mutated.rows.length },
      };
    }

    // Step 7: B-cell
    if (!steps || steps.includes(7)) {
      console.log('--- Step 7: B-cell Epitope Prediction ---');
      const bcell = await step7BCell(geneName, canonicalSeq, mutatedSeq);
      results.bcell = {
        canonical: { success: bcell.canonical.success, columns: bcell.canonical.columns, rowCount: bcell.canonical.rows.length },
        mutated: { success: bcell.mutated.success, columns: bcell.mutated.columns, rowCount: bcell.mutated.rows.length },
      };
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Epitope prediction error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
