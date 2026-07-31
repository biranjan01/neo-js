mkdir -p ~/.streamlit

echo "[server]
headless = true
port = \$PORT
enableCORS = false
enableXsrfProtection = false

[browser]
gatherUsageStats = false" > ~/.streamlit/config.toml

# Install Firefox dependencies
apt-get update
apt-get install -y --no-install-recommends \
    libgtk-3-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxfixes3 \
    libxtst6 \
    fonts-liberation

pip install camoufox pandas
camoufox fetch
