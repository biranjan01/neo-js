import { NextResponse } from 'next/server';

const FLASK_API = process.env.FLASK_API_URL || 'https://neo-js.onrender.com';

export async function GET() {
  try {
    const res = await fetch(`${FLASK_API}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    return NextResponse.json({ status: data.status, url: FLASK_API });
  } catch (e: any) {
    return NextResponse.json({ status: 'error', error: e.message, url: FLASK_API });
  }
}
