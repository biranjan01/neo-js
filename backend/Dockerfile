FROM python:3.11-slim

# Install system deps — handle both old (libasound2) and new (libasound2t64) naming
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk-3-0 libdbus-glib-1-2 libxt6 libpulse0 \
    fonts-liberation procps curl ca-certificates \
    && (apt-get install -y --no-install-recommends libasound2t64 || apt-get install -y --no-install-recommends libasound2) \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir numpy matplotlib setuptools
RUN python -m camoufox fetch

COPY main.py .
COPY population_coverage/ population_coverage/

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
