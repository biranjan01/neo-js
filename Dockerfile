FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libglib2.0-0 \
    libgtk-3-0 libx11-xcb1 libxcb-dri3-0 libxss1 libxtst6 fonts-liberation \
    libwayland-client0 libwayland-egl1 libwayland-server0 \
    libxshmfence1 libx11-6 libxcb1 \
    libexpat1 libdbus-glib-1-2 libxt6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY flask-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && python -m camoufox fetch

COPY flask-api/ .
COPY streamlit-apps/popcoverage/population_coverage/ /app/population_coverage/
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV DISPLAY=:99
ENV USER=root

EXPOSE 5000
ENTRYPOINT ["/docker-entrypoint.sh"]
