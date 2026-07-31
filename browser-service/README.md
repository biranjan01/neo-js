# Browser Service — FlareSolverr (Open Source)

Free, unlimited Cloudflare bypass for VaxiJen. No API key needed.

## What is FlareSolverr?

- **Open source** (MIT license, 15k GitHub stars)
- Bypasses Cloudflare Turnstile challenges
- Uses undetected-chromedriver (Chrome)
- Docker container, runs anywhere
- **No API key, no usage limits**

## Deploy to Render (Free)

1. Go to https://render.com
2. Sign up with GitHub
3. Click **"New"** → **"Web Service"**
4. Connect your GitHub repo
5. Settings:
   - **Name:** `flaresolverr`
   - **Runtime:** Docker
   - **Dockerfile:** `browser-service/Dockerfile`
   - **Instance:** Free (512 MB RAM)
6. Click **"Create Web Service"**
7. Copy the URL (e.g., `https://flaresolverr.onrender.com`)

## Add to Vercel

Settings → Environment Variables:

```
FLARESOLVERR_URL=https://flaresolverr.onrender.com
```

## How It Works

```
Vercel → FlareSolverr → VaxiJen (Cloudflare) → Results
```

1. Your Vercel app sends a POST request to FlareSolverr
2. FlareSolverr opens a real Chrome browser
3. Chrome navigates to VaxiJen and solves Cloudflare
4. FlareSolverr submits the form and gets results
5. Results are returned to your Vercel app

## Free Tier Limits

- **Render Free:** 750 hrs/month, 512 MB RAM
- **FlareSolverr:** Unlimited requests
- **No API key needed**

## Test It

```bash
# Health check
curl https://your-app.onrender.com

# Test VaxiJen request
curl -X POST https://your-app.onrender.com/v1 \
  -H "Content-Type: application/json" \
  -d '{
    "cmd": "request.get",
    "url": "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.cgi",
    "maxTimeout": 60000
  }'
```
