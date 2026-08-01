// Step 12: ProtParam Physicochemical Properties
// Uses ExPASy ProtParam API for citable predictions

export interface ProtparamResult {
  success: boolean;
  results: ProtparamPeptide[];
  stats: {
    total: number;
    stable: number;
    unstable: number;
    methods: { api: number; failed: number };
  };
  error?: string;
}

export interface ProtparamPeptide {
  peptide: string;
  numAminoAcids: number;
  theoreticalPI: number;
  molecularWeight: number;
  negChargedResidues: number;
  posChargedResidues: number;
  instabilityIndex: number;
  stabilityClass: string; // 'Stable' | 'Unstable'
  aliphaticIndex: number;
  gravy: number;
  aaCounts: Record<string, number>;
  extinctionCoefficient?: number;
  abs01?: number;
  estimatedHalfLife?: string;
  formula?: string;
  totalAtoms?: number;
}

const PROTPARAM_URL = 'https://web.expasy.org/cgi-bin/protparam/protparam';

/**
 * Parse ProtParam HTML response into structured data
 */
function parseProtparamHTML(html: string): Partial<ProtparamPeptide> | null {
  const result: Partial<ProtparamPeptide> = {};

  // Strip HTML tags for cleaner regex matching
  const clean = html.replace(/<[^>]+>/g, ' ');

  // Number of amino acids
  const numAAMatch = clean.match(/Number of amino acids:\s*(\d+)/);
  result.numAminoAcids = numAAMatch ? parseInt(numAAMatch[1]) : 0;

  // Theoretical pI
  const piMatch = clean.match(/Theoretical pI:\s*([\d.]+)/);
  result.theoreticalPI = piMatch ? parseFloat(piMatch[1]) : 0;

  // Molecular weight
  const mwMatch = clean.match(/Molecular weight:\s*([\d.]+)/);
  result.molecularWeight = mwMatch ? parseFloat(mwMatch[1]) : 0;

  // Negatively charged residues
  const negMatch = clean.match(/negatively charged residues.*?:\s*(\d+)/i);
  result.negChargedResidues = negMatch ? parseInt(negMatch[1]) : 0;

  // Positively charged residues
  const posMatch = clean.match(/positively charged residues.*?:\s*(\d+)/i);
  result.posChargedResidues = posMatch ? parseInt(posMatch[1]) : 0;

  // Instability index
  const instabMatch = clean.match(/instability index.*?is computed to be\s*([\d.e\-]+)/i);
  result.instabilityIndex = instabMatch ? parseFloat(instabMatch[1]) : 0;

  // Stability classification
  if (clean.includes('classifies the protein as stable')) {
    result.stabilityClass = 'Stable';
  } else if (clean.includes('classifies the protein as unstable')) {
    result.stabilityClass = 'Unstable';
  } else {
    result.stabilityClass = 'Unknown';
  }

  // Aliphatic index
  const aliphMatch = clean.match(/Aliphatic index:\s*([\d.]+)/);
  result.aliphaticIndex = aliphMatch ? parseFloat(aliphMatch[1]) : 0;

  // GRAVY
  const gravyMatch = clean.match(/Grand average of hydropathicity \(GRAVY\):\s*([-\d.]+)/);
  result.gravy = gravyMatch ? parseFloat(gravyMatch[1]) : 0;

  // AA composition
  const aaCounts: Record<string, number> = {};
  const aaPattern = /(Ala|Arg|Asn|Asp|Cys|Gln|Glu|Gly|His|Ile|Leu|Lys|Met|Phe|Pro|Ser|Thr|Trp|Tyr|Val)\s*\(([A-Z])\)\s+(\d+)\s+[\d.]+%/g;
  const threeToOne: Record<string, string> = {
    Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C',
    Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
    Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P',
    Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V',
  };

  let m;
  while ((m = aaPattern.exec(clean)) !== null) {
    const code = threeToOne[m[1]] || m[2];
    aaCounts[code] = parseInt(m[3]);
  }
  result.aaCounts = aaCounts;

  // Extinction coefficient
  const extMatch = clean.match(/Ext\.\s*coefficient\s+([\d]+)/);
  result.extinctionCoefficient = extMatch ? parseInt(extMatch[1]) : undefined;

  // Abs 0.1%
  const absMatch = clean.match(/Abs\s+0\.1%.*?\s+([\d.]+)/);
  result.abs01 = absMatch ? parseFloat(absMatch[1]) : undefined;

  // Estimated half-life (mammalian reticulocytes)
  const halfLifeMatch = clean.match(/The estimated half-life is:\s*([\d.]+\s*hours[^.]*)/i);
  result.estimatedHalfLife = halfLifeMatch ? halfLifeMatch[1].trim() : undefined;

  // Formula — spaces between elements: "C 45 H 70 N 8 O 11"
  const formulaMatch = clean.match(/Formula:\s*([A-Z]\s*\d+(?:\s+[A-Z]\s*\d+)*)/);
  result.formula = formulaMatch ? formulaMatch[1].replace(/\s+/g, '').trim() : undefined;

  // Total atoms
  const atomsMatch = clean.match(/Total number of atoms:\s*(\d+)/);
  result.totalAtoms = atomsMatch ? parseInt(atomsMatch[1]) : undefined;

  if (result.numAminoAcids && result.numAminoAcids > 0) {
    return result;
  }
  return null;
}

/**
 * Submit a single peptide to ExPASy ProtParam
 */
async function submitPeptide(peptide: string): Promise<ProtparamPeptide | null> {
  try {
    const formData = new URLSearchParams();
    formData.append('sequence', peptide);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(PROTPARAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const parsed = parseProtparamHTML(html);

    if (parsed && parsed.numAminoAcids && parsed.numAminoAcids > 0) {
      return {
        peptide,
        numAminoAcids: parsed.numAminoAcids || 0,
        theoreticalPI: parsed.theoreticalPI || 0,
        molecularWeight: parsed.molecularWeight || 0,
        negChargedResidues: parsed.negChargedResidues || 0,
        posChargedResidues: parsed.posChargedResidues || 0,
        instabilityIndex: parsed.instabilityIndex || 0,
        stabilityClass: parsed.stabilityClass || 'Unknown',
        aliphaticIndex: parsed.aliphaticIndex || 0,
        gravy: parsed.gravy || 0,
        aaCounts: parsed.aaCounts || {},
        extinctionCoefficient: parsed.extinctionCoefficient,
        abs01: parsed.abs01,
        estimatedHalfLife: parsed.estimatedHalfLife,
        formula: parsed.formula,
        totalAtoms: parsed.totalAtoms,
      };
    }
  } catch {
    // API failed
  }

  return null;
}

/**
 * Run ProtParam on a list of neoantigen peptides
 * Processes one at a time (API is single-sequence)
 */
export async function runProtparam(
  peptides: string[]
): Promise<ProtparamResult> {
  const allResults: ProtparamPeptide[] = [];
  let apiCount = 0;
  let failedCount = 0;

  const uniquePeptides = [...new Set(peptides)];

  for (let i = 0; i < uniquePeptides.length; i++) {
    const pep = uniquePeptides[i];
    const result = await submitPeptide(pep);

    if (result) {
      allResults.push(result);
      apiCount++;
    } else {
      failedCount++;
    }

    // Small delay to avoid rate limiting
    if (i < uniquePeptides.length - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const stable = allResults.filter(r => r.stabilityClass === 'Stable').length;
  const unstable = allResults.filter(r => r.stabilityClass === 'Unstable').length;

  return {
    success: allResults.length > 0,
    results: allResults,
    stats: {
      total: allResults.length,
      stable,
      unstable,
      methods: { api: apiCount, failed: failedCount },
    },
  };
}

/**
 * Merge ProtParam results into neoantigen rows
 */
export function mergeProtparamIntoRows(
  columns: string[],
  rows: string[][],
  protparamResults: ProtparamPeptide[]
): { columns: string[]; rows: string[][] } {
  const pepIdx = columns.indexOf('peptide');
  if (pepIdx === -1) return { columns, rows };

  const lookup = new Map<string, ProtparamPeptide>();
  for (const r of protparamResults) {
    lookup.set(r.peptide, r);
  }

  const newCols = [
    ...columns,
    'protparam_num_aa',
    'protparam_pi',
    'protparam_mw',
    'protparam_instability',
    'protparam_stability',
    'protparam_aliphatic',
    'protparam_gravy',
  ];

  const newRows = rows.map(row => {
    const pep = row[pepIdx];
    const pp = lookup.get(pep);
    if (pp) {
      return [
        ...row,
        String(pp.numAminoAcids),
        String(pp.theoreticalPI),
        String(pp.molecularWeight),
        String(pp.instabilityIndex),
        pp.stabilityClass,
        String(pp.aliphaticIndex),
        String(pp.gravy),
      ];
    }
    return [...row, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
  });

  return { columns: newCols, rows: newRows };
}
