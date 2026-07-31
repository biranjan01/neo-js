// API Route: POST /api/vaxijen
// Step 9: VaxiJen Antigenicity Prediction

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

    console.log(`--- Step 9: VaxiJen ---`);
    console.log(`  Peptides: ${peptides.length}`);

    const browserlessToken = process.env.BROWSERLESS_TOKEN || 'none';
    const browserlessUrl = process.env.BROWSERLESS_URL;

    if (!browserlessUrl && !process.env.BROWSERLESS_TOKEN) {
      return NextResponse.json(
        { error: 'Browser service not configured. Deploy browser-service to Railway and set BROWSERLESS_URL in .env.local. See browser-service/README.md' },
        { status: 500 }
      );
    }

    const vaxResult = await runVaxijen(peptides, browserlessToken, browserlessUrl);

    if (!vaxResult.success) {
      return NextResponse.json({
        success: false,
        error: vaxResult.error || 'VaxiJen API failed',
      });
    }

    // Merge results into rows if provided
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
      stats: vaxResult.stats,
      columns: mergedColumns,
      rows: mergedRows.slice(0, 50), // First 50 for preview
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
