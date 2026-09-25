FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/vbx

COPY modules/_sdk/python /opt/vbx/sdk
COPY modules/discovery /opt/vbx/discovery

RUN pip install --no-cache-dir -r /opt/vbx/discovery/requirements.txt

ENV PYTHONPATH=/opt/vbx/sdk
ENV PYTHONUNBUFFERED=1

WORKDIR /opt/vbx/discovery
CMD ["python", "-u", "worker.py"]
