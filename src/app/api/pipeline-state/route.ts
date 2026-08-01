// API Route: GET/POST /api/pipeline-state
// Save and load pipeline state for resume functionality

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const STATE_DIR = path.join(process.cwd(), '.pipeline-state');

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function stateFile(gene: string) {
  return path.join(STATE_DIR, `${gene.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
}

export async function GET(request: NextRequest) {
  try {
    const gene = request.nextUrl.searchParams.get('gene');
    if (!gene) {
      ensureDir();
      const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
      const states = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf-8'));
        return { gene: data.geneName, lastStep: data.lastCompletedStep, savedAt: data.savedAt };
      });
      return NextResponse.json({ states });
    }

    const file = stateFile(gene);
    if (!fs.existsSync(file)) {
      return NextResponse.json({ state: null });
    }

    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return NextResponse.json({ state: data });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { geneName, lastCompletedStep, steps, stepData, refSeq, mutSeq, cosmicCsv, cancerType, msaAlignment, msaPng } = body;

    if (!geneName) {
      return NextResponse.json({ error: 'geneName required' }, { status: 400 });
    }

    ensureDir();

    const state = {
      geneName,
      lastCompletedStep,
      steps,
      stepData,
      refSeq,
      mutSeq,
      cosmicCsv,
      cancerType,
      msaAlignment,
      msaPng,
      savedAt: new Date().toISOString(),
    };

    fs.writeFileSync(stateFile(geneName), JSON.stringify(state, null, 2));

    return NextResponse.json({ ok: true, savedAt: state.savedAt });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const gene = request.nextUrl.searchParams.get('gene');
    if (!gene) return NextResponse.json({ error: 'gene required' }, { status: 400 });

    const file = stateFile(gene);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
