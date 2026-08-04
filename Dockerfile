FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libglib2.0-0 \
    libx11-xcb1 libxcb-dri3-0 libxss1 libxtst6 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY flask-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && python -m camoufox fetch

COPY flask-api/ .

EXPOSE 5000
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x1024x24 &>/dev/null & export DISPLAY=:99 && sleep 1 && gunicorn server:app --bind 0.0.0.0:${PORT:-5000} --timeout 600"]
