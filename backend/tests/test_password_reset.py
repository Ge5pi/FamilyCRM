"""Password reset via one-time email codes."""

from datetime import timedelta

from models import PasswordResetToken
from timeutils import utc_now_naive


def request_code(client, email):
    response = client.post("/auth/forgot-password", json={"email": email})
    assert response.status_code == 202, response.text
    return response.json()


def test_unknown_email_does_not_leak_accounts(client):
    body = request_code(client, "nobody@example.com")
    assert "dev_code" not in body
    assert body["detail"]


def test_forgot_password_returns_dev_code_without_smtp(client, register):
    register(email="reset@example.com", password="secret123")
    body = request_code(client, "reset@example.com")
    assert body.get("dev_code")
    assert len(body["dev_code"]) >= 6


def test_reset_password_flow(client, register):
    user = register(email="reset2@example.com", password="secret123")
    old_token = user["access_token"]
    code = request_code(client, "reset2@example.com")["dev_code"]

    response = client.post(
        "/auth/reset-password",
        json={"code": code, "new_password": "brandnew123"},
    )
    assert response.status_code == 204

    # Old JWT is revoked by the token version bump.
    assert client.get(
        "/auth/me", headers={"Authorization": f"Bearer {old_token}"}
    ).status_code == 401

    assert client.post(
        "/auth/login",
        json={"email": "reset2@example.com", "password": "secret123"},
    ).status_code == 401
    assert client.post(
        "/auth/login",
        json={"email": "reset2@example.com", "password": "brandnew123"},
    ).status_code == 200


def test_code_is_single_use(client, register):
    register(email="reset3@example.com", password="secret123")
    code = request_code(client, "reset3@example.com")["dev_code"]

    assert client.post(
        "/auth/reset-password",
        json={"code": code, "new_password": "brandnew123"},
    ).status_code == 204
    assert client.post(
        "/auth/reset-password",
        json={"code": code, "new_password": "another123"},
    ).status_code == 400


def test_wrong_code_is_rejected(client, register):
    register(email="reset4@example.com", password="secret123")
    response = client.post(
        "/auth/reset-password",
        json={"code": "DEADBEEF00", "new_password": "brandnew123"},
    )
    assert response.status_code == 400


def test_expired_code_is_rejected(client, register, db_session):
    register(email="reset5@example.com", password="secret123")
    code = request_code(client, "reset5@example.com")["dev_code"]

    db_session.query(PasswordResetToken).update(
        {"expires_at": utc_now_naive() - timedelta(minutes=1)}
    )
    db_session.commit()

    response = client.post(
        "/auth/reset-password",
        json={"code": code, "new_password": "brandnew123"},
    )
    assert response.status_code == 400


def test_new_request_invalidates_previous_code(client, register):
    register(email="reset6@example.com", password="secret123")
    first = request_code(client, "reset6@example.com")["dev_code"]
    second = request_code(client, "reset6@example.com")["dev_code"]
    assert first != second

    assert client.post(
        "/auth/reset-password",
        json={"code": first, "new_password": "brandnew123"},
    ).status_code == 400
    assert client.post(
        "/auth/reset-password",
        json={"code": second, "new_password": "brandnew123"},
    ).status_code == 204
