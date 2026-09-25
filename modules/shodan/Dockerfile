FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/vbx

COPY modules/_sdk/python /opt/vbx/sdk
COPY modules/shodan /opt/vbx/shodan

RUN pip install --no-cache-dir "httpx==0.28.1"

ENV PYTHONPATH=/opt/vbx/sdk
ENV PYTHONUNBUFFERED=1

WORKDIR /opt/vbx/shodan
CMD ["python", "-u", "worker.py"]
