// API Route: POST /api/reference
// Step 3: Fetch reference protein sequence

import { NextRequest, NextResponse } from 'next/server';
import { step3FetchReference, generateMutatedSequence, toFASTA } from '@/lib/step3-fetch-reference';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { geneName, missenseCSV } = body;

    if (!geneName) {
      return NextResponse.json({ error: 'Gene name required' }, { status: 400 });
    }

    console.log(`--- Step 3: Fetching reference for ${geneName} ---`);
    const ref = await step3FetchReference(geneName);

    if (!ref.success) {
      return NextResponse.json({ error: ref.error, step: 3 }, { status: 400 });
    }

    // Parse missense mutations to generate mutated sequence
    let mutatedSeq = '';
    if (missenseCSV) {
      const lines = missenseCSV.split('\n');
      const header = lines[0].split(',');
      const posIdx = header.indexOf('Position');
      const refIdx = header.indexOf('Ref_AA');
      const altIdx = header.indexOf('Alt_AA');

      if (posIdx !== -1 && refIdx !== -1 && altIdx !== -1) {
        const mutations = lines.slice(1).map((line: string) => {
          const cols = line.split(',');
          return {
            Position: parseInt(cols[posIdx], 10),
            Ref_AA: cols[refIdx],
            Alt_AA: cols[altIdx],
          };
        }).filter((m: { Position: number }) => !isNaN(m.Position));

        mutatedSeq = generateMutatedSequence(ref.sequence, mutations);
      }
    }

    if (!mutatedSeq) {
      mutatedSeq = ref.sequence; // fallback
    }

    return NextResponse.json({
      success: true,
      step: 3,
      geneName,
      reference: {
        sequence: ref.sequence,
        accession: ref.accession,
        source: ref.source,
        length: ref.length,
        fasta: toFASTA(`ref_${geneName} | ${ref.accession}`, ref.sequence),
      },
      mutated: {
        sequence: mutatedSeq,
        length: mutatedSeq.length,
        fasta: toFASTA(`${geneName}_mutated`, mutatedSeq),
      },
    });
  } catch (error) {
    console.error('Reference fetch error:', error);
    return NextResponse.json(
      { error: `Server error: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
