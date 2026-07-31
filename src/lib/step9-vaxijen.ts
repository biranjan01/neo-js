// Step 9: VaxiJen Antigenicity Prediction
// Uses FlareSolverr (open source) to bypass Cloudflare and submit to VaxiJen
// Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)

export interface VaxijenResult {
  success: boolean;
  results: VaxijenPeptide[];
  stats: {
    total: number;
    antigens: number;
    nonAntigens: number;
  };
  error?: string;
}

export interface VaxijenPeptide {
  peptide: string;
  score: number;
  prediction: string; // 'Antigen' | 'Non-antigen'
}

const VAXIJEN_URL = 'https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.cgi';
const TARGET = 'Tumour';
const THRESHOLD = '0.5';

function createFasta(peptides: string[]): string {
  return peptides.map((pep, i) => `>pep${i + 1}\n${pep}`).join('\n');
}

/**
 * Submit a batch of peptides to VaxiJen via FlareSolverr
 * FlareSolverr handles Cloudflare bypass using undetected-chromedriver
 */
async function submitBatchViaFlareSolverr(
  peptides: string[],
  flaresolverrUrl: string,
  sessionId?: string
): Promise<Map<string, VaxijenPeptide>> {
  const results = new Map<string, VaxijenPeptide>();
  const fasta = createFasta(peptides);

  // Build form data as URL-encoded string
  const formData = new URLSearchParams();
  formData.append('sequence', fasta);
  formData.append('Target', TARGET);
  formData.append('threshold', THRESHOLD);
  formData.append('SequenceOnOff', 'on');
  formData.append('SummaryMode', 'off');
  formData.append('Verbose', 'off');

  const payload: Record<string, unknown> = {
    cmd: 'request.post',
    url: VAXIJEN_URL,
    postData: formData.toString(),
    maxTimeout: 120000,
  };

  if (sessionId) {
    payload.session = sessionId;
  }

  const response = await fetch(`${flaresolverrUrl}/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`FlareSolverr returned ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'ok') {
    throw new Error(`FlareSolverr error: ${data.message}`);
  }

  const html = data.solution?.response || '';

  // Parse results
  const regex = /Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(([^)]+)\)/gi;
  const matches = [...html.matchAll(regex)];

  for (let i = 0; i < matches.length && i < peptides.length; i++) {
    const score = parseFloat(matches[i][1]);
    const predRaw = matches[i][2];
    const prediction = predRaw.toUpperCase().includes('NON') ? 'Non-antigen' : 'Antigen';
    results.set(peptides[i], {
      peptide: peptides[i],
      score,
      prediction,
    });
  }

  return results;
}

/**
 * Create a FlareSolverr session for reuse
 */
async function createSession(
  flaresolverrUrl: string,
  sessionId: string
): Promise<void> {
  const response = await fetch(`${flaresolverrUrl}/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cmd: 'sessions.create',
      session: sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create FlareSolverr session: ${response.status}`);
  }
}

/**
 * Destroy a FlareSolverr session
 */
async function destroySession(
  flaresolverrUrl: string,
  sessionId: string
): Promise<void> {
  try {
    await fetch(`${flaresolverrUrl}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'sessions.destroy',
        session: sessionId,
      }),
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Run VaxiJen on neoantigen peptides via FlareSolverr
 */
export async function runVaxijen(
  peptides: string[],
  flaresolverrUrl: string,
  batchSize: number = 50
): Promise<VaxijenResult> {
  const allResults: VaxijenPeptide[] = [];
  const errors: string[] = [];
  const uniquePeptides = [...new Set(peptides)];

  // Create a session for reuse
  const sessionId = `vaxijen-${Date.now()}`;
  try {
    await createSession(flaresolverrUrl, sessionId);
  } catch (err) {
    // If session creation fails, proceed without sessions
    console.warn('Could not create FlareSolverr session, using one-shot mode');
  }

  const batches: string[][] = [];
  for (let i = 0; i < uniquePeptides.length; i += batchSize) {
    batches.push(uniquePeptides.slice(i, i + batchSize));
  }

  try {
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      try {
        const batchResults = await submitBatchViaFlareSolverr(
          batch,
          flaresolverrUrl,
          sessionId
        );
        for (const pep of batch) {
          const result = batchResults.get(pep);
          if (result) {
            allResults.push(result);
          }
        }
        // Delay between batches
        if (b < batches.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        errors.push(`Batch ${b + 1}: ${(err as Error).message}`);
      }
    }
  } finally {
    // Cleanup session
    if (sessionId) {
      await destroySession(flaresolverrUrl, sessionId);
    }
  }

  const antigens = allResults.filter(r => r.prediction === 'Antigen').length;
  const nonAntigens = allResults.filter(r => r.prediction === 'Non-antigen').length;

  return {
    success: allResults.length > 0,
    results: allResults,
    stats: {
      total: allResults.length,
      antigens,
      nonAntigens,
    },
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

/**
 * Merge VaxiJen results into neoantigen rows
 */
export function mergeVaxijenIntoRows(
  columns: string[],
  rows: string[][],
  vaxijenResults: VaxijenPeptide[]
): { columns: string[]; rows: string[][] } {
  const pepIdx = columns.indexOf('peptide');
  if (pepIdx === -1) return { columns, rows };

  const lookup = new Map<string, VaxijenPeptide>();
  for (const r of vaxijenResults) {
    lookup.set(r.peptide, r);
  }

  const newCols = [...columns, 'vaxijen_score', 'vaxijen_prediction'];
  const newRows = rows.map(row => {
    const pep = row[pepIdx];
    const vax = lookup.get(pep);
    if (vax) {
      return [...row, String(vax.score), vax.prediction];
    }
    return [...row, 'N/A', 'N/A'];
  });

  return { columns: newCols, rows: newRows };
}
