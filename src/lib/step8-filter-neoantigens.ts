// Step 8: Neoantigen Filtering

import { IEDBResult } from './step5-7-epitopes';

export interface NeoantigenResult {
  success: boolean;
  mhcI: {
    columns: string[];
    rows: string[][];
    stats: FilterStats;
  };
  mhcII: {
    columns: string[];
    rows: string[][];
    stats: FilterStats;
  };
  error?: string;
}

export interface FilterStats {
  canonicalPairs: number;
  mutatedRows: number;
  novelPairs: number;
  canonicalPeptides: number;
  mutatedPeptides: number;
  sharedPeptides: number;
  neoantigensFinal: number;
}

/**
 * Step 8: Filter neoantigens from canonical vs mutated predictions
 *
 * Logic:
 * 1. Build canonical lookup: (peptide, allele) → percentile
 * 2. Keep only mutated entries where peptide+allele NOT in canonical
 * 3. Sort by percentile (lower = stronger binder)
 * 4. Keep best allele per unique peptide (deduplication)
 */
export function step8FilterNeoantigens(
  canonicalMHCI: IEDBResult,
  mutatedMHCI: IEDBResult,
  canonicalMHCII: IEDBResult,
  mutatedMHCII: IEDBResult
): NeoantigenResult {
  const result: NeoantigenResult = {
    success: false,
    mhcI: { columns: [], rows: [], stats: emptyStats() },
    mhcII: { columns: [], rows: [], stats: emptyStats() },
  };

  // Filter MHC-I
  if (canonicalMHCI.success && mutatedMHCI.success) {
    const mhcI = filterTable(canonicalMHCI, mutatedMHCI);
    result.mhcI = mhcI;
    console.log(`\nMHC-I Neoantigens: ${mhcI.stats.neoantigensFinal} (from ${mhcI.stats.mutatedRows} mutated)`);
  }

  // Filter MHC-II
  if (canonicalMHCII.success && mutatedMHCII.success) {
    const mhcII = filterTable(canonicalMHCII, mutatedMHCII);
    result.mhcII = mhcII;
    console.log(`MHC-II Neoantigens: ${mhcII.stats.neoantigensFinal} (from ${mhcII.stats.mutatedRows} mutated)`);
  }

  result.success = result.mhcI.rows.length > 0 || result.mhcII.rows.length > 0;
  return result;
}

function filterTable(
  canonical: IEDBResult,
  mutated: IEDBResult
): { columns: string[]; rows: string[][]; stats: FilterStats } {
  const pepIdx = mutated.columns.indexOf('peptide');
  const alleleIdx = mutated.columns.indexOf('allele');
  const ic50Idx = mutated.columns.indexOf('netmhcpan_ba_ic50');
  const percIdx = mutated.columns.indexOf('median_percentile');

  if (pepIdx === -1 || alleleIdx === -1) {
    console.warn('  Missing required columns in mutated data');
    return { columns: mutated.columns, rows: [], stats: emptyStats() };
  }

  // Step 1: Build canonical lookup
  const canonIc50Idx = canonical.columns.indexOf('netmhcpan_ba_ic50');
  const canonPercIdx = canonical.columns.indexOf('median_percentile');
  const canonLookup = new Map<string, number>();
  for (const row of canonical.rows) {
    const key = `${row[canonical.columns.indexOf('peptide')]}|${row[canonical.columns.indexOf('allele')]}`;
    const ic50 = canonIc50Idx >= 0 ? parseFloat(row[canonIc50Idx]) : NaN;
    const perc = canonPercIdx >= 0 ? parseFloat(row[canonPercIdx]) : 999;
    canonLookup.set(key, isNaN(ic50) ? perc : ic50);
  }

  // Step 2: Keep only novel entries
  const novelRows = mutated.rows.filter((row) => {
    const key = `${row[pepIdx]}|${row[alleleIdx]}`;
    return !canonLookup.has(key);
  });

  // Step 3: Sort by IC50 (lower = stronger binder), then percentile, then score
  const scoreIdx = mutated.columns.indexOf('score');
  novelRows.sort((a, b) => {
    const aIc50 = ic50Idx >= 0 ? parseFloat(a[ic50Idx]) || 999999 : 999999;
    const bIc50 = ic50Idx >= 0 ? parseFloat(b[ic50Idx]) || 999999 : 999999;
    if (aIc50 !== bIc50) return aIc50 - bIc50;
    const pa = percIdx >= 0 ? parseFloat(a[percIdx]) || 999 : 999;
    const pb = percIdx >= 0 ? parseFloat(b[percIdx]) || 999 : 999;
    if (pa !== pb) return pa - pb;
    const sa = scoreIdx >= 0 ? parseFloat(a[scoreIdx]) || 0 : 0;
    const sb = scoreIdx >= 0 ? parseFloat(b[scoreIdx]) || 0 : 0;
    return sb - sa;
  });

  // Step 4: Deduplicate — keep best IC50 per peptide
  const seen = new Set<string>();
  const deduped = novelRows.filter((row) => {
    const pep = row[pepIdx];
    if (seen.has(pep)) return false;
    seen.add(pep);
    return true;
  });

  // Stats
  const canonPeptides = new Set(canonical.rows.map((r) => r[canonical.columns.indexOf('peptide')]));
  const mutPeptides = new Set(mutated.rows.map((r) => r[pepIdx]));
  const shared = [...canonPeptides].filter((p) => mutPeptides.has(p));

  const stats: FilterStats = {
    canonicalPairs: canonLookup.size,
    mutatedRows: mutated.rows.length,
    novelPairs: novelRows.length,
    canonicalPeptides: canonPeptides.size,
    mutatedPeptides: mutPeptides.size,
    sharedPeptides: shared.length,
    neoantigensFinal: deduped.length,
  };

  return { columns: mutated.columns, rows: deduped, stats };
}

function emptyStats(): FilterStats {
  return {
    canonicalPairs: 0,
    mutatedRows: 0,
    novelPairs: 0,
    canonicalPeptides: 0,
    mutatedPeptides: 0,
    sharedPeptides: 0,
    neoantigensFinal: 0,
  };
}

/**
 * Convert filtered neoantigens to CSV
 */
export function neoantigensToCSV(columns: string[], rows: string[][]): string {
  if (columns.length === 0 || rows.length === 0) return '';
  const header = columns.join(',');
  const csvRows = rows.map((r) => r.join(','));
  return [header, ...csvRows].join('\n');
}

// ─── Final merge: all steps → 66-column reference CSV ──────────────────────

const FINAL_COLUMNS = [
  'Peptide', 'start', 'end', 'peptide length', 'allele', 'peptide index',
  'median binding percentile',
  'netmhcpan_el core', 'netmhcpan_el icore', 'netmhcpan_el score', 'netmhcpan_el percentile',
  'netmhcpan_ba core', 'netmhcpan_ba icore', 'netmhcpan_ba IC50', 'netmhcpan_ba percentile',
  'immunogenicity score', 'proteasome score', 'tap score', 'mhc score', 'processing score', 'processing total score',
  'VaxiJen Score', 'VaxiJen Prediction',
  'Immunogen', 'Non-Immunogen', 'Probability',
  'Most Similar Protein', 'Allergen', 'Non-Allergen',
  'Sequence',
  'ML Score', 'MERCI Score (+ve)', 'MERCI Score (-ve)', 'Hybrid Score', 'PPV',
  'Toxin', 'Non-Toxin',
  'Highlight',
  'Number of amino acids', 'Theoretical pI', 'Molecular weight',
  'Negatively charged residues', 'Positively charged residues',
  'Instability index', 'Stability class', 'Aliphatic index', 'GRAVY',
  'Extinction coefficient', 'Abs 0.1%', 'Estimated half-life', 'Formula', 'Total atoms',
  'Ala (A)', 'Arg (R)', 'Asn (N)', 'Asp (D)', 'Cys (C)',
  'Gln (Q)', 'Glu (E)', 'Gly (G)', 'His (H)', 'Ile (I)',
  'Leu (L)', 'Lys (K)', 'Met (M)', 'Phe (F)', 'Pro (P)',
  'Ser (S)', 'Thr (T)', 'Trp (W)', 'Tyr (Y)', 'Val (V)',
];

// IEDB API column → reference column mapping
const IEDB_COL_MAP: Record<string, string> = {
  'peptide': 'Peptide',
  'sequence_number': '_drop_',
  'length': 'peptide length',
  'peptide_index': 'peptide index',
  'median_percentile': 'median binding percentile',
  'netmhcpan_el_core': 'netmhcpan_el core',
  'netmhcpan_el_icore': 'netmhcpan_el icore',
  'netmhcpan_el_score': 'netmhcpan_el score',
  'netmhcpan_el_percentile': 'netmhcpan_el percentile',
  'netmhcpan_ba_core': 'netmhcpan_ba core',
  'netmhcpan_ba_icore': 'netmhcpan_ba icore',
  'netmhcpan_ba_ic50': 'netmhcpan_ba IC50',
  'netmhcpan_ba_percentile': 'netmhcpan_ba percentile',
  'score': 'immunogenicity score',
  'proteasome_score': 'proteasome score',
  'tap_score': 'tap score',
  'mhc_score': 'mhc score',
  'processing_score': 'processing score',
  'total_score': 'processing total score',
};

const AA_ORDER = ['Ala (A)', 'Arg (R)', 'Asn (N)', 'Asp (D)', 'Cys (C)',
  'Gln (Q)', 'Glu (E)', 'Gly (G)', 'His (H)', 'Ile (I)',
  'Leu (L)', 'Lys (K)', 'Met (M)', 'Phe (F)', 'Pro (P)',
  'Ser (S)', 'Thr (T)', 'Trp (W)', 'Tyr (Y)', 'Val (V)'];
const AA_LETTERS = ['A', 'R', 'N', 'D', 'C', 'Q', 'E', 'G', 'H', 'I', 'L', 'K', 'M', 'F', 'P', 'S', 'T', 'W', 'Y', 'V'];

export interface MergeInputs {
  iedbColumns: string[];
  iedbRows: string[][];
  vaxijenResults: { sequence: string; score: number | null; prediction: string | null }[];
  allertopResults: { sequence: string; prediction: string | null; similar_protein?: string | null }[];
  toxinpredResults: { sequence: string; prediction: string | null }[];
  protparamData?: { columns: string[]; rows: string[][] } | null;
  immunogenicityRows?: Record<string, any>[];
}

/**
 * Merge all step results into the final 66-column reference CSV.
 * Left-joins on peptide column.
 */
export function mergeAllToFinalCSV(inputs: MergeInputs): string {
  const { iedbColumns, iedbRows, vaxijenResults, allertopResults, toxinpredResults, protparamData, immunogenicityRows } = inputs;

  // Build lookup maps
  const vaxMap = new Map(vaxijenResults.map(r => [r.sequence, r]));
  const alMap = new Map(allertopResults.map(r => [r.sequence, r]));
  const txMap = new Map(toxinpredResults.map(r => [r.sequence, r]));
  const immMap = new Map<string, Record<string, any>>();
  if (immunogenicityRows) {
    for (const r of immunogenicityRows) {
      const pep = r.peptide || r.Peptide || '';
      if (pep) immMap.set(pep, r);
    }
  }

  // Build ProtParam lookup (rows keyed by peptide)
  const ppMap = new Map<string, Record<string, any>>();
  if (protparamData?.columns && protparamData?.rows) {
    const ppPepIdx = protparamData.columns.indexOf('peptide');
    for (const row of protparamData.rows) {
      const pep = ppPepIdx >= 0 ? row[ppPepIdx] : '';
      if (pep) {
        const dict: Record<string, any> = {};
        protparamData.columns.forEach((c, i) => dict[c] = row[i]);
        ppMap.set(pep, dict);
      }
    }
  }

  // Build IEDB column index map
  const iedbIdxMap: Record<string, number> = {};
  iedbColumns.forEach((c, i) => { iedbIdxMap[c] = i; });

  // Helper: get value from row by IEDB column name
  function getIedbVal(row: string[], iedbCol: string): string {
    const idx = iedbIdxMap[iedbCol];
    return idx !== undefined ? (row[idx] ?? '') : '';
  }

  // Helper: compute AA composition
  function computeAA(seq: string): Record<string, string> {
    const result: Record<string, string> = {};
    const len = seq.length || 1;
    for (let i = 0; i < AA_LETTERS.length; i++) {
      const count = (seq.toUpperCase().split(AA_LETTERS[i]).length - 1);
      result[AA_ORDER[i]] = String(Math.round((count / len) * 10000) / 100);
    }
    return result;
  }

  const csvRows: string[][] = [];

  for (const row of iedbRows) {
    const peptide = getIedbVal(row, 'peptide');

    const vax = vaxMap.get(peptide);
    const al = alMap.get(peptide);
    const tx = txMap.get(peptide);
    const imm = immMap.get(peptide);
    const pp = ppMap.get(peptide);

    // VaxiJen: Antigen / Non-Antigen
    const vaxPred = (vax?.prediction ?? '').toUpperCase();
    const isAntigen = vaxPred === 'ANTIGEN';
    const vaxScore = vax?.score != null ? String(vax.score) : '';

    // AllerTOP
    const alPred = al?.prediction ?? '';
    const isAllergen = /ALLERGEN/i.test(alPred) && !/NON/i.test(alPred);
    const isNonAllergen = /NON-ALLERGEN/i.test(alPred);

    // ToxinPred
    const txPred = tx?.prediction ?? '';
    const isToxin = /toxin/i.test(txPred) && !/non/i.test(txPred);
    const isNonToxin = /non-toxin/i.test(txPred);

    // Immunogenicity (from IEDB step 5)
    const immScore = imm?.immunogenicity_score ?? imm?.score ?? '';
    const immClass = imm?.immunogenicity_class ?? '';

    // ProtParam
    const numAA = pp?.['protparam_num_aa'] ?? pp?.['Number of amino acids'] ?? '';
    const pi = pp?.['protparam_pi'] ?? pp?.['Theoretical pI'] ?? '';
    const mw = pp?.['protparam_mw'] ?? pp?.['Molecular weight'] ?? '';
    const negCharged = pp?.['protparam_neg_charged'] ?? pp?.['Negatively charged residues'] ?? '';
    const posCharged = pp?.['protparam_pos_charged'] ?? pp?.['Positively charged residues'] ?? '';
    const instability = pp?.['protparam_instability'] ?? pp?.['Instability index'] ?? '';
    const stability = pp?.['protparam_stability'] ?? '';
    const aliphatic = pp?.['protparam_aliphatic'] ?? pp?.['Aliphatic index'] ?? '';
    const gravy = pp?.['protparam_gravy'] ?? pp?.['GRAVY'] ?? '';
    const extinction = pp?.['protparam_extinction'] ?? '';
    const abs01 = pp?.['protparam_abs01'] ?? '';
    const halflife = pp?.['protparam_halflife'] ?? '';
    const formula = pp?.['protparam_formula'] ?? '';
    const totalAtoms = pp?.['protparam_total_atoms'] ?? '';

    // AA composition
    const aaComp = computeAA(peptide);

    const csvRow = [
      // 1-21: IEDB columns (renamed to reference format)
      getIedbVal(row, 'peptide'),
      getIedbVal(row, 'start'),
      getIedbVal(row, 'end'),
      getIedbVal(row, 'length'),
      getIedbVal(row, 'allele'),
      getIedbVal(row, 'peptide_index'),
      getIedbVal(row, 'median_percentile'),
      getIedbVal(row, 'netmhcpan_el_core'),
      getIedbVal(row, 'netmhcpan_el_icore'),
      getIedbVal(row, 'netmhcpan_el_score'),
      getIedbVal(row, 'netmhcpan_el_percentile'),
      getIedbVal(row, 'netmhcpan_ba_core'),
      getIedbVal(row, 'netmhcpan_ba_icore'),
      getIedbVal(row, 'netmhcpan_ba_ic50'),
      getIedbVal(row, 'netmhcpan_ba_percentile'),
      getIedbVal(row, 'score'),
      getIedbVal(row, 'proteasome_score'),
      getIedbVal(row, 'tap_score'),
      getIedbVal(row, 'mhc_score'),
      getIedbVal(row, 'processing_score'),
      getIedbVal(row, 'total_score'),
      // 22-23: VaxiJen
      vaxScore,
      vax?.prediction ?? '',
      // 24-26: Immunogenicity
      immClass === 'High' || immClass === 'Medium' ? 'Probable IMMUNOGEN' : '',
      immClass === 'Low' ? 'Probable NON-IMMUNOGEN' : '',
      String(immScore ?? ''),
      // 27-29: AllerTOP
      al?.similar_protein ?? '',
      isAllergen ? 'Probable Allergen' : '',
      isNonAllergen ? 'Probable Non-Allergen' : '',
      // 30: Sequence (= peptide)
      peptide,
      // 31-35: ToxinPred scores (not returned by API, empty)
      '', '', '', '', '',
      // 36-37: ToxinPred prediction
      isToxin ? 'Probable Toxin' : '',
      isNonToxin ? 'Probable Non-Toxin' : '',
      // 38: Highlight
      '',
      // 39-46: ProtParam
      String(numAA),
      String(pi),
      String(mw),
      String(negCharged),
      String(posCharged),
      String(instability),
      String(stability),
      String(aliphatic),
      String(gravy),
      String(extinction),
      String(abs01),
      String(halflife),
      String(formula),
      String(totalAtoms),
      // 47-66: AA composition
      ...AA_ORDER.map(aa => aaComp[aa] ?? '0'),
    ];

    csvRows.push(csvRow);
  }

  const header = FINAL_COLUMNS.join(',');
  const csvLines = csvRows.map(r => r.join(','));
  return [header, ...csvLines].join('\n');
}
