// API Route: POST /api/process
// Accepts CSV upload, runs Steps 1-2, returns results

import { NextRequest, NextResponse } from 'next/server';
import { step1ParseMutations } from '@/lib/step1-parse-mutations';
import { step2AnalyzeFrequency, missenseToCSV, frequencyToCSV } from '@/lib/step2-frequency';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const geneName = (formData.get('geneName') as string) || 'GENE';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Please upload a CSV file' }, { status: 400 });
    }

    const csvText = await file.text();
    console.log(`Processing ${file.name} (${csvText.length} bytes) for gene: ${geneName}`);

    // Step 1
    console.log('--- Step 1: Parsing mutations ---');
    const step1 = step1ParseMutations(csvText, geneName);

    if (!step1.success) {
      return NextResponse.json(
        { error: step1.error, step: 1, totalRows: step1.totalRows },
        { status: 400 }
      );
    }

    // Step 2
    console.log('--- Step 2: Analyzing frequency ---');
    const step2 = step2AnalyzeFrequency(step1.missense);

    if (!step2.success) {
      return NextResponse.json({ error: step2.error, step: 2 }, { status: 400 });
    }

    const missenseCSV = missenseToCSV(step1.missense);
    const frequencyCSV = frequencyToCSV(step2.summary);

    return NextResponse.json({
      success: true,
      geneName,
      step: 2,
      stats: {
        totalRawRows: step1.totalRows,
        totalMissense: step1.totalMissense,
        uniquePositions: step2.uniquePositions,
        hotspotCount: step2.hotspotCount,
        totalSamples: step2.totalSamples,
      },
      topMutations: step2.summary.slice(0, 20),
      outputs: {
        missense_simple: missenseCSV,
        mutation_summary: frequencyCSV,
      },
    });
  } catch (error) {
    console.error('Pipeline error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
