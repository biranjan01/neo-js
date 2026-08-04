import { NextResponse } from 'next/server';

const STREAMLIT_APPS = [
  process.env.STREAMLIT_VAXIJEN_URL,
  process.env.STREAMLIT_IMMUNO_URL,
  process.env.STREAMLIT_ALLERTOP_URL,
  process.env.STREAMLIT_TOXINPRED_URL,
  process.env.STREAMLIT_POPCOVERAGE_URL,
].filter(Boolean);

export async function GET() {
  const results: Record<string, string> = {};

  const promises = STREAMLIT_APPS.map(async (url) => {
    try {
      const res = await fetch(url!, {
        method: 'GET',
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      });
      results[url!] = res.ok ? 'ok' : `status ${res.status}`;
    } catch (e: any) {
      results[url!] = `error: ${e.message}`;
    }
  });

  await Promise.allSettled(promises);

  return NextResponse.json({
    warmed: STREAMLIT_APPS.length,
    results,
  });
}
