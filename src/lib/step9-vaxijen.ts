// Step 9: VaxiJen Antigenicity Prediction
// Uses Stagehand (open source, MIT) + Browserbase (free tier) for Cloudflare bypass
// Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)

import { Stagehand } from '@browserbasehq/stagehand';

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

const VAXIJEN_URL = 'https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.html';
const TARGET = 'tumour';
const THRESHOLD = '0.5';

function createFasta(peptides: string[]): string {
  return peptides.map((pep, i) => `>pep${i + 1}\n${pep}`).join('\n');
}

/**
 * Submit peptides to VaxiJen using Stagehand AI browser automation
 */
async function submitBatchViaStagehand(
  peptides: string[],
  browserbaseApiKey: string
): Promise<Map<string, VaxijenPeptide>> {
  const results = new Map<string, VaxijenPeptide>();
  const fasta = createFasta(peptides);

  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: browserbaseApiKey,
  });

  await stagehand.init();
  const page = stagehand.context.pages()[0];

  try {
    // Navigate to VaxiJen
    await page.goto(VAXIJEN_URL);

    // Fill the form using natural language act
    await stagehand.act(`Type the following protein sequence into the textarea: ${fasta}`);

    await stagehand.act(`Select "Tumour" from the Target Organism dropdown`);

    await stagehand.act(`Set the threshold value to ${THRESHOLD}`);

    await stagehand.act(`Make sure the Sequence Output checkbox is checked`);

    // Submit the form
    await stagehand.act(`Click the submit button`);

    // Wait for results page
    await page.waitForTimeout(10000);

    // Extract results using structured extraction
    const extractResult = await stagehand.extract(
      'Extract all Overall Prediction for the Protective Antigen results. For each one, get the numeric score and the prediction (ANTIGEN or NON-ANTIGEN).',
    );

    // Parse results
    const text = JSON.stringify(extractResult);
    const regex = /Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(([^)]+)\)/gi;
    const matches = [...text.matchAll(regex)];

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
  } finally {
    await stagehand.close();
  }

  return results;
}

/**
 * Run VaxiJen on neoantigen peptides
 */
export async function runVaxijen(
  peptides: string[],
  browserbaseApiKey: string,
  batchSize: number = 10
): Promise<VaxijenResult> {
  const allResults: VaxijenPeptide[] = [];
  const errors: string[] = [];
  const uniquePeptides = [...new Set(peptides)];

  const batches: string[][] = [];
  for (let i = 0; i < uniquePeptides.length; i += batchSize) {
    batches.push(uniquePeptides.slice(i, i + batchSize));
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    try {
      const batchResults = await submitBatchViaStagehand(batch, browserbaseApiKey);
      for (const pep of batch) {
        const result = batchResults.get(pep);
        if (result) {
          allResults.push(result);
        }
      }
      if (b < batches.length - 1) {
        await new Promise(r => setTimeout(r, 3000));
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
