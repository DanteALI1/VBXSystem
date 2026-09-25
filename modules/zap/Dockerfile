FROM zaproxy/zap-stable:latest

USER root
RUN pip3 install --no-cache-dir --break-system-packages "httpx==0.28.1"

WORKDIR /opt/vbx
COPY modules/_sdk/python /opt/vbx/sdk
COPY modules/zap /opt/vbx/zap

RUN chmod +x /opt/vbx/zap/entrypoint.sh \
    && mkdir -p /zap/wrk /tmp \
    && chown -R zap:zap /opt/vbx /zap/wrk /tmp 2>/dev/null || true

ENV PYTHONPATH=/opt/vbx/sdk
ENV PYTHONUNBUFFERED=1
ENV HOME=/home/zap
# Local daemon for spider/full/api API path (override with external VBX_ZAP_API_URL)
ENV VBX_ZAP_START_DAEMON=true
ENV VBX_ZAP_DAEMON_PORT=8080
ENV VBX_ZAP_API_URL=http://127.0.0.1:8080

USER zap

WORKDIR /opt/vbx/zap
ENTRYPOINT ["/opt/vbx/zap/entrypoint.sh"]
