// Step 9: VaxiJen Antigenicity Prediction
// Uses Browserless.io cloud browser to bypass Cloudflare and submit to VaxiJen

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
  return peptides
    .map((pep, i) => `>pep${i + 1}\n${pep}`)
    .join('\n');
}

/**
 * Build the Browserless /function Puppeteer code that:
 * 1. Navigates to VaxiJen
 * 2. Fills the FASTA textarea
 * 3. Selects Target + Threshold
 * 4. Submits the form
 * 5. Waits for result page
 * 6. Extracts per-peptide scores
 */
function buildVaxijenScript(fasta: string, peptideCount: number): string {
  return `
export default async ({ page, context }) => {
  const fasta = ${JSON.stringify(fasta)};
  const count = ${peptideCount};

  await page.goto("${VAXIJEN_URL}", { waitUntil: "networkidle2", timeout: 60000 });

  // Fill the FASTA sequence textarea
  await page.waitForSelector("textarea[name='sequence']", { timeout: 15000 });
  await page.click("textarea[name='sequence']");
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.type("textarea[name='sequence']", fasta, { delay: 0 });

  // Select Target = Tumour
  const targetSelect = await page.$("select[name='Target']");
  if (targetSelect) {
    await page.select("select[name='Target']", "${TARGET}");
  }

  // Set threshold
  const thresholdInput = await page.$("input[name='threshold']");
  if (thresholdInput) {
    await page.click("input[name='threshold']");
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.type("input[name='threshold']", "${THRESHOLD}", { delay: 0 });
  }

  // Submit
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 }),
    page.click("input[type='submit'], button[type='submit']"),
  ]);

  // Wait for results to appear
  await page.waitForFunction(
    (cnt) => {
      const text = document.body.innerText;
      return (text.match(/Overall Prediction for the Protective Antigen/g) || []).length >= cnt;
    },
    { timeout: 120000 },
    count
  );

  // Extract results
  const results = await page.evaluate(() => {
    const text = document.body.innerText;
    const regex = /Overall Prediction for the Protective Antigen\\s*=\\s*(-?[\\d.]+)\\s*\\(([^)]+)\\)/gi;
    const matches = [];
    let m;
    while ((m = regex.exec(text)) !== null) {
      matches.push({ score: parseFloat(m[1]), prediction: m[2] });
    }
    return matches;
  });

  return { data: results, type: "application/json" };
};`;
}

/**
 * Submit a batch of peptides to VaxiJen via Browserless
 */
async function submitBatchViaBrowserless(
  peptides: string[],
  browserlessToken: string
): Promise<Map<string, VaxijenPeptide>> {
  const results = new Map<string, VaxijenPeptide>();
  const fasta = createFasta(peptides);

  const code = buildVaxijenScript(fasta, peptides.length);

  const response = await fetch(
    `https://production-sfo.browserless.io/function?token=${browserlessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/javascript' },
      body: code,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Browserless returned ${response.status}: ${errText.slice(0, 200)}`);
  }

  const json = await response.json();
  const matches: Array<{ score: number; prediction: string }> = json.data || [];

  for (let i = 0; i < matches.length && i < peptides.length; i++) {
    const predRaw = matches[i].prediction;
    const prediction = predRaw.toUpperCase().includes('NON') ? 'Non-antigen' : 'Antigen';
    results.set(peptides[i], {
      peptide: peptides[i],
      score: matches[i].score,
      prediction,
    });
  }

  return results;
}

/**
 * Run VaxiJen on neoantigen peptides via Browserless cloud browser
 */
export async function runVaxijen(
  peptides: string[],
  browserlessToken: string,
  batchSize: number = 50
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
      const batchResults = await submitBatchViaBrowserless(batch, browserlessToken);
      for (const pep of batch) {
        const result = batchResults.get(pep);
        if (result) {
          allResults.push(result);
        }
      }
      // Delay between batches to respect rate limits
      if (b < batches.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
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
