// Step 9: VaxiJen Antigenicity Prediction
// Calls the Camoufox-based VaxiJen API server (bypasses Cloudflare)
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
  prediction: string;
}

const VAXIJEN_API_URL = process.env.VAXIJEN_API_URL || 'http://localhost:8000';

export async function runVaxijen(peptides: string[]): Promise<VaxijenResult> {
  const uniquePeptides = [...new Set(peptides)];
  console.log(`  VaxiJen: ${uniquePeptides.length} unique peptides → ${VAXIJEN_API_URL}`);

  try {
    const response = await fetch(`${VAXIJEN_API_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sequences: uniquePeptides,
        target: 'tumour',
        threshold: 0.5,
      }),
    });

    if (!response.ok) {
      throw new Error(`VaxiJen API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'VaxiJen API failed');
    }

    const results: VaxijenPeptide[] = data.predictions.map((p: { sequence: string; score: number; prediction: string }) => ({
      peptide: p.sequence,
      score: p.score,
      prediction: p.prediction,
    }));

    const antigens = results.filter(r => r.prediction === 'ANTIGEN').length;
    const nonAntigens = results.filter(r => r.prediction === 'NON-ANTIGEN').length;

    return {
      success: true,
      results,
      stats: {
        total: results.length,
        antigens,
        nonAntigens,
      },
    };
  } catch (err) {
    console.error('VaxiJen error:', (err as Error).message);
    return {
      success: false,
      results: [],
      stats: { total: 0, antigens: 0, nonAntigens: 0 },
      error: (err as Error).message,
    };
  }
}

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
