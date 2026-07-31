FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Install Steer
RUN npm install -g @anthropic-ai/steer 2>/dev/null || npm install -g steer 2>/dev/null || true

# Create a simple HTTP server that runs browser tasks
WORKDIR /app
RUN cat > /app/package.json << 'JSON'
{
  "name": "browser-service",
  "version": "1.0.0",
  "dependencies": {
    "playwright-core": "1.58.2"
  }
}
JSON

RUN npm install

# Create the service
RUN cat > /app/server.js << 'JSEOF'
const http = require('http');
const { chromium } = require('playwright-core');

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'GET' && req.url === '/health') {
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  
  if (req.method === 'POST' && req.url === '/function') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { code, context } = JSON.parse(body);
        const browser = await getBrowser();
        const page = await browser.newPage();
        
        // Execute the function
        const fn = new Function('page', 'context', code);
        const result = await fn(page, context || {});
        
        await page.close();
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Browser service running on port ${PORT}`);
});
JSEOF

EXPOSE 3000
CMD ["node", "/app/server.js"]
