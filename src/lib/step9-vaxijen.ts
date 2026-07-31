// Step 9: VaxiJen Antigenicity Prediction
// Uses ScrapingBee to bypass Cloudflare and submit to VaxiJen server
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
const SCRAPINGBEE_URL = 'https://app.scrapingbee.com/api/v1';

function createFasta(peptides: string[]): string {
  return peptides.map((pep, i) => `>pep${i + 1}\n${pep}`).join('\n');
}

/**
 * Submit peptides to VaxiJen via ScrapingBee
 * ScrapingBee handles Cloudflare bypass
 */
async function submitBatchViaScrapingBee(
  peptides: string[],
  apiKey: string
): Promise<Map<string, VaxijenPeptide>> {
  const results = new Map<string, VaxijenPeptide>();
  const fasta = createFasta(peptides);

  // JavaScript scenario to fill form and submit
  const scenario = {
    instructions: [
      // Wait for page to load
      { wait_for: "textarea[name='sequence']" },
      // Fill FASTA sequence
      { fill: ["textarea[name='sequence']", fasta] },
      // Select Target = Tumour
      { evaluate: "document.querySelector(\"select[name='Target']\").value = \"Tumour\"" },
      // Set threshold
      { fill: ["input[name='threshold']", THRESHOLD] },
      // Submit form
      { click: "input[type='submit'], button[type='submit']" },
      // Wait for results
      { wait_for: "text=Overall Prediction" },
      { wait: 2000 },
    ],
  };

  const params = new URLSearchParams({
    url: VAXIJEN_URL,
    render_js: 'true',
    wait_browser: 'networkidle2',
    js_scenario: JSON.stringify(scenario),
  });

  const response = await fetch(`${SCRAPINGBEE_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ScrapingBee returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  const html = await response.text();

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
 * Run VaxiJen on neoantigen peptides via ScrapingBee
 */
export async function runVaxijen(
  peptides: string[],
  scrapingbeeApiKey: string,
  batchSize: number = 10 // Smaller batches to save credits
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
      const batchResults = await submitBatchViaScrapingBee(batch, scrapingbeeApiKey);
      for (const pep of batch) {
        const result = batchResults.get(pep);
        if (result) {
          allResults.push(result);
        }
      }
      // Delay between batches
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
