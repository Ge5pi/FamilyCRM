import hashlib

from models import Family, User


def test_register_creates_family_and_returns_token(register):
    user = register(email="mom@example.com", name="Ольга")
    assert user["email"] == "mom@example.com"
    assert user["family_id"] is not None
    assert user["coins"] == 0
    assert user["access_token"]
    assert user["token_type"] == "bearer"


def test_register_normalizes_email(register):
    user = register(email="  MOM@Example.COM ")
    assert user["email"] == "mom@example.com"


def test_register_with_explicit_family_name(client, register):
    user = register(create_family_name="Ивановы")
    response = client.get(
        f"/families/{user['family_id']}/overview",
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Ивановы"


def test_login_returns_token(client, register):
    created = register(email="dad@example.com", password="secret123")
    response = client.post(
        "/auth/login", json={"email": "dad@example.com", "password": "secret123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == created["id"]
    assert body["access_token"]


def test_login_with_wrong_password_is_rejected(client, register):
    register(email="dad@example.com", password="secret123")
    response = client.post(
        "/auth/login", json={"email": "dad@example.com", "password": "wrong-pass"}
    )
    assert response.status_code == 401


def test_duplicate_email_is_rejected(client, register):
    register(email="dup@example.com")
    response = client.post(
        "/auth/register",
        json={
            "email": "dup@example.com",
            "password": "secret123",
            "name": "Дубль",
            "role": "Parent",
        },
    )
    assert response.status_code == 400


def test_short_password_is_rejected(client):
    response = client.post(
        "/auth/register",
        json={
            "email": "short@example.com",
            "password": "123",
            "name": "Короткий",
            "role": "Parent",
        },
    )
    assert response.status_code == 422


def test_invalid_role_is_rejected(client):
    response = client.post(
        "/auth/register",
        json={
            "email": "role@example.com",
            "password": "secret123",
            "name": "Роль",
            "role": "Admin",
        },
    )
    assert response.status_code == 422


def test_protected_endpoint_requires_token(client):
    response = client.get("/families/1/overview")
    assert response.status_code == 401


def test_invalid_token_is_rejected(client):
    response = client.get(
        "/families/1/overview", headers={"Authorization": "Bearer not-a-token"}
    )
    assert response.status_code == 401


def test_auth_me_returns_current_user(client, register):
    user = register(email="me@example.com")
    response = client.get(
        "/auth/me", headers={"Authorization": f"Bearer {user['access_token']}"}
    )
    assert response.status_code == 200
    assert response.json()["id"] == user["id"]


def test_join_family_by_code(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Петровы")
    child = register(email="c@example.com", role="Child")
    assert child["family_id"] != parent["family_id"]

    overview = client.get(
        f"/families/{parent['family_id']}/overview",
        headers=auth_headers(parent["access_token"]),
    ).json()

    response = client.post(
        f"/users/{child['id']}/join",
        json={"join_code": overview["join_code"]},
        headers=auth_headers(child["access_token"]),
    )
    assert response.status_code == 200
    assert response.json()["family_id"] == parent["family_id"]


def test_join_family_with_invalid_code_is_rejected(client, register):
    child = register(email="c2@example.com", role="Child")
    response = client.post(
        f"/users/{child['id']}/join",
        json={"join_code": "NOPE00"},
        headers={"Authorization": f"Bearer {child['access_token']}"},
    )
    assert response.status_code == 404


def test_legacy_sha256_password_is_upgraded_on_login(client, db_session):
    family = Family(name="Legacy family", join_code="LEGACY")
    db_session.add(family)
    db_session.commit()

    legacy_user = User(
        email="legacy@example.com",
        hashed_password=hashlib.sha256(b"oldpassword").hexdigest(),
        name="Легаси",
        role="Parent",
        family_id=family.id,
        coins=0,
    )
    db_session.add(legacy_user)
    db_session.commit()

    response = client.post(
        "/auth/login",
        json={"email": "legacy@example.com", "password": "oldpassword"},
    )
    assert response.status_code == 200

    db_session.expire_all()
    refreshed = (
        db_session.query(User).filter(User.email == "legacy@example.com").one()
    )
    assert refreshed.hashed_password.startswith("$2")
    assert refreshed.hashed_password != hashlib.sha256(b"oldpassword").hexdigest()
