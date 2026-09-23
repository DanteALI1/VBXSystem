from app.core.security import (
    create_access_token,
    create_temp_2fa_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.api.routes import health


def test_health_endpoint():
    resp = health()
    assert resp.status == "ok"
    assert resp.service == "vbx-api"


def test_password_hash_roundtrip():
    h = hash_password("SecretPass123!")
    assert verify_password("SecretPass123!", h)
    assert not verify_password("wrong", h)


def test_temp_2fa_token_type():
    token = create_temp_2fa_token("42")
    payload = decode_token(token)
    assert payload is not None
    assert payload["type"] == "2fa_pending"
    assert payload["sub"] == "42"


def test_access_token_type():
    token = create_access_token("7")
    payload = decode_token(token)
    assert payload is not None
    assert payload["type"] == "access"
