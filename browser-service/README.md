# Browser Service on Oracle Cloud (Free Forever)

## Step 1: Create Oracle Cloud Account

1. Go to https://cloud.oracle.com
2. Sign up (free tier, no credit card charged)
3. Create a **VM.Standard.E2.1.Micro** ARM instance (always free)

## Step 2: SSH into your VM

```bash
ssh -i your-key.pem ubuntu@your-vm-ip
```

## Step 3: Install Docker

```bash
sudo apt update && sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
```

## Step 4: Run Browserless

```bash
sudo docker run -d \
  --name browserless \
  --restart always \
  -p 3000:3000 \
  -e "TOKEN=none" \
  -e "CONCURRENT=2" \
  -e "MAX_QUEUE_LENGTH=100" \
  ghcr.io/browserless/chromium:latest
```

## Step 5: Open Port 3000

In Oracle Cloud console:
1. Go to your VM → Virtual Cloud Network → Security Lists
2. Add Ingress Rule: Source CIDR `0.0.0.0/0`, Destination Port `3000`

## Step 6: Set Environment Variable in Vercel

```
BROWSERLESS_URL=http://your-vm-ip:3000
```

## Free Tier Limits

- **Oracle Cloud**: Always free (4 GB RAM, 4 ARM cores)
- **Browserless**: Unlimited requests
- **No API key needed**
