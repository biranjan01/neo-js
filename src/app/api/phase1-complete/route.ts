import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { mhcICsv, mhcIICsv, gene } = await req.json();

    if (!mhcICsv && !mhcIICsv) {
      return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
    }

    const PAT = process.env.GITHUB_PAT;
    if (!PAT) {
      return NextResponse.json({ error: 'GITHUB_PAT not configured' }, { status: 500 });
    }

    const files: Record<string, { content: string }> = {};
    if (mhcICsv) files['neoantigens_mhc_I.csv'] = { content: mhcICsv };
    if (mhcIICsv) files['neoantigens_mhc_II.csv'] = { content: mhcIICsv };

    const gistBody = JSON.stringify({
      description: `Phase 1 neoantigens for ${gene || 'unknown'} (${Object.keys(files).length} files)`,
      public: false,
      files,
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
    const rawUrls: Record<string, string> = {};
    for (const [filename, fileData] of Object.entries(gist.files) as any[]) {
      rawUrls[filename] = fileData.raw_url;
    }

    return NextResponse.json({
      success: true,
      gist_id: gist.id,
      files: rawUrls,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
