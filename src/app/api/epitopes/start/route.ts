// API Route: POST /api/epitopes/start
// Submit IEDB job and return result_id (fast, <5s)

import { NextRequest, NextResponse } from 'next/server';

const IEDB_API_URL = 'https://api-nextgen-tools.iedb.org/api/v1';

const MHC_I_27 = 'HLA-A*01:01,HLA-A*02:01,HLA-A*02:03,HLA-A*02:06,HLA-A*03:01,HLA-A*11:01,HLA-A*23:01,HLA-A*24:02,HLA-A*26:01,HLA-A*30:01,HLA-A*30:02,HLA-A*31:01,HLA-A*32:01,HLA-A*33:01,HLA-A*68:01,HLA-A*68:02,HLA-B*07:02,HLA-B*08:01,HLA-B*15:01,HLA-B*35:01,HLA-B*40:01,HLA-B*44:02,HLA-B*44:03,HLA-B*51:01,HLA-B*53:01,HLA-B*57:01,HLA-B*58:01';

const MHC_II_27 = 'HLA-DRB1*01:01,HLA-DRB1*03:01,HLA-DRB1*04:01,HLA-DRB1*04:05,HLA-DRB1*07:01,HLA-DRB1*08:02,HLA-DRB1*09:01,HLA-DRB1*11:01,HLA-DRB1*12:01,HLA-DRB1*13:02,HLA-DRB1*15:01,HLA-DRB3*01:01,HLA-DRB3*02:02,HLA-DRB4*01:01,HLA-DRB5*01:01,HLA-DQA1*05:01/DQB1*02:01,HLA-DQA1*05:01/DQB1*03:01,HLA-DQA1*03:01/DQB1*03:02,HLA-DQA1*04:01/DQB1*04:02,HLA-DQA1*01:01/DQB1*05:01,HLA-DQA1*01:02/DQB1*06:02,HLA-DPA1*02:01/DPB1*01:01,HLA-DPA1*01:03/DPB1*02:01,HLA-DPA1*01:03/DPB1*04:01,HLA-DPA1*03:01/DPB1*04:02,HLA-DPA1*02:01/DPB1*05:01,HLA-DPA1*02:01/DPB1*14:01';

function buildPayload(geneName: string, label: string, seq: string, step: number) {
  const fasta = `>${geneName}_${label}\n${seq}`;

  if (step === 5) {
    // MHC-I
    return {
      pipeline_title: `${geneName} MHC-I ${label}`,
      run_stage_range: [1, 1],
      stages: [{
        stage_number: 1, tool_group: 'mhci',
        input_sequence_text: fasta,
        input_parameters: {
          alleles: MHC_I_27,
          peptide_length_range: [9, 9],
          predictors: [
            { type: 'binding', method: 'netmhcpan_el' },
            { type: 'processing', method: 'basic_processing', mhc_binding_method: 'netmhcpan_ba', proteasome: 'immuno', tap_precursor: 1, tap_alpha: 0.2 },
            { type: 'immunogenicity', mask_choice: 'by_allele' },
          ],
        },
      }],
    };
  }

  if (step === 6) {
    // MHC-II binding
    return {
      pipeline_title: `${geneName} MHC-II ${label}`,
      run_stage_range: [1, 1],
      stages: [{
        stage_number: 1, tool_group: 'mhcii',
        input_sequence_text: fasta,
        input_parameters: {
          alleles: MHC_II_27,
          peptide_length_range: [15, 15],
          predictors: [{ type: 'binding', method: 'netmhciipan_el' }],
        },
      }],
    };
  }

  if (step === 7) {
    // B-cell
    return {
      pipeline_title: `${geneName} B-cell ${label}`,
      run_stage_range: [1, 1],
      stages: [{
        stage_number: 1, tool_group: 'bcell_sequence',
        input_sequence_text: fasta,
        input_parameters: {
          predictors: [{
            type: 'epitope', method: 'bepipred3',
            window_size: 9, scoring: 'majority_vote', include_seq_len_esm: true,
          }],
        },
      }],
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { geneName, canonicalSeq, mutatedSeq, step, label } = await request.json();

    if (!geneName || !canonicalSeq || !mutatedSeq || !step || !label) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const seq = label === 'canonical' ? canonicalSeq : mutatedSeq;
    const payload = buildPayload(geneName, label, seq, step);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    console.log(`Submitting IEDB job: ${payload.pipeline_title}`);

    const r = await fetch(`${IEDB_API_URL}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (!r.ok) {
      return NextResponse.json({ error: `IEDB submit failed: ${r.status}` }, { status: 502 });
    }

    const data = await r.json();
    if (data.errors?.length > 0) {
      return NextResponse.json({ error: data.errors[0] }, { status: 502 });
    }

    return NextResponse.json({ resultId: data.result_id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
