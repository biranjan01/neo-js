mkdir -p ~/.streamlit

echo "[server]
headless = true
port = \$PORT
enableCORS = false
enableXsrfProtection = false

[browser]
gatherUsageStats = false" > ~/.streamlit/config.toml

pip install camoufox pandas
camoufox fetch
