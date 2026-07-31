FROM python:3.11-slim

WORKDIR /app

# Install ALL system dependencies needed for Firefox/Camoufox
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxkbcommon0 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libgdk-pixbuf2.0-0 \
    libxml2 \
    libcairo2 \
    libfontconfig1 \
    libfreetype6 \
    libharfbuzz0b \
    libjpeg62-turbo \
    libpng16-16 \
    libwebp7 \
    libtiff6 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir fastapi uvicorn camoufox pydantic

# Fetch Camoufox browser
RUN camoufox fetch

COPY server.py .

EXPOSE 8000

CMD ["python", "server.py"]
