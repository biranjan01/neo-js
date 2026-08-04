const FLASK_API = process.env.FLASK_API_URL || 'http://localhost:5000';

const STREAMLIT_VAXIJEN = FLASK_API;
const STREAMLIT_IMMUNO = FLASK_API;
const STREAMLIT_ALLERTOP = FLASK_API;
const STREAMLIT_TOXINPRED = FLASK_API;
const STREAMLIT_POPCOVERAGE = FLASK_API;

export interface StepResult {
  sequence: string;
  score?: number | null;
  prediction?: string | null;
  similar_protein?: string | null;
  error?: string | null;
}

async function callFlaskEndpoint(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<any> {
  const url = `${FLASK_API}${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18000000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.detail || `Flask ${endpoint} failed`);
  return data;
}

export { callFlaskEndpoint, STREAMLIT_VAXIJEN, STREAMLIT_IMMUNO, STREAMLIT_ALLERTOP, STREAMLIT_TOXINPRED, STREAMLIT_POPCOVERAGE, FLASK_API };
