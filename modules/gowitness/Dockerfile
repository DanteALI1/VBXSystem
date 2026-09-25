FROM python:3.12-slim-bookworm

ARG GOWITNESS_VERSION=3.0.5

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        fonts-liberation \
        fonts-dejavu-core \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL \
        "https://github.com/sensepost/gowitness/releases/download/${GOWITNESS_VERSION}/gowitness-${GOWITNESS_VERSION}-linux-amd64" \
        -o /usr/local/bin/gowitness \
    && chmod +x /usr/local/bin/gowitness \
    && mkdir -p /data

WORKDIR /opt/vbx

COPY modules/_sdk/python /opt/vbx/sdk
COPY modules/gowitness /opt/vbx/gowitness

RUN pip install --no-cache-dir -r /opt/vbx/gowitness/requirements.txt

ENV PYTHONPATH=/opt/vbx/sdk
ENV PYTHONUNBUFFERED=1
ENV VBX_GOWITNESS_DATA_DIR=/data
ENV CHROME_PATH=/usr/bin/chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /opt/vbx/gowitness
CMD ["python", "-u", "worker.py"]
