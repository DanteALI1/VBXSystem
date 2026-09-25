FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    git \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
# Strip CRLF so Windows checkouts don't break the shebang ("no such file or directory")
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["/app/entrypoint.sh"]
