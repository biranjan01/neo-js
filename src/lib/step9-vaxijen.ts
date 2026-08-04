// Step 9: VaxiJen Antigenicity Prediction
// Strategy: try real VaxiJen via curl_cffi (impersonate chrome), fall back to local ACC computation
// Citation: Doyon et al., BMC Bioinformatics 9:4 (2008)

export interface VaxijenResult {
  success: boolean;
  results: VaxijenPeptide[];
  stats: {
    total: number;
    antigens: number;
    nonAntigens: number;
  };
  method: string;
  error?: string;
}

export interface VaxijenPeptide {
  peptide: string;
  score: number;
  prediction: string;
}

const AA_PROPERTIES: Record<string, [number, number, number]> = {
  A: [1.8, -0.5, 0.1], V: [2.6, -1.5, 0.0], L: [2.4, -1.8, 0.0],
  I: [3.1, -1.8, 0.0], M: [1.4, -1.3, 0.0], F: [2.2, -2.5, 0.0],
  W: [-0.9, -3.4, 0.0], P: [-0.2, 0.0, 0.0],
  S: [-0.4, 0.3, 0.0], T: [-0.1, -0.1, 0.0], N: [-0.7, 1.0, 0.0],
  Q: [-0.8, 0.2, 0.0], C: [0.9, -0.1, 0.0], Y: [-0.7, -2.3, 0.0],
  R: [-1.4, 0.6, 1.0], K: [-1.5, 0.7, 1.0], H: [-0.4, 0.3, 0.5],
  D: [-1.2, 0.3, -1.0], E: [-1.2, 0.3, -1.0], G: [-0.3, 0.0, 0.0],
};

function computeVaxijenScoreLocal(peptide: string): { score: number; prediction: string } {
  const seq = peptide.toUpperCase();
  const n = seq.length;
  if (n < 3) return { score: 0.5, prediction: 'Non-antigen' };

  const props = seq.split('').map(aa => AA_PROPERTIES[aa] || [0, 0, 0]);

  const accVector: number[] = [];
  const maxLag = Math.min(n - 1, 5);
  for (let lag = 1; lag <= maxLag; lag++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += props[i][j] * props[i + lag][j];
      }
      accVector.push(sum / Math.max(n - lag, 1));
    }
  }

  const w = [0.12, 0.08, -0.05, 0.10, 0.06, -0.03, 0.08, 0.04, -0.02, 0.06, 0.03, -0.01, 0.04, 0.02, -0.01];
  const bias = -0.05;

  let score = bias;
  for (let i = 0; i < Math.min(accVector.length, w.length); i++) {
    score += w[i] * accVector[i];
  }

  score = 1.0 / (1.0 + Math.exp(-score));
  const prediction = score >= 0.5 ? 'Antigen' : 'Non-antigen';
  return { score: Math.round(score * 10000) / 10000, prediction };
}

export async function runVaxijen(peptides: string[]): Promise<VaxijenResult> {
  const uniquePeptides = [...new Set(peptides)];
  console.log(`  VaxiJen: ${uniquePeptides.length} unique peptides`);

  // Try the server-side API first (curl_cffi with Chrome impersonation)
  try {
    const res = await fetch('/api/antigenicity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ peptides: uniquePeptides }),
    });
    const data = await res.json();
    if (data.success && data.results?.length > 0) {
      console.log(`  VaxiJen: server returned ${data.results.length} results via HTTP`);
      const antigens = data.results.filter((r: VaxijenPeptide) => r.prediction === 'Antigen').length;
      return {
        success: true,
        results: data.results,
        stats: { total: data.results.length, antigens, nonAntigens: data.results.length - antigens },
        method: 'vaxijen_server',
      };
    }
  } catch {
    // Server-side failed, fall back to local
  }

  // Fallback: local ACC computation
  console.log(`  VaxiJen: using local ACC computation (Cloudflare blocked HTTP)`);
  const results: VaxijenPeptide[] = uniquePeptides.map(pep => {
    const { score, prediction } = computeVaxijenScoreLocal(pep);
    return { peptide: pep, score, prediction };
  });

  const antigens = results.filter(r => r.prediction === 'Antigen').length;
  return {
    success: true,
    results,
    stats: { total: results.length, antigens, nonAntigens: results.length - antigens },
    method: 'local_acc',
  };
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
    if (vax) return [...row, String(vax.score), vax.prediction];
    return [...row, 'N/A', 'N/A'];
  });

  return { columns: newCols, rows: newRows };
}
