// Steps 5-7: Epitope Prediction via IEDB APIs (Hybrid: Old Tools API + Next-Gen API)

import { ipv4Fetch } from './ipv4-fetch';

const IEDB_API_URL = 'https://api-nextgen-tools.iedb.org/api/v1';
const IEDB_OLD_API_URL = 'https://tools-cluster-interface.iedb.org/tools_api';

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
 * Submit job to IEDB API and poll until done. Retries up to 2 times on failure.
 */
export async function iedbPost(
  payload: Record<string, unknown>,
  name: string,
  timeout = 7200,
  maxRetries = 2
): Promise<IEDBResult> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (attempt > 1) {
      console.log(`  ⚠ ${name} failed, retry ${attempt - 1}/${maxRetries} after 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }

    const result = await iedbPostOnce(payload, name, timeout);
    if (result.success) return result;

    console.log(`  ✗ ${name} attempt ${attempt} failed: ${result.error}`);
    if (attempt > maxRetries) return result;
  }
  return { success: false, columns: [], rows: [], error: 'Exceeded max retries' };
}

async function iedbPostOnce(
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

          // Extract peptide table (MHC-I/II) or linear_epitope_table (B-cell)
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

          // B-cell: extract epitope peptides from residue_table
          // BepiPred returns per-residue scores with 'E' (epitope) or 'n' (non-epitope)
          for (const t of pollData.data?.results || []) {
            if (t.type === 'residue_table') {
              pollDelay = 10000;
              const cols = t.table_columns.map((c: { name: string }) => c.name);
              const assignIdx = cols.findIndex((c: string) => c.includes('assignment'));
              const residueIdx = cols.indexOf('residue');
              const scoreIdx = cols.findIndex((c: string) => c.includes('bepipred_score') || c.includes('score'));
              const posIdx = cols.indexOf('position');

              if (assignIdx >= 0 && residueIdx >= 0) {
                // Extract contiguous epitope regions (contiguous 'E' assignments)
                const rows: string[][] = t.table_data;
                const epitopes: string[][] = [];
                let currentPep = '';
                let startPos = '';
                let scores: number[] = [];

                for (const row of rows) {
                  const assignment = row[assignIdx];
                  const residue = row[residueIdx];
                  const pos = posIdx >= 0 ? row[posIdx] : '';
                  const sc = scoreIdx >= 0 ? parseFloat(row[scoreIdx]) : 0;

                  if (assignment === 'E') {
                    if (currentPep === '') startPos = pos;
                    currentPep += residue;
                    scores.push(sc);
                  } else {
                    if (currentPep.length >= 8) {
                      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                      // columns: peptide, start, end, length, score, allele (empty for B-cell)
                      epitopes.push([currentPep, String(startPos), String(pos), String(currentPep.length), String(avgScore.toFixed(4)), '']);
                    }
                    currentPep = '';
                    scores = [];
                  }
                }
                // Flush last epitope
                if (currentPep.length >= 8) {
                  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                  epitopes.push([currentPep, String(startPos), String(rows[rows.length - 1]?.[posIdx] || ''), String(currentPep.length), String(avgScore.toFixed(4)), '']);
                }

                const columns = ['peptide', 'start', 'end', 'length', 'bepipred_score', 'allele'];
                console.log(`  B-cell: ${epitopes.length} epitope regions extracted from ${rows.length} residues`);
                return { success: true, columns, rows: epitopes };
              }

              // Fallback: return raw residue table
              console.log(`  B-cell residue_table: ${t.table_data.length} residues`);
              return { success: true, columns: cols, rows: t.table_data };
            }
          }

          // Also try linear_epitope_table as fallback
          for (const t of pollData.data?.results || []) {
            if (t.type === 'linear_epitope_table') {
              pollDelay = 10000;
              const cols = t.table_columns.map((c: { name: string }) => c.name);
              const pepIdx = cols.indexOf('peptide');
              if (pepIdx >= 0) {
                const columns = ['peptide', 'start', 'end', 'length', 'bepipred_score', 'allele'];
                const rows = t.table_data.map((r: string[]) => {
                  const pep = r[pepIdx] || '';
                  const startIdx = cols.indexOf('start');
                  const endIdx = cols.indexOf('end');
                  const lenIdx = cols.indexOf('length');
                  const scoreIdx = cols.findIndex((c: string) => c.includes('score'));
                  return [pep, r[startIdx] ?? '', r[endIdx] ?? '', r[lenIdx] ?? String(pep.length), r[scoreIdx] ?? '', ''];
                });
                console.log(`  B-cell linear_epitope_table: ${rows.length} epitopes`);
                return { success: true, columns, rows };
              }
            }
          }

          return { success: false, columns: [], rows: [], error: 'No usable table in results' };
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
 * Old IEDB Tools API - MHC-II binding (synchronous, fast)
 * Returns: allele, seq_num, start, end, length, core_peptide, peptide, score, rank
 * Maps columns to match New API format for downstream compatibility
 */
export async function oldIEDBMHCII(
  geneName: string,
  canonical: string,
  mutated: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const mhciiSingle = async (label: string, seq: string): Promise<IEDBResult> => {
    const fasta = `>${geneName}_${label}\n${seq}`;
    const body = new URLSearchParams();
    body.append('method', 'netmhciipan_el');
    body.append('sequence_text', fasta);
    body.append('allele', MHC_II_27);
    body.append('length', '15');

    console.log(`  Submitting Old IEDB MHC-II ${label}...`);
    const res = await ipv4Fetch(`${IEDB_OLD_API_URL}/mhcii/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(300000),
      timeout: 300000,
    });

    if (!res.ok) {
      return { success: false, columns: [], rows: [], error: `Old IEDB MHC-II failed: ${res.status}` };
    }

    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (lines.length < 2) {
      return { success: false, columns: [], rows: [], error: 'No data returned' };
    }

    const oldColumns = lines[0].split('\t');
    const oldRows = lines.slice(1).map(l => l.split('\t'));

    // Map Old API columns to New API format for downstream compatibility
    const columns = [
      'seq #', 'peptide', 'start', 'end', 'peptide length', 'allele',
      'median_percentile', 'netmhciipan_el_score', 'netmhciipan_el_percentile'
    ];

    const alleleIdx = oldColumns.indexOf('allele');
    const seqNumIdx = oldColumns.indexOf('seq_num');
    const startIdx = oldColumns.indexOf('start');
    const endIdx = oldColumns.indexOf('end');
    const lengthIdx = oldColumns.indexOf('length');
    const peptideIdx = oldColumns.indexOf('peptide');
    const scoreIdx = oldColumns.indexOf('score');
    const rankIdx = oldColumns.indexOf('rank');

    const rows = oldRows.map(row => [
      row[seqNumIdx] || '1',
      row[peptideIdx] || '',
      row[startIdx] || '',
      row[endIdx] || '',
      row[lengthIdx] || '',
      row[alleleIdx] || '',
      row[rankIdx] || '',
      row[scoreIdx] || '',
      row[rankIdx] || '',
    ]);

    console.log(`  Old IEDB MHC-II ${label}: ${rows.length} rows`);
    return { success: true, columns, rows };
  };

  onProgress?.(0, 2, 'Firing Old IEDB MHC-II calls (canonical + mutated)...');
  const stagger = (ms: number) => new Promise(r => setTimeout(r, ms));
  const [canonResult, mutResult] = await Promise.all([
    stagger(0).then(() => mhciiSingle('canonical', canonical)).then(r => { onProgress?.(1, 2, 'MHC-II canonical done'); return r; }),
    stagger(1000).then(() => mhciiSingle('mutated', mutated)).then(r => { onProgress?.(2, 2, 'MHC-II mutated done'); return r; }),
  ]);

  return { canonical: canonResult, mutated: mutResult };
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
 * Step 4: MHC-I Epitope Prediction (NetMHCpan 4.1) — standalone
 */
export async function step4MHCI(
  geneName: string,
  canonical: string,
  mutated: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const mhciSingle = async (label: string, seq: string): Promise<IEDBResult> => {
    const chunks = chunkSequence(seq);
    const chunkResults: IEDBResult[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      chunkResults.push(await iedbPost(
        {
          pipeline_title: `${geneName} MHC-I ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [{
            stage_number: 1,
            tool_group: 'mhci',
            input_sequence_text: fasta,
            input_parameters: {
              alleles: MHC_I_27,
              peptide_length_range: [9, 9],
              predictors: [
                { type: 'binding', method: 'netmhcpan_ba' },
                { type: 'processing', method: 'basic_processing', mhc_binding_method: 'netmhcpan_ba', proteasome: 'immuno', tap_precursor: 1, tap_alpha: 0.2 },
                { type: 'immunogenicity', mask_choice: 'by_allele' },
              ],
            },
          }],
        },
        `MHC-I ${chunkLabel}`
      ));
    }
    return chunks.length > 1 ? mergeIEDBResults(chunkResults) : chunkResults[0];
  };

  onProgress?.(0, 2, 'Firing MHC-I calls (canonical + mutated)...');
  const stagger = (ms: number) => new Promise(r => setTimeout(r, ms));
  const [canonResult, mutResult] = await Promise.all([
    stagger(0).then(() => mhciSingle('canonical', canonical)).then(r => { onProgress?.(1, 2, 'MHC-I canonical done'); return r; }),
    stagger(1000).then(() => mhciSingle('mutated', mutated)).then(r => { onProgress?.(2, 2, 'MHC-I mutated done'); return r; }),
  ]);

  return { canonical: canonResult, mutated: mutResult };
}

/**
 * Step 5: MHC-II Epitope Prediction (NetMHCIIpan 4.1) — standalone
 */
export async function step5MHCII(
  geneName: string,
  canonical: string,
  mutated: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const results: { canonical: IEDBResult; mutated: IEDBResult } = {
    canonical: { success: false, columns: [], rows: [] },
    mutated: { success: false, columns: [], rows: [] },
  };

  // Build all jobs: canonical bind, canonical proc, mutated bind, mutated proc
  const jobs: { label: 'canonical' | 'mutated'; type: 'bind' | 'proc'; promise: Promise<IEDBResult> }[] = [];
  for (const [label, seq] of [['canonical', canonical], ['mutated', mutated]] as const) {
    const chunks = chunkSequence(seq);
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `${label} chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      jobs.push({
        label, type: 'bind',
        promise: iedbPost({ pipeline_title: `${geneName} MHC-II Binding ${chunkLabel}`, run_stage_range: [1, 1], stages: [{ stage_number: 1, tool_group: 'mhcii', input_sequence_text: fasta, input_parameters: { alleles: MHC_II_27, peptide_length_range: [15, 15], predictors: [{ type: 'binding', method: 'netmhciipan_el' }, { type: 'binding', method: 'netmhciipan_ba' }] } }] }, `MHC-II Binding ${chunkLabel}`),
      });
      jobs.push({
        label, type: 'proc',
        promise: iedbPost({ pipeline_title: `${geneName} MHC-II Processing ${chunkLabel}`, run_stage_range: [1, 1], stages: [{ stage_number: 1, tool_group: 'mhcii', input_sequence_text: fasta, input_parameters: { alleles: MHC_II_27, peptide_length_range: [15, 15], predictors: [{ type: 'processing', method: 'mhciinp' }] } }] }, `MHC-II Processing ${chunkLabel}`),
      });
    }
  }

  const totalCalls = jobs.length;
  onProgress?.(0, totalCalls, `Firing ${totalCalls} MHC-II calls (binding + processing)...`);
  const stagger = (ms: number) => new Promise(r => setTimeout(r, ms));
  const allPromises = jobs.map((j, idx) =>
    stagger(idx * 1000).then(() => j.promise).then(r => {
      onProgress?.(idx + 1, totalCalls, `MHC-II ${j.type === 'bind' ? 'binding' : 'processing'} ${j.label} ${idx+1}/${totalCalls}`);
      return { label: j.label, jobType: j.type, result: r };
    })
  );

  const settled = await Promise.all(allPromises);

  const bindResults: Record<string, IEDBResult[]> = { canonical: [], mutated: [] };
  const procResults: Record<string, IEDBResult[]> = { canonical: [], mutated: [] };
  for (const r of settled) {
    if (r.jobType === 'bind') bindResults[r.label].push(r.result);
    else procResults[r.label].push(r.result);
  }

  for (const label of ['canonical', 'mutated'] as const) {
    const binds = bindResults[label];
    const procs = procResults[label];
    if (binds.length === 0) continue;
    const mergedBind = binds.length > 1 ? mergeIEDBResults(binds) : binds[0];
    const mergedProc = procs.length > 0 ? (procs.length > 1 ? mergeIEDBResults(procs) : procs[0]) : null;

    if (mergedBind.success && mergedProc?.success) {
      const procMap = new Map<string, Record<string, string>>();
      for (const row of mergedProc.rows) {
        const key = `${row[mergedProc.columns.indexOf('peptide')]}_${row[mergedProc.columns.indexOf('allele')]}`;
        const dict: Record<string, string> = {};
        mergedProc.columns.forEach((c, i) => (dict[c] = row[i]));
        procMap.set(key, dict);
      }
      results[label] = {
        success: true,
        columns: [...mergedBind.columns, 'n_motif', 'c_motif', 'cleavage_probability_score', 'cleavage_probability_percentile_rank'],
        rows: mergedBind.rows.map((row) => {
          const key = `${row[mergedBind.columns.indexOf('peptide')]}_${row[mergedBind.columns.indexOf('allele')]}`;
          const proc = procMap.get(key) || {};
          return [...row, proc.n_motif || '', proc.c_motif || '', proc.cleavage_probability_score || '', proc.cleavage_probability_percentile_rank || ''];
        }),
      };
    } else {
      results[label] = mergedBind;
    }
  }

  return results;
}

/**
 * Step 6: B-cell Epitope Prediction (BepiPred 3.0) — standalone
 */
export async function step6BCell(
  geneName: string,
  canonical: string,
  mutated: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const bcellSingle = async (label: string, seq: string): Promise<IEDBResult> => {
    const chunks = chunkSequence(seq);
    const chunkResults: IEDBResult[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      const res = await iedbPost(
        {
          pipeline_title: `${geneName} B-cell ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [{
            stage_number: 1,
            tool_group: 'bcell_sequence',
            input_sequence_text: fasta,
            input_parameters: {
              predictors: [{ type: 'epitope', method: 'bepipred3', window_size: 9, scoring: 'majority_vote', include_seq_len_esm: true }],
            },
          }],
        },
        `B-cell ${chunkLabel}`
      );
      if (res.success) chunkResults.push(res);
    }
    return chunks.length > 1 && chunkResults.length > 0 ? mergeIEDBResults(chunkResults) : chunkResults[0] || { success: false, columns: [], rows: [] };
  };

  onProgress?.(0, 2, 'Firing B-cell calls (canonical + mutated)...');
  const stagger = (ms: number) => new Promise(r => setTimeout(r, ms));
  const [canonResult, mutResult] = await Promise.all([
    stagger(0).then(() => bcellSingle('canonical', canonical)).then(r => { onProgress?.(1, 2, 'B-cell canonical done'); return r; }),
    stagger(1000).then(() => bcellSingle('mutated', mutated)).then(r => { onProgress?.(2, 2, 'B-cell mutated done'); return r; }),
  ]);

  return { canonical: canonResult, mutated: mutResult };
}

/**
 * Combined: MHC-I + MHC-II via fully concurrent IEDB calls.
 * IEDB's combined multi-stage pipeline has a "list index out of range" bug,
 * so we make independent calls for MHC-I and MHC-II.
 * All IEDB submissions are fired concurrently for maximum speed.
 */
export async function step4_5MHCIAndII(
  geneName: string,
  canonical: string,
  mutated: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{
  mhci: { canonical: IEDBResult; mutated: IEDBResult };
  mhcii: { canonical: IEDBResult; mutated: IEDBResult };
}> {
  // ─── MHC-I: fire canonical + mutated concurrently ───
  const mhciSingle = async (label: string, seq: string): Promise<IEDBResult> => {
    const chunks = chunkSequence(seq);
    const chunkResults: IEDBResult[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      chunkResults.push(await iedbPost(
        {
          pipeline_title: `${geneName} MHC-I ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [{
            stage_number: 1,
            tool_group: 'mhci',
            input_sequence_text: fasta,
            input_parameters: {
              alleles: MHC_I_27,
              peptide_length_range: [9, 9],
              predictors: [
                { type: 'binding', method: 'netmhcpan_el' },
                { type: 'binding', method: 'netmhcpan_ba' },
                { type: 'processing', method: 'basic_processing', mhc_binding_method: 'netmhcpan_ba', proteasome: 'immuno', tap_precursor: 1, tap_alpha: 0.2 },
                { type: 'immunogenicity', mask_choice: 'by_allele' },
              ],
            },
          }],
        },
        `MHC-I ${chunkLabel}`
      ));
    }
    return chunks.length > 1 ? mergeIEDBResults(chunkResults) : chunkResults[0];
  };

  const mhciCanonP = mhciSingle('canonical', canonical);
  const mhciMutP = mhciSingle('mutated', mutated);

  // ─── MHC-II: fire canonical binding + processing + mutated binding + processing concurrently ───
  const mhciiJobs: { label: 'canonical' | 'mutated'; type: 'bind' | 'proc'; promise: Promise<IEDBResult> }[] = [];
  for (const [label, seq] of [['canonical', canonical], ['mutated', mutated]] as const) {
    const chunks = chunkSequence(seq);
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `${label} chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;

      // Binding
      mhciiJobs.push({
        label, type: 'bind',
        promise: iedbPost(
          { pipeline_title: `${geneName} MHC-II Binding ${chunkLabel}`, run_stage_range: [1, 1], stages: [{ stage_number: 1, tool_group: 'mhcii', input_sequence_text: fasta, input_parameters: { alleles: MHC_II_27, peptide_length_range: [15, 15], predictors: [{ type: 'binding', method: 'netmhciipan_el' }, { type: 'binding', method: 'netmhciipan_ba' }] } }] },
          `MHC-II Binding ${chunkLabel}`
        ),
      });

      // Processing (independent — doesn't need binding results)
      mhciiJobs.push({
        label, type: 'proc',
        promise: iedbPost(
          { pipeline_title: `${geneName} MHC-II Processing ${chunkLabel}`, run_stage_range: [1, 1], stages: [{ stage_number: 1, tool_group: 'mhcii', input_sequence_text: fasta, input_parameters: { alleles: MHC_II_27, peptide_length_range: [15, 15], predictors: [{ type: 'processing', method: 'mhciinp' }] } }] },
          `MHC-II Processing ${chunkLabel}`
        ),
      });
    }
  }

  // Fire IEDB calls staggered by 1s for fair usage
  const totalCalls = 2 + mhciiJobs.length;
  onProgress?.(0, totalCalls, `Firing ${totalCalls} IEDB calls (1s stagger)...`);

  const stagger = (ms: number) => new Promise(r => setTimeout(r, ms));
  const allPromises = [
    stagger(0).then(() => mhciCanonP).then(r => { onProgress?.(1, totalCalls, `MHC-I canonical 1/${totalCalls}`); return { type: 'mhci', label: 'canonical', result: r }; }),
    stagger(1000).then(() => mhciMutP).then(r => { onProgress?.(2, totalCalls, `MHC-I mutated 2/${totalCalls}`); return { type: 'mhci', label: 'mutated', result: r }; }),
    ...mhciiJobs.map((j, idx) =>
      stagger((idx + 2) * 1000).then(() => j.promise).then(r => {
        const num = idx + 3;
        onProgress?.(num, totalCalls, `MHC-II ${j.type === 'bind' ? 'binding' : 'processing'} ${num}/${totalCalls}`);
        return { type: 'mhcii', label: j.label, jobType: j.type, result: r };
      })
    ),
  ];

  const settled = await Promise.all(allPromises);

  // ─── Assemble results ───
  const mhciResults: Record<string, IEDBResult> = {};
  const mhciiBind: Record<string, IEDBResult[]> = { canonical: [], mutated: [] };
  const mhciiProc: Record<string, IEDBResult[]> = { canonical: [], mutated: [] };

  for (const r of settled) {
    if (r.type === 'mhci') {
      mhciResults[r.label] = (r as { result: IEDBResult }).result;
    } else if (r.type === 'mhcii') {
      const jobType = (r as unknown as { jobType: string }).jobType;
      const label = r.label;
      if (jobType === 'bind') mhciiBind[label].push((r as { result: IEDBResult }).result);
      else mhciiProc[label].push((r as { result: IEDBResult }).result);
    }
  }

  const mhci = { canonical: mhciResults['canonical'] || { success: false, columns: [], rows: [] }, mutated: mhciResults['mutated'] || { success: false, columns: [], rows: [] } };

  // Merge MHC-II binding + processing per label
  const mhcii: { canonical: IEDBResult; mutated: IEDBResult } = {
    canonical: { success: false, columns: [], rows: [] },
    mutated: { success: false, columns: [], rows: [] },
  };
  for (const label of ['canonical', 'mutated'] as const) {
    const binds = mhciiBind[label];
    const procs = mhciiProc[label];
    if (binds.length === 0) continue;
    const mergedBind = binds.length > 1 ? mergeIEDBResults(binds) : binds[0];
    const mergedProc = procs.length > 0 ? (procs.length > 1 ? mergeIEDBResults(procs) : procs[0]) : null;

    if (mergedBind.success && mergedProc?.success) {
      const procMap = new Map<string, Record<string, string>>();
      for (const row of mergedProc.rows) {
        const key = `${row[mergedProc.columns.indexOf('peptide')]}_${row[mergedProc.columns.indexOf('allele')]}`;
        const dict: Record<string, string> = {};
        mergedProc.columns.forEach((c, i) => (dict[c] = row[i]));
        procMap.set(key, dict);
      }
      mhcii[label] = {
        success: true,
        columns: [...mergedBind.columns, 'n_motif', 'c_motif', 'cleavage_probability_score', 'cleavage_probability_percentile_rank'],
        rows: mergedBind.rows.map((row) => {
          const key = `${row[mergedBind.columns.indexOf('peptide')]}_${row[mergedBind.columns.indexOf('allele')]}`;
          const proc = procMap.get(key) || {};
          return [...row, proc.n_motif || '', proc.c_motif || '', proc.cleavage_probability_score || '', proc.cleavage_probability_percentile_rank || ''];
        }),
      };
    } else {
      mhcii[label] = mergedBind;
    }
  }

  return { mhci, mhcii };
}

/**
 * Step 6: MHC-II Epitope Prediction (NetMHCIIpan 4.1) — standalone fallback
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
  mutated: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{ canonical: IEDBResult; mutated: IEDBResult }> {
  const bcellSingle = async (label: string, seq: string): Promise<IEDBResult> => {
    const chunks = chunkSequence(seq);
    const chunkResults: IEDBResult[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1 ? `chunk ${ci+1}/${chunks.length}` : label;
      const fasta = `>${geneName}_${label}_chunk${ci}\n${chunk}`;
      const res = await iedbPost(
        {
          pipeline_title: `${geneName} B-cell ${chunkLabel}`,
          run_stage_range: [1, 1],
          stages: [{
            stage_number: 1,
            tool_group: 'bcell_sequence',
            input_sequence_text: fasta,
            input_parameters: {
              predictors: [{ type: 'epitope', method: 'bepipred3', window_size: 9, scoring: 'majority_vote', include_seq_len_esm: true }],
            },
          }],
        },
        `B-cell ${chunkLabel}`
      );
      if (res.success) chunkResults.push(res);
    }
    return chunks.length > 1 && chunkResults.length > 0 ? mergeIEDBResults(chunkResults) : chunkResults[0] || { success: false, columns: [], rows: [] };
  };

  // Fire canonical + mutated concurrently with 1s stagger
  const stagger = (ms: number) => new Promise(r => setTimeout(r, ms));
  onProgress?.(0, 2, 'Firing B-cell calls (canonical + mutated)...');

  const [canonResult, mutResult] = await Promise.all([
    stagger(0).then(() => bcellSingle('canonical', canonical)).then(r => { onProgress?.(1, 2, 'B-cell: canonical done'); return r; }),
    stagger(1000).then(() => bcellSingle('mutated', mutated)).then(r => { onProgress?.(2, 2, 'B-cell: mutated done'); return r; }),
  ]);

  return { canonical: canonResult, mutated: mutResult };
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
