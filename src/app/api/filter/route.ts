// API Route: POST /api/filter
// Step 8: Neoantigen Filtering

import { NextRequest, NextResponse } from 'next/server';
import { step8FilterNeoantigens, neoantigensToCSV } from '@/lib/step8-filter-neoantigens';
import { IEDBResult } from '@/lib/step5-7-epitopes';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { canonicalMHCI, mutatedMHCI, canonicalMHCII, mutatedMHCII } = body;

    console.log('--- Step 8: Neoantigen Filtering ---');

    const result = step8FilterNeoantigens(
      canonicalMHCI as IEDBResult,
      mutatedMHCI as IEDBResult,
      canonicalMHCII as IEDBResult,
      mutatedMHCII as IEDBResult
    );

    return NextResponse.json({
      success: result.success,
      step: 8,
      mhcI: {
        neoantigens: result.mhcI.rows.length,
        stats: result.mhcI.stats,
        csv: neoantigensToCSV(result.mhcI.columns, result.mhcI.rows),
        columns: result.mhcI.columns,
        rows: result.mhcI.rows.slice(0, 50), // Return first 50 for preview
      },
      mhcII: {
        neoantigens: result.mhcII.rows.length,
        stats: result.mhcII.stats,
        csv: neoantigensToCSV(result.mhcII.columns, result.mhcII.rows),
        columns: result.mhcII.columns,
        rows: result.mhcII.rows.slice(0, 50),
      },
    });
  } catch (error) {
    console.error('Filter error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
