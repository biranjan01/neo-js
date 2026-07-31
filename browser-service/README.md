# Browser Service (Self-Hosted Browserless)

Free, unlimited headless browser for VaxiJen Cloudflare bypass.

## Deploy to Railway (Free)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select this repo, folder: `browser-service`
5. Railway will auto-build and deploy
6. Copy the generated URL (e.g., `https://xxx.up.railway.app`)

## Set Environment Variable in Vercel

Add to your Vercel project (Settings → Environment Variables):

```
BROWSERLESS_TOKEN=none
BROWSERLESS_URL=https://your-app.up.railway.app
```

## Free Tier Limits

- **Railway**: 500 hrs/month free (enough for 24/7 operation)
- **Browserless**: Unlimited requests (self-hosted)
- **No API key needed** for self-hosted instance

## How It Works

The VaxiJen API route sends Puppeteer code to this service.
The service runs a real Chrome browser, navigates to VaxiJen,
submits the form, and returns the results.

## Health Check

```
GET https://your-app.up.railway.app/health
```
