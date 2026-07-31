// Edge API Route: POST /api/vaxijen
// Runs on Vercel Edge (Cloudflare CDN) — may bypass Cloudflare IP blocking

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { sequences, target = 'tumour', threshold = '0.5' } = await req.json();

    if (!sequences || !Array.isArray(sequences) || sequences.length === 0) {
      return new Response(JSON.stringify({ error: 'No sequences' }), { status: 400 });
    }

    const fasta = sequences.map((s: string, i: number) => `>pep${i + 1}\n${s}`).join('\n');

    // Submit to VaxiJen CGI
    const formData = new URLSearchParams();
    formData.append('sequence', fasta);
    formData.append('Target', target);
    formData.append('threshold', threshold);
    formData.append('SequenceOnOff', 'on');
    formData.append('SummaryMode', 'off');
    formData.append('Verbose', 'off');

    const resp = await fetch('https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const html = await resp.text();
    const blocked = html.includes('Just a moment') || resp.status === 403;

    if (blocked) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Cloudflare blocked',
        status: resp.status,
      }), { status: 200 });
    }

    // Parse results
    const regex = /Overall Prediction.*?=\s*<b>\s*([\d.]+)\s*<\/b>.*?(ANTIGEN|NON-ANTIGEN)/g;
    const results: { peptide: string; vaxijen_score: number; vaxijen_prediction: string }[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      const idx: number = results.length;
      if (idx < sequences.length) {
        results.push({
          peptide: sequences[idx],
          vaxijen_score: parseFloat(match[1]),
          vaxijen_prediction: match[2],
        });
      }
    }

    const antigens = results.filter((r: any) => r.vaxijen_prediction === 'ANTIGEN').length;

    return new Response(JSON.stringify({
      success: results.length > 0,
      results,
      stats: { total: results.length, antigens, nonAntigens: results.length - antigens },
      method: 'edge_fetch',
    }));
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 200 });
  }
}
