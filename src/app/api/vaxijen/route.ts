// API Route: POST /api/vaxijen
// Step 9: VaxiJen Antigenicity Prediction
// Calls Camoufox-based VaxiJen API server
// Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)

import { NextRequest, NextResponse } from 'next/server';
import { runVaxijen, mergeVaxijenIntoRows } from '@/lib/step9-vaxijen';

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

    console.log(`--- Step 9: VaxiJen (Camoufox) ---`);
    console.log(`  Peptides: ${peptides.length}`);

    const vaxResult = await runVaxijen(peptides);

    if (!vaxResult.success) {
      return NextResponse.json({
        success: false,
        error: vaxResult.error || 'VaxiJen API failed',
      });
    }

    let mergedColumns = columns || [];
    let mergedRows = rows || [];

    if (columns && rows && rows.length > 0) {
      const merged = mergeVaxijenIntoRows(columns, rows, vaxResult.results);
      mergedColumns = merged.columns;
      mergedRows = merged.rows;
    }

    return NextResponse.json({
      success: true,
      step: 9,
      citation: 'Doyon et al., BMC Bioinformatics 9:4 (2008)',
      stats: vaxResult.stats,
      columns: mergedColumns,
      rows: mergedRows.slice(0, 50),
      fullCsv: mergedColumns.length > 0
        ? [mergedColumns.join(','), ...mergedRows.map((r: string[]) => r.join(','))].join('\n')
        : '',
    });
  } catch (error) {
    console.error('VaxiJen error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
