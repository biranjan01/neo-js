// Steps 5-7: Epitope Prediction via IEDB Next-Gen Tools API

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
  timeout = 600
): Promise<IEDBResult> {
  console.log(`  Submitting ${name}...`);

  try {
    // Submit
    const submitR = await fetch(`${IEDB_API_URL}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
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
    while (Date.now() - start < timeout * 1000) {
      await new Promise((r) => setTimeout(r, 5000));

      try {
        const pollR = await fetch(`${IEDB_API_URL}/results/${resultId}`, {
          signal: AbortSignal.timeout(30000),
        });

        if (!pollR.ok) continue;

        const pollData = await pollR.json();

        if (pollData.status === 'done') {
          const elapsed = Math.round((Date.now() - start) / 1000);
          console.log(`  Done (${elapsed}s)`);

          // Extract peptide table
          for (const t of pollData.data?.results || []) {
            if (t.type === 'peptide_table') {
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
    console.log(`\n=== MHC-I NetMHCpan 4.1 — ${label.toUpperCase()} ===`);

    const fasta = `>${geneName}_${label}\n${seq}`;
    const res = await iedbPost(
      {
        pipeline_title: `${geneName} MHC-I ${label}`,
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
      `MHC-I ${label}`
    );

    results[label] = res;
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
    console.log(`\n=== MHC-II NetMHCIIpan 4.1 — ${label.toUpperCase()} ===`);

    const fasta = `>${geneName}_${label}\n${seq}`;

    // Binding
    const bindRes = await iedbPost(
      {
        pipeline_title: `${geneName} MHC-II Binding ${label}`,
        run_stage_range: [1, 1],
        stages: [
          {
            stage_number: 1,
            tool_group: 'mhcii',
            input_sequence_text: fasta,
            input_parameters: {
              alleles: MHC_II_27,
              peptide_length_range: [15, 15],
              predictors: [{ type: 'binding', method: 'netmhciipan_el' }],
            },
          },
        ],
      },
      `MHC-II Binding ${label}`
    );

    // Processing
    const procRes = await iedbPost(
      {
        pipeline_title: `${geneName} MHC-II Processing ${label}`,
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
      `MHC-II MHCII-NP ${label}`
    );

    // Merge binding + processing
    if (bindRes.success && procRes.success) {
      const procMap = new Map<string, Record<string, string>>();
      for (const row of procRes.rows) {
        const key = `${row[procRes.columns.indexOf('peptide')]}_${row[procRes.columns.indexOf('allele')]}`;
        const dict: Record<string, string> = {};
        procRes.columns.forEach((c, i) => (dict[c] = row[i]));
        procMap.set(key, dict);
      }

      const mergedRows = bindRes.rows.map((row) => {
        const key = `${row[bindRes.columns.indexOf('peptide')]}_${row[bindRes.columns.indexOf('allele')]}`;
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
        columns: [...bindRes.columns, 'n_motif', 'c_motif', 'cleavage_probability_score', 'cleavage_probability_percentile_rank'],
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
    console.log(`\n=== B-cell BepiPred 3.0 — ${label.toUpperCase()} ===`);

    const fasta = `>${geneName}_${label}\n${seq}`;
    const res = await iedbPost(
      {
        pipeline_title: `${geneName} B-cell ${label}`,
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
      `B-cell ${label}`
    );

    if (res.success) {
      results[label] = res;
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
