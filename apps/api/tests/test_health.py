from app.api.routes import health


def test_health_endpoint():
    resp = health()
    assert resp.status == "ok"
    assert resp.service == "vbx-api"
