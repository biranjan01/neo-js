// Step 4: MSA Alignment via EBI MAFFT REST API

export interface Step4Result {
  success: boolean;
  alignment: string;
  formats: {
    fasta: string;
    clustal: string;
  };
  jobUrl: string;
  length: number;
  sequenceCount: number;
  error?: string;
}

/**
 * Submit sequences to EBI MAFFT and poll for result
 */
export async function step4MSA(
  sequences: { header: string; sequence: string }[]
): Promise<Step4Result> {
  console.log(`Submitting ${sequences.length} sequences to EBI MAFFT...`);

  // Build FASTA input
  const fasta = sequences
    .map((s) => `>${s.header}\n${s.sequence}`)
    .join('\n');

  try {
    // Submit job
    const submitR = await fetch('https://www.ebi.ac.uk/Tools/services/rest/mafft/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'pipeline@neopeptide.app',
        format: 'fasta',
        sequence: fasta,
        type: 'pro',
        outfmt: 'fasta',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!submitR.ok) {
      return {
        success: false,
        alignment: '',
        formats: { fasta: '', clustal: '' },
        jobUrl: '',
        length: 0,
        sequenceCount: 0,
        error: `MAFFT submit failed: ${submitR.status}`,
      };
    }

    const jobId = (await submitR.text()).trim();
    console.log(`  MAFFT job submitted: ${jobId}`);

    // Poll for result
    const maxWait = 300; // 5 minutes
    const pollInterval = 5; // 5 seconds
    let waited = 0;

    while (waited < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval * 1000));
      waited += pollInterval;

      try {
        const statusR = await fetch(
          `https://www.ebi.ac.uk/Tools/services/rest/mafft/status/${jobId}`,
          { signal: AbortSignal.timeout(15000) }
        );

        if (!statusR.ok) continue;

        const status = (await statusR.text()).trim();
        console.log(`  MAFFT status: ${status} (${waited}s)`);

        if (status === 'FINISHED') {
          // Fetch result
          const resultR = await fetch(
            `https://www.ebi.ac.uk/Tools/services/rest/mafft/result/${jobId}/out`,
            { signal: AbortSignal.timeout(30000) }
          );

          if (!resultR.ok) {
            return {
              success: false,
              alignment: '',
              formats: { fasta: '', clustal: '' },
              jobUrl: `https://www.ebi.ac.uk/Tools/services/rest/mafft/result/${jobId}/out`,
              length: 0,
              sequenceCount: 0,
              error: 'Failed to fetch MAFFT result',
            };
          }

          const alignment = await resultR.text();
          const lines = alignment.split('\n').filter((l) => l.startsWith('>'));
          const alignmentLength = alignment.includes('>')
            ? alignment
                .split('\n')
                .filter((l) => !l.startsWith('>'))
                .join('')
                .replace(/\s/g, '').length
            : 0;

          console.log(
            `  MAFFT complete: ${lines.length} sequences, ${alignmentLength} columns`
          );

          return {
            success: true,
            alignment,
            formats: {
              fasta: alignment,
              clustal: convertToClustal(alignment),
            },
            jobUrl: `https://www.ebi.ac.uk/Tools/services/rest/mafft/result/${jobId}/out`,
            length: alignmentLength,
            sequenceCount: lines.length,
          };
        }

        if (status === 'ERROR' || status === 'FAILURE') {
          return {
            success: false,
            alignment: '',
            formats: { fasta: '', clustal: '' },
            jobUrl: '',
            length: 0,
            sequenceCount: 0,
            error: `MAFFT job failed with status: ${status}`,
          };
        }
      } catch (e) {
        console.warn(`  Poll error: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    return {
      success: false,
      alignment: '',
      formats: { fasta: '', clustal: '' },
      jobUrl: '',
      length: 0,
      sequenceCount: 0,
      error: `MAFFT timed out after ${maxWait}s`,
    };
  } catch (e) {
    return {
      success: false,
      alignment: '',
      formats: { fasta: '', clustal: '' },
      jobUrl: '',
      length: 0,
      sequenceCount: 0,
      error: `MAFFT error: ${(e as Error).message}`,
    };
  }
}

/**
 * Convert FASTA alignment to Clustal format
 */
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

  const chunkSize = 60;
  for (let i = 0; i < entries[0].seq.length; i += chunkSize) {
    for (const entry of entries) {
      const chunk = entry.seq.slice(i, i + chunkSize);
      lines.push(`${entry.header.padEnd(maxLen)}  ${chunk}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
