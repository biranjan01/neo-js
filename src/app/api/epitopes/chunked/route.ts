// API Route: POST /api/epitopes/chunked
// Handles chunked IEDB submission for large sequences (500K+ peptides)
// Chunks the sequence, submits each chunk, polls, merges results
// Returns BOTH canonical and mutated in one call to avoid redundant work

import { NextRequest, NextResponse } from 'next/server';
import { step5MHCI, step6MHCII, step7BCell } from '@/lib/step5-7-epitopes';

export const maxDuration = 3600;

export async function POST(request: NextRequest) {
  try {
    const { geneName, canonicalSeq, mutatedSeq, step } = await request.json();

    if (!geneName || !canonicalSeq || !mutatedSeq || !step) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const seqLen = canonicalSeq.length;
    const estimatedChunks = Math.ceil(seqLen / 2000);

    console.log(`[chunked] Step ${step}: canonical=${canonicalSeq.length}aa mutated=${mutatedSeq.length}aa (~${estimatedChunks} chunks each)`);

    let result: { canonical: { success: boolean; columns: string[]; rows: string[][]; error?: string }; mutated: { success: boolean; columns: string[]; rows: string[][]; error?: string } };

    if (step === 5) {
      result = await step5MHCI(geneName, canonicalSeq, mutatedSeq);
    } else if (step === 6) {
      result = await step6MHCII(geneName, canonicalSeq, mutatedSeq);
    } else if (step === 7) {
      result = await step7BCell(geneName, canonicalSeq, mutatedSeq);
    } else {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    console.log(`[chunked] Step ${step}: canonical=${result.canonical.rows.length} rows, mutated=${result.mutated.rows.length} rows`);

    return NextResponse.json({
      canonical: {
        columns: result.canonical.columns,
        rows: result.canonical.rows,
        error: result.canonical.error,
      },
      mutated: {
        columns: result.mutated.columns,
        rows: result.mutated.rows,
        error: result.mutated.error,
      },
      seqLen,
      chunks: estimatedChunks,
    });
  } catch (error) {
    console.error('[chunked] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
