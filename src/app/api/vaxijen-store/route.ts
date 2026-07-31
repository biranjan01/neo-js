import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sequences, target, threshold, batch_size, gene } = body;

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return NextResponse.json({ error: 'No sequences provided' }, { status: 400 });
    }

    const PAT = process.env.GITHUB_PAT;
    if (!PAT) {
      return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 });
    }

    const inputData = JSON.stringify({
      sequences,
      target: target || 'Tumour',
      threshold: threshold || 0.5,
      batch_size: batch_size || 5,
      gene: gene || 'unknown',
    });

    const gistBody = JSON.stringify({
      description: `VaxiJen input for ${gene || 'unknown'} (${sequences.length} sequences)`,
      public: false,
      files: {
        'input.json': { content: inputData },
      },
    });

    const resp = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `token ${PAT}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: gistBody,
    });

    if (!resp.ok) {
      const err = await resp.text();
      return NextResponse.json({ error: `Gist creation failed: ${err}` }, { status: 500 });
    }

    const gist = await resp.json();
    const rawUrl = gist.files['input.json'].raw_url;

    return NextResponse.json({ success: true, gist_url: rawUrl, gist_id: gist.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
