// Steps 5-7: Epitope Prediction via IEDB Next-Gen Tools API

import { ipv4Fetch } from './ipv4-fetch';

const IEDB_API_URL = 'https://api-nextgen-tools.iedb.org/api/v1';

// 27 HLA-I alleles
export const MHC_I_27 = [
  'HLA-A*01:01', 'HLA-A*02:01', 'HLA-A*02:03', 'HLA-A*02:06',
  'HLA-A*03:01', 'HLA-A*11:01', 'HLA-A*23:01', 'HLA-A*24:02',
  'HLA-A*26:01', 'HLA-A*30:01', 'HLA-A*30:02', 'HLA-A*31:01',
  'HLA-A*32:01', 'HLA-A*33:01', 'HLA-A*68:01', 'HLA-A*68:02',
  'HLA-B*07:02', 'HLA-B*08:01', 'HLA-B*15:01',
  'HLA-B*35:01', 'HLA-B*40:01', 'HLA-B*44:02', 'HLA-B*44:03',
  'HLA-B*51:01', 'HLA-B*53:01', 'HLA-B*57:01', 'HLA-B*58:01',
].join(',');

// 27 HLA-II alleles
export const MHC_II_27 = [
  'HLA-DRB1*01:01', 'HLA-DRB1*03:01', 'HLA-DRB1*04:01', 'HLA-DRB1*04:05',
  'HLA-DRB1*07:01', 'HLA-DRB1*08:02', 'HLA-DRB1*09:01', 'HLA-DRB1*11:01',
  'HLA-DRB1*12:01', 'HLA-DRB1*13:02', 'HLA-DRB1*15:01',
  'HLA-DRB3*01:01', 'HLA-DRB3*02:02', 'HLA-DRB4*01:01', 'HLA-DRB5*01:01',
  'HLA-DQA1*05:01/DQB1*02:01', 'HLA-DQA1*05:01/DQB1*03:01',
  'HLA-DQA1*03:01/DQB1*03:02', 'HLA-DQA1*04:01/DQB1*04:02',
  'HLA-DQA1*01:01/DQB1*05:01', 'HLA-DQA1*01:02/DQB1*06:02',
  'HLA-DPA1*02:01/DPB1*01:01', 'HLA-DPA1*01:03/DPB1*02:01',
  'HLA-DPA1*01:03/DPB1*04:01', 'HLA-DPA1*03:01/DPB1*04:02',
  'HLA-DPA1*02:01/DPB1*05:01', 'HLA-DPA1*02:01/DPB1*14:01',
].join(',');

export interface IEDBResult {
  success: boolean;
  columns: string[];
  rows: string[][];
  error?: string;
}

/**
 * Submit job to IEDB API and poll until done
 */
export async function iedbPost(
  payload: Record<string, unknown>,
  name: string,
  timeout = 7200
): Promise<IEDBResult> {
  console.log(`  Submitting ${name}...`);

  try {
    // Submit
    const submitR = await ipv4Fetch(`${IEDB_API_URL}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(600000),
      timeout: 600000,
    });

    if (!submitR.ok) {
      return { success: false, columns: [], rows: [], error: `Submit failed: ${submitR.status}` };
    }

    const submitData = await submitR.json();
    if (submitData.errors?.length > 0) {
      return { success: false, columns: [], rows: [], error: submitData.errors[0] };
    }

    const resultId = submitData.result_id;
    console.log(`  Job submitted: ${resultId}, polling...`);

    // Poll
    const start = Date.now();
    let pollDelay = 10000;
    while (Date.now() - start < timeout * 1000) {
      await new Promise((r) => setTimeout(r, pollDelay));

      try {
        const pollR = await ipv4Fetch(`${IEDB_API_URL}/results/${resultId}`, {
          signal: AbortSignal.timeout(300000),
          timeout: 300000,
        });

        if (!pollR.ok) continue;

        const pollData = await pollR.json();

        if (pollData.status === 'done') {
          const elapsed = Math.round((Date.now() - start) / 1000);
          console.log(`  Done (${elapsed}s)`);

          // Extract peptide table
          for (const t of pollData.data?.results || []) {
            if (t.type === 'peptide_table') {
              pollDelay = 10000;
              return {
                success: true,
                columns: t.table_columns.map((c: { name: string }) => c.name),
                rows: t.table_data,
              };
            }
          }

          return { success: false, columns: [], rows: [], error: 'No peptide table in results' };
        }

        if (pollData.status === 'failed' || pollData.status === 'error') {
          const err = pollData.data?.errors?.[0] || 'Unknown error';
          return { success: false, columns: [], rows: [], error: err };
        }
      } catch (e) {
        console.warn(`  Poll error: ${(e as Error).message}`);
        pollDelay = Math.min(pollDelay * 1.5, 60000);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    return { success: false, columns: [], rows: [], error: `Timed out after ${timeout}s` };
  } catch (e) {
    return { success: false, columns: [], rows: [], error: (e as Error).message };
  }
}

/**
 * Step 5: MHC-I Epitope Prediction (NetMHCpan 4.1 EL+BA)
 */
export async function step5MHCI(
  geneName: string,
  canonical: string,
  mutated: string
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const results: { canonical: IEDBResult; mutated: IEDBResult } = {
    canonical: { success: false, columns: [], rows: [] },
    mutated: { success: false, columns: [], rows: [] },
  };

  for (const [label, seq] of [['canonical', canonical], ['mutated', mutated]] as const) {
    console.log(`\n=== MHC-I NetMHCpan 4.1 — ${label.toUpperCase()} === (${seq.length} aa)`);

    const chunks = chunkSequence(seq);
    const chunkResults: IEDBResult[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `${label} chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      console.log(`  Chunk ${ci+1}/${chunks.length}: ${chunk.length} aa`);

      const res = await iedbPost(
        {
          pipeline_title: `${geneName} MHC-I ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [
            {
              stage_number: 1,
              tool_group: 'mhci',
              input_sequence_text: fasta,
              input_parameters: {
                alleles: MHC_I_27,
                peptide_length_range: [9, 9],
                predictors: [
                  { type: 'binding', method: 'netmhcpan_el' },
                  { type: 'binding', method: 'netmhcpan_ba' },
                  {
                    type: 'processing',
                    method: 'basic_processing',
                    mhc_binding_method: 'netmhcpan_ba',
                    proteasome: 'immuno',
                    tap_precursor: 1,
                    tap_alpha: 0.2,
                  },
                  { type: 'immunogenicity', mask_choice: 'by_allele' },
                ],
              },
            },
          ],
        },
        `MHC-I ${chunkLabel}`
      );

      chunkResults.push(res);
    }

    results[label] = chunks.length > 1 ? mergeIEDBResults(chunkResults) : chunkResults[0];
  }

  return results;
}

/**
 * Step 6: MHC-II Epitope Prediction (NetMHCIIpan 4.1)
 */
export async function step6MHCII(
  geneName: string,
  canonical: string,
  mutated: string
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const results: { canonical: IEDBResult; mutated: IEDBResult } = {
    canonical: { success: false, columns: [], rows: [] },
    mutated: { success: false, columns: [], rows: [] },
  };

  for (const [label, seq] of [['canonical', canonical], ['mutated', mutated]] as const) {
    console.log(`\n=== MHC-II NetMHCIIpan 4.1 — ${label.toUpperCase()} === (${seq.length} aa)`);

    const chunks = chunkSequence(seq);
    const bindChunks: IEDBResult[] = [];
    const procChunks: IEDBResult[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `${label} chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      console.log(`  Chunk ${ci+1}/${chunks.length}: ${chunk.length} aa`);

      // Binding
      const bindRes = await iedbPost(
        {
          pipeline_title: `${geneName} MHC-II Binding ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [
            {
              stage_number: 1,
              tool_group: 'mhcii',
              input_sequence_text: fasta,
              input_parameters: {
                alleles: MHC_II_27,
                peptide_length_range: [15, 15],
                predictors: [{ type: 'binding', method: 'netmhciipan_el' }, { type: 'binding', method: 'netmhciipan_ba' }],
              },
            },
          ],
        },
        `MHC-II Binding ${chunkLabel}`
      );

      // Processing
      const procRes = await iedbPost(
        {
          pipeline_title: `${geneName} MHC-II Processing ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [
            {
              stage_number: 1,
              tool_group: 'mhcii',
              input_sequence_text: fasta,
              input_parameters: {
                alleles: MHC_II_27,
                peptide_length_range: [15, 15],
                predictors: [{ type: 'processing', method: 'mhciinp' }],
              },
            },
          ],
        },
        `MHC-II MHCII-NP ${chunkLabel}`
      );

      bindChunks.push(bindRes);
      procChunks.push(procRes);
    }

    const mergedBind = chunks.length > 1 ? mergeIEDBResults(bindChunks) : bindChunks[0];
    const mergedProc = chunks.length > 1 ? mergeIEDBResults(procChunks) : procChunks[0];

    // Merge binding + processing
    if (mergedBind.success && mergedProc.success) {
      const procMap = new Map<string, Record<string, string>>();
      for (const row of mergedProc.rows) {
        const key = `${row[mergedProc.columns.indexOf('peptide')]}_${row[mergedProc.columns.indexOf('allele')]}`;
        const dict: Record<string, string> = {};
        mergedProc.columns.forEach((c, i) => (dict[c] = row[i]));
        procMap.set(key, dict);
      }

      const mergedRows = mergedBind.rows.map((row) => {
        const key = `${row[mergedBind.columns.indexOf('peptide')]}_${row[mergedBind.columns.indexOf('allele')]}`;
        const proc = procMap.get(key) || {};
        return [
          ...row,
          proc.n_motif || '',
          proc.c_motif || '',
          proc.cleavage_probability_score || '',
          proc.cleavage_probability_percentile_rank || '',
        ];
      });

      results[label] = {
        success: true,
        columns: [...mergedBind.columns, 'n_motif', 'c_motif', 'cleavage_probability_score', 'cleavage_probability_percentile_rank'],
        rows: mergedRows,
      };
    }
  }

  return results;
}

/**
 * Step 7: B-cell Epitope Prediction (BepiPred 3.0)
 */
export async function step7BCell(
  geneName: string,
  canonical: string,
  mutated: string
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const results: { canonical: IEDBResult; mutated: IEDBResult } = {
    canonical: { success: false, columns: [], rows: [] },
    mutated: { success: false, columns: [], rows: [] },
  };

  for (const [label, seq] of [['canonical', canonical], ['mutated', mutated]] as const) {
    console.log(`\n=== B-cell BepiPred 3.0 — ${label.toUpperCase()} === (${seq.length} aa)`);

    const chunks = chunkSequence(seq);
    const chunkResults: IEDBResult[] = [];

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `${label} chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      console.log(`  Chunk ${ci+1}/${chunks.length}: ${chunk.length} aa`);

      const res = await iedbPost(
        {
          pipeline_title: `${geneName} B-cell ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [
            {
              stage_number: 1,
              tool_group: 'bcell_sequence',
              input_sequence_text: fasta,
              input_parameters: {
                predictors: [
                  {
                    type: 'epitope',
                    method: 'bepipred3',
                    window_size: 9,
                    scoring: 'majority_vote',
                    include_seq_len_esm: true,
                  },
                ],
              },
            },
          ],
        },
        `B-cell ${chunkLabel}`
      );

      if (res.success) {
        chunkResults.push(res);
      }
    }

    if (chunkResults.length > 0) {
      results[label] = chunks.length > 1 ? mergeIEDBResults(chunkResults) : chunkResults[0];
    }
  }

  return results;
}

/**
 * Convert IEDB result to CSV string
 */
export function iedbResultToCSV(result: IEDBResult): string {
  if (!result.success || result.columns.length === 0) return '';
  const header = result.columns.join(',');
  const rows = result.rows.map((r) => r.join(','));
  return [header, ...rows].join('\n');
}

/**
 * Split a protein sequence into overlapping chunks for IEDB processing.
 * Large sequences (>5000 aa) cause IEDB timeouts.
 * Overlap ensures peptides at chunk boundaries aren't missed.
 */
export function chunkSequence(seq: string, chunkSize = 2000, overlap = 20): string[] {
  if (seq.length <= chunkSize) return [seq];
  const chunks: string[] = [];
  for (let i = 0; i < seq.length; i += chunkSize - overlap) {
    chunks.push(seq.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Merge multiple IEDB results, deduplicating by peptide+allele key
 */
export function mergeIEDBResults(results: IEDBResult[]): IEDBResult {
  const successful = results.filter(r => r.success);
  if (successful.length === 0) return { success: false, columns: [], rows: [], error: 'All chunks failed' };

  const columns = successful[0].columns;
  const peptideIdx = columns.indexOf('peptide');
  const alleleIdx = columns.indexOf('allele');
  const seen = new Set<string>();
  const mergedRows: string[][] = [];

  for (const r of successful) {
    for (const row of r.rows) {
      const key = peptideIdx >= 0 && alleleIdx >= 0
        ? `${row[peptideIdx]}_${row[alleleIdx]}`
        : row.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        mergedRows.push(row);
      }
    }
  }

  return { success: true, columns, rows: mergedRows };
}
