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
  const percIdx = mutated.columns.indexOf('median_percentile');

  if (pepIdx === -1 || alleleIdx === -1 || percIdx === -1) {
    console.warn('  Missing required columns in mutated data');
    return { columns: mutated.columns, rows: [], stats: emptyStats() };
  }

  // Step 1: Build canonical lookup
  const canonLookup = new Map<string, number>();
  for (const row of canonical.rows) {
    const key = `${row[canonical.columns.indexOf('peptide')]}|${row[canonical.columns.indexOf('allele')]}`;
    canonLookup.set(key, parseFloat(row[canonical.columns.indexOf('median_percentile')]) || 999);
  }

  // Step 2: Keep only novel entries
  const novelRows = mutated.rows.filter((row) => {
    const key = `${row[pepIdx]}|${row[alleleIdx]}`;
    return !canonLookup.has(key);
  });

  // Step 3: Sort by percentile (lower = stronger binder)
  novelRows.sort((a, b) => {
    const pa = parseFloat(a[percIdx]) || 999;
    const pb = parseFloat(b[percIdx]) || 999;
    return pa - pb;
  });

  // Step 4: Deduplicate — keep best allele per peptide
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
