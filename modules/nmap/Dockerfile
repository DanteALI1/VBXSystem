FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends nmap ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/vbx

COPY modules/_sdk/python /opt/vbx/sdk
COPY modules/nmap /opt/vbx/nmap

RUN pip install --no-cache-dir "httpx==0.28.1"

ENV PYTHONPATH=/opt/vbx/sdk
ENV PYTHONUNBUFFERED=1

WORKDIR /opt/vbx/nmap
CMD ["python", "-u", "worker.py"]
