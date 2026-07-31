// API Route: GET /api/msa/poll?jobId=xxx
// Poll MAFFT job status and get result

import { NextRequest, NextResponse } from 'next/server';

const MAFFT_URL = 'https://www.ebi.ac.uk/Tools/services/rest/mafft';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }

    // Check status
    const statusR = await fetch(`${MAFFT_URL}/status/${jobId}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!statusR.ok) {
      return NextResponse.json({ error: `Status check failed: ${statusR.status}` }, { status: 502 });
    }

    const status = (await statusR.text()).trim();

    if (status === 'FINISHED') {
      // Fetch alignment result
      const resultR = await fetch(`${MAFFT_URL}/result/${jobId}/out`, {
        signal: AbortSignal.timeout(30000),
      });

      if (!resultR.ok) {
        return NextResponse.json({ error: 'Failed to fetch result' }, { status: 502 });
      }

      const alignment = await resultR.text();

      // Parse alignment stats
      const seqHeaders = alignment.split('\n').filter((l: string) => l.startsWith('>'));
      const seqCount = seqHeaders.length;
      const alignmentLength = alignment
        .split('\n')
        .filter((l: string) => !l.startsWith('>'))
        .join('')
        .replace(/\s/g, '').length;

      // Build Clustal format
      const clustal = convertToClustal(alignment);

      return NextResponse.json({
        status: 'done',
        alignment,
        clustal,
        stats: { sequences: seqCount, length: alignmentLength },
      });
    }

    if (status === 'ERROR' || status === 'FAILURE') {
      return NextResponse.json({ status: 'failed', error: 'MAFFT job failed' });
    }

    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

function convertToClustal(fasta: string): string {
  const entries: { header: string; seq: string }[] = [];
  let current = { header: '', seq: '' };

  for (const line of fasta.split('\n')) {
    if (line.startsWith('>')) {
      if (current.header) entries.push(current);
      current = { header: line.slice(1).trim(), seq: '' };
    } else {
      current.seq += line.trim();
    }
  }
  if (current.header) entries.push(current);
  if (entries.length === 0) return '';

  const maxLen = Math.max(...entries.map((e) => e.header.length));
  const lines: string[] = ['CLUSTAL W formatted alignment', ''];

  for (let i = 0; i < entries[0].seq.length; i += 60) {
    for (const entry of entries) {
      lines.push(`${entry.header.padEnd(maxLen)}  ${entry.seq.slice(i, i + 60)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
