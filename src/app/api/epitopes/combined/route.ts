import { NextRequest, NextResponse } from 'next/server';
import { step4_5MHCIAndII } from '@/lib/step5-7-epitopes';
import { setProgress, clearProgress } from '@/app/api/progress/route';

export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const { geneName, canonicalSeq, mutatedSeq, jobId } = await request.json();

    if (!geneName || !canonicalSeq || !mutatedSeq) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[combined] MHC-I+II: canonical=${canonicalSeq.length}aa mutated=${mutatedSeq.length}aa`);

    // Progress callback
    const onProgress = (current: number, total: number, message: string) => {
      if (jobId) setProgress(jobId, current, total, message);
    };

    const result = await step4_5MHCIAndII(geneName, canonicalSeq, mutatedSeq, onProgress);

    if (jobId) setProgress(jobId, 1, 1, 'Done', true);

    console.log(`[combined] MHC-I: ${result.mhci.mutated.rows.length} mut, MHC-II: ${result.mhcii.mutated.rows.length} mut`);

    return NextResponse.json({
      mhci: {
        canonical: { columns: result.mhci.canonical.columns, rows: result.mhci.canonical.rows, error: result.mhci.canonical.error },
        mutated: { columns: result.mhci.mutated.columns, rows: result.mhci.mutated.rows, error: result.mhci.mutated.error },
      },
      mhcii: {
        canonical: { columns: result.mhcii.canonical.columns, rows: result.mhcii.canonical.rows, error: result.mhcii.canonical.error },
        mutated: { columns: result.mhcii.mutated.columns, rows: result.mhcii.mutated.rows, error: result.mhcii.mutated.error },
      },
    });
  } catch (error) {
    console.error('[combined] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
