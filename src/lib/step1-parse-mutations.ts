// Step 1: Parse COSMIC CSV and filter missense mutations

import Papa from 'papaparse';
import { ParsedMutation } from './types';

const VALID_AA = new Set('ACDEFGHIKLMNPQRSTVWY'.split(''));

/**
 * Parse AA mutation string like "p.R175H" → { ref: "R", pos: 175, alt: "H" }
 */
function parseAAMutation(val: string): { ref: string; pos: number; alt: string } | null {
  if (!val || typeof val !== 'string') return null;

  let cleaned = val.trim();
  if (cleaned.startsWith('p.')) {
    cleaned = cleaned.slice(2);
  }

  // Match: RefAAPositionAltAA (e.g., R175H, A159V, R248Q)
  const match = cleaned.match(/^([A-Z])([0-9]+)([A-Z*])$/);
  if (!match) return null;

  const [, ref, posStr, alt] = match;
  const pos = parseInt(posStr, 10);

  if (!VALID_AA.has(ref) || !VALID_AA.has(alt) || alt === ref) {
    return null;
  }

  return { ref, pos, alt };
}

/**
 * Find the AA mutation column in the CSV (fuzzy matching)
 */
function findAAMutationColumn(columns: string[]): string | null {
  // Priority 1: exact-ish matches
  const priorityPatterns = [
    'aa_mutation',
    'aa mutation',
    'mutation_aa',
    'protein_change',
    'hgvsp',
    'aa_mut',
  ];

  for (const col of columns) {
    const cl = col.toLowerCase().trim().replace(/\s+/g, '_');
    for (const pattern of priorityPatterns) {
      if (cl.includes(pattern)) return col;
    }
  }

  // Priority 2: any column with 'aa' and 'mut'
  for (const col of columns) {
    const cl = col.toLowerCase().trim();
    if (cl.includes('aa') && cl.includes('mut')) return col;
  }

  return null;
}

/**
 * Find the sample/patient column
 */
function findSampleColumn(columns: string[]): string | null {
  for (const col of columns) {
    const cl = col.toLowerCase().trim();
    if (cl.includes('sample') || cl.includes('patient')) return col;
  }
  return null;
}

export interface Step1Result {
  success: boolean;
  missense: ParsedMutation[];
  totalRows: number;
  totalMissense: number;
  error?: string;
}

/**
 * Step 1: Parse COSMIC CSV and extract missense mutations
 * Input: Raw CSV text
 * Output: Filtered missense mutations
 */
export function step1ParseMutations(
  csvText: string,
  geneName: string
): Step1Result {
  // Parse CSV using papaparse
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    console.warn('CSV parsing warnings:', parsed.errors.slice(0, 5));
  }

  const rows = parsed.data as Record<string, string>[];
  const columns: string[] = parsed.meta.fields || [];

  if (rows.length === 0) {
    return { success: false, missense: [], totalRows: 0, totalMissense: 0, error: 'CSV is empty' };
  }

  console.log(`Loaded ${rows.length} rows, columns: ${columns.join(', ')}`);

  // Find required columns
  const aaCol = findAAMutationColumn(columns);
  if (!aaCol) {
    return {
      success: false,
      missense: [],
      totalRows: rows.length,
      totalMissense: 0,
      error: `Cannot find AA mutation column. Available columns: ${columns.join(', ')}`,
    };
  }

  const sampleCol = findSampleColumn(columns);
  console.log(`AA Mutation column: ${aaCol}`);
  if (sampleCol) console.log(`Sample column: ${sampleCol}`);

  // Parse and filter
  const missense: ParsedMutation[] = [];
  let parseErrors = 0;

  for (const row of rows) {
    const aaMut = row[aaCol];
    if (!aaMut) continue;

    const parsed = parseAAMutation(aaMut);
    if (!parsed) {
      parseErrors++;
      continue;
    }

    missense.push({
      Position: parsed.pos,
      Ref_AA: parsed.ref,
      Alt_AA: parsed.alt,
      Canonical_Mutation: `${parsed.ref}${parsed.pos}${parsed.alt}`,
      AA_Mutation: aaMut,
      ...(sampleCol && row[sampleCol] ? { Sample: row[sampleCol] } : {}),
    });
  }

  console.log(`Valid missense mutations: ${missense.length} / ${rows.length}`);
  if (parseErrors > 0) {
    console.log(`Parse errors (non-missense): ${parseErrors}`);
  }

  return {
    success: missense.length > 0,
    missense,
    totalRows: rows.length,
    totalMissense: missense.length,
    ...(missense.length === 0 ? { error: 'No valid missense mutations found' } : {}),
  };
}
