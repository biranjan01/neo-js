import { NextRequest, NextResponse } from 'next/server';
import { oldIEDBMHCII } from '@/lib/step5-7-epitopes';
import { setProgress } from '@/app/api/progress/route';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { geneName, canonicalSeq, mutatedSeq, jobId } = await request.json();

    if (!geneName || !canonicalSeq || !mutatedSeq) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`[mhcii] MHC-II (Old API): canonical=${canonicalSeq.length}aa mutated=${mutatedSeq.length}aa`);

    const onProgress = (current: number, total: number, message: string) => {
      if (jobId) setProgress(jobId, current, total, message);
    };

    const result = await oldIEDBMHCII(geneName, canonicalSeq, mutatedSeq, onProgress);

    if (jobId) setProgress(jobId, 1, 1, 'Done', true);

    console.log(`[mhcii] canonical=${result.canonical.rows.length} rows, mutated=${result.mutated.rows.length} rows`);

    return NextResponse.json({
      canonical: { columns: result.canonical.columns, rows: result.canonical.rows, error: result.canonical.error },
      mutated: { columns: result.mutated.columns, rows: result.mutated.rows, error: result.mutated.error },
    });
  } catch (error) {
    console.error('[mhcii] Error:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
