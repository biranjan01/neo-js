// Step 9: VaxiJen Antigenicity Prediction
// Uses the VaxiJen CGI API to predict protective antigens

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
const THRESHOLD = '0.5';
const TARGET = 'Tumour';

function createFasta(peptides: string[]): string {
  return peptides
    .map((pep, i) => `>pep${i + 1}\n${pep}`)
    .join('\n');
}

/**
 * Submit a batch of peptides to VaxiJen API
 */
async function submitBatch(peptides: string[]): Promise<Map<string, VaxijenPeptide>> {
  const results = new Map<string, VaxijenPeptide>();
  const fasta = createFasta(peptides);

  const formData = new URLSearchParams();
  formData.append('sequence', fasta);
  formData.append('Target', TARGET);
  formData.append('threshold', THRESHOLD);
  formData.append('SequenceOnOff', 'on');
  formData.append('SummaryMode', 'off');
  formData.append('Verbose', 'off');

  const response = await fetch(VAXIJEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`VaxiJen API returned ${response.status}`);
  }

  const html = await response.text();

  // Parse results from HTML
  // Pattern: Overall Prediction for the Protective Antigen = <score> (<ANTIGEN/NON-ANTIGEN>)
  const regex = /Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(([^)]+)\)/gi;
  const matches = [...html.matchAll(regex)];

  // Extract peptide names in order
  const pepNames = peptides;

  for (let i = 0; i < matches.length && i < pepNames.length; i++) {
    const score = parseFloat(matches[i][1]);
    const predRaw = matches[i][2];
    const prediction = predRaw.toUpperCase().includes('NON') ? 'Non-antigen' : 'Antigen';
    results.set(pepNames[i], {
      peptide: pepNames[i],
      score,
      prediction,
    });
  }

  return results;
}

/**
 * Run VaxiJen on a list of neoantigen peptides
 * Batches of 50 to avoid overwhelming the API
 */
export async function runVaxijen(
  peptides: string[],
  batchSize: number = 50
): Promise<VaxijenResult> {
  const allResults: VaxijenPeptide[] = [];
  const errors: string[] = [];

  // Get unique peptides
  const uniquePeptides = [...new Set(peptides)];

  // Process in batches
  const batches: string[][] = [];
  for (let i = 0; i < uniquePeptides.length; i += batchSize) {
    batches.push(uniquePeptides.slice(i, i + batchSize));
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const batchResults = await submitBatch(batch);
      for (const pep of batch) {
        const result = batchResults.get(pep);
        if (result) {
          allResults.push(result);
        }
      }
      // Small delay between batches
      if (b < batches.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err) {
      errors.push(`Batch ${b + 1}: ${(err as Error).message}`);
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
 * Adds vaxijen_score and vaxijen_prediction columns
 */
export function mergeVaxijenIntoRows(
  columns: string[],
  rows: string[][],
  vaxijenResults: VaxijenPeptide[]
): { columns: string[]; rows: string[][] } {
  const pepIdx = columns.indexOf('peptide');
  if (pepIdx === -1) return { columns, rows };

  // Build lookup
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
