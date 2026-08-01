import https from 'https';
import http from 'http';

export async function ipv4Fetch(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const mod = isHttps ? https : http;
  const socketTimeout = opts.timeout || 600000;

  const body = opts.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : undefined;
  const headers: Record<string, string> = {};
  if (opts.headers) {
    if (opts.headers instanceof Headers) {
      opts.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(opts.headers)) {
      for (const [k, v] of opts.headers) headers[k] = v;
    } else {
      Object.assign(headers, opts.headers);
    }
  }
  if (body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (body) {
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }

  return new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: (opts.method || 'GET').toUpperCase(),
      headers,
      family: 4,
      timeout: socketTimeout,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const respHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (v) respHeaders.set(k, Array.isArray(v) ? v.join(', ') : v);
        }
        resolve(new Response(buf, {
          status: res.statusCode || 500,
          statusText: res.statusMessage || '',
          headers: respHeaders,
        }));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(body);
    req.end();
  });
}
