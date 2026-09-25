FROM python:3.12-slim

ARG NUCLEI_VERSION=3.3.9
ARG TARGETARCH=amd64

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && ARCH=$(case "${TARGETARCH}" in arm64|aarch64) echo arm64;; *) echo amd64;; esac) \
    && curl -fsSL \
         "https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_${ARCH}.zip" \
         -o /tmp/nuclei.zip \
    && unzip -o /tmp/nuclei.zip -d /usr/local/bin \
    && chmod +x /usr/local/bin/nuclei \
    && rm -f /tmp/nuclei.zip \
    && rm -rf /var/lib/apt/lists/* \
    && nuclei -version

WORKDIR /opt/vbx

COPY modules/_sdk/python /opt/vbx/sdk
COPY modules/nuclei /opt/vbx/nuclei

RUN pip install --no-cache-dir "httpx==0.28.1" \
    && nuclei -update-templates || true

ENV PYTHONPATH=/opt/vbx/sdk
ENV PYTHONUNBUFFERED=1
# Shared catalog volume (synced by API); custom templates on sibling mount
ENV VBX_NUCLEI_TEMPLATES=/app/artifacts/nuclei-templates

WORKDIR /opt/vbx/nuclei
CMD ["python", "-u", "worker.py"]
