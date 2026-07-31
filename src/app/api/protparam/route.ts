// API Route: POST /api/protparam
// Step 12: ProtParam Physicochemical Properties

import { NextRequest, NextResponse } from 'next/server';
import { runProtparam, mergeProtparamIntoRows } from '@/lib/step12-protparam';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { peptides, columns, rows } = body;

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
      return NextResponse.json({
        success: false,
        error: 'ProtParam API failed for all peptides',
      });
    }

    // Merge results into rows if provided
    let mergedColumns = columns || [];
    let mergedRows = rows || [];

    if (columns && rows && rows.length > 0) {
      const merged = mergeProtparamIntoRows(columns, rows, ppResult.results);
      mergedColumns = merged.columns;
      mergedRows = merged.rows;
    }

    return NextResponse.json({
      success: true,
      step: 12,
      stats: ppResult.stats,
      columns: mergedColumns,
      rows: mergedRows.slice(0, 50),
      fullCsv: mergedColumns.length > 0
        ? [mergedColumns.join(','), ...mergedRows.map((r: string[]) => r.join(','))].join('\n')
        : '',
    });
  } catch (error) {
    console.error('ProtParam error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
