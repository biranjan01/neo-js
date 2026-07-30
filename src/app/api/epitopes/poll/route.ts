// API Route: GET /api/epitopes/poll?resultId=xxx
// Poll IEDB job status (fast, <5s)

import { NextRequest, NextResponse } from 'next/server';

const IEDB_API_URL = 'https://api-nextgen-tools.iedb.org/api/v1';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const resultId = searchParams.get('resultId');

    if (!resultId) {
      return NextResponse.json({ error: 'resultId required' }, { status: 400 });
    }

    const r = await fetch(`${IEDB_API_URL}/results/${resultId}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!r.ok) {
      return NextResponse.json({ error: `IEDB poll failed: ${r.status}` }, { status: 502 });
    }

    const data = await r.json();

    if (data.status === 'done') {
      // Extract peptide table
      for (const t of data.data?.results || []) {
        if (t.type === 'peptide_table') {
          return NextResponse.json({
            status: 'done',
            columns: t.table_columns.map((c: { name: string }) => c.name),
            rows: t.table_data,
          });
        }
      }
      return NextResponse.json({ status: 'done', columns: [], rows: [] });
    }

    if (data.status === 'failed' || data.status === 'error') {
      return NextResponse.json({
        status: 'failed',
        error: data.data?.errors?.[0] || 'Job failed',
      });
    }

    return NextResponse.json({ status: data.status });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
