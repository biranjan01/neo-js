const STREAMLIT_VAXIJEN = process.env.STREAMLIT_VAXIJEN_URL || 'https://antigenicity.streamlit.app';
const STREAMLIT_IMMUNO = process.env.STREAMLIT_IMMUNO_URL || 'https://immunogenicity.streamlit.app';
const STREAMLIT_ALLERTOP = process.env.STREAMLIT_ALLERTOP_URL || 'https://allergenicity.streamlit.app';
const STREAMLIT_TOXINPRED = process.env.STREAMLIT_TOXINPRED_URL || 'https://toxicities.streamlit.app';
const STREAMLIT_POPCOVERAGE = process.env.STREAMLIT_POPCOVERAGE_URL || 'https://popcoverage.streamlit.app';

export interface StepResult {
  sequence: string;
  score?: number | null;
  prediction?: string | null;
  similar_protein?: string | null;
  error?: string | null;
}

async function callStreamlitApp(
  appUrl: string,
  sequences: string[],
  extraParams: Record<string, string> = {}
): Promise<StepResult[]> {
  const jobId = `${Date.now()}`;
  const params = new URLSearchParams({
    mode: 'upload',
    seqs: JSON.stringify(sequences),
    job: jobId,
    ...extraParams,
  });

  const url = `${appUrl}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(18000000) });
  const html = await res.text();

  const jsonMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)
    || html.match(/data-testid="stJSON"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/\{[\s\S]*"total"[\s\S]*"data"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr.replace(/<[^>]+>/g, ''));
      if (parsed.data) return parsed.data;
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fallback: try to extract result objects
    }
  }

  const results: StepResult[] = [];
  for (const seq of sequences) {
    const seqEscaped = seq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const predMatch = html.match(new RegExp(seqEscaped + '[\\s\\S]{0,200}?(ANTIGEN|NON-ANTIGEN|IMMUNOGEN|NON-IMMUNOGEN|ALLERGEN|NON-ALLERGEN|Toxin|Non-Toxin)', 'i'));
    const scoreMatch = html.match(new RegExp(seqEscaped + '[\\s\\S]{0,200}?score["\':\\s]+([\\d.]+)', 'i'));
    results.push({
      sequence: seq,
      prediction: predMatch ? predMatch[1] : 'Unknown',
      score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
    });
  }
  return results;
}

export { callStreamlitApp, STREAMLIT_VAXIJEN, STREAMLIT_IMMUNO, STREAMLIT_ALLERTOP, STREAMLIT_TOXINPRED, STREAMLIT_POPCOVERAGE };
