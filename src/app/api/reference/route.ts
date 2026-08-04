// API Route: POST /api/reference
// Step 3: Fetch reference protein sequence

import { NextRequest, NextResponse } from 'next/server';
import { step3FetchReference, generateMutatedSequence, toFASTA } from '@/lib/step3-fetch-reference';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { geneName, missenseCSV, frequencyCSV } = body;

    if (!geneName) {
      return NextResponse.json({ error: 'Gene name required' }, { status: 400 });
    }

    console.log(`--- Step 3: Fetching reference for ${geneName} ---`);
    const ref = await step3FetchReference(geneName);

    if (!ref.success) {
      return NextResponse.json({ error: ref.error, step: 3 }, { status: 400 });
    }

    // Parse missense mutations to generate mutated sequence
    // If frequencyCSV is provided, use it for freq-weighted mutation selection
    let mutatedSeq = '';
    if (missenseCSV) {
      const lines = missenseCSV.split('\n');
      const header = lines[0].split(',');
      const posIdx = header.indexOf('Position');
      const refIdx = header.indexOf('Ref_AA');
      const altIdx = header.indexOf('Alt_AA');

      // Build frequency map from frequencyCSV if available
      const freqMap = new Map<string, number>();
      if (frequencyCSV) {
        const freqLines = frequencyCSV.split('\n');
        const freqHeader = freqLines[0].split(',');
        const fPosIdx = freqHeader.indexOf('Position');
        const fRefIdx = freqHeader.indexOf('Ref_AA');
        const fAltIdx = freqHeader.indexOf('Alt_AA');
        const fCountIdx = freqHeader.indexOf('Patient_Count');
        if (fPosIdx !== -1 && fRefIdx !== -1 && fAltIdx !== -1 && fCountIdx !== -1) {
          for (let i = 1; i < freqLines.length; i++) {
            const cols = freqLines[i].split(',');
            const key = `${cols[fPosIdx]}_${cols[fRefIdx]}_${cols[fAltIdx]}`;
            freqMap.set(key, parseInt(cols[fCountIdx], 10) || 1);
          }
        }
      }

      if (posIdx !== -1 && refIdx !== -1 && altIdx !== -1) {
        const mutations = lines.slice(1).map((line: string) => {
          const cols = line.split(',');
          const pos = parseInt(cols[posIdx], 10);
          const refAA = cols[refIdx];
          const altAA = cols[altIdx];
          const freqKey = `${cols[posIdx]}_${cols[refIdx]}_${cols[altIdx]}`;
          return {
            Position: pos,
            Ref_AA: refAA,
            Alt_AA: altAA,
            Patient_Count: freqMap.get(freqKey) ?? 1,
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
