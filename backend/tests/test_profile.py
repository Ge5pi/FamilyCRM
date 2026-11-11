"""Profile editing and password change."""


def make_family(client, register, auth_headers):
    parent = register(email="parent@example.com", create_family_name="Семья")
    parent_headers = auth_headers(parent["access_token"])
    overview = client.get(
        f"/families/{parent['family_id']}/overview", headers=parent_headers
    ).json()
    child = register(
        email="child@example.com", role="Child", join_code=overview["join_code"]
    )
    return parent, child, parent_headers


def test_new_user_gets_default_avatar(client, register):
    user = register(email="avatar@example.com")
    assert user["avatar"] == "🙂"


def test_update_own_profile(client, register, auth_headers):
    user = register(email="me@example.com")
    headers = auth_headers(user["access_token"])

    response = client.patch(
        f"/users/{user['id']}",
        json={"name": "Новое имя", "avatar": "🐱"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Новое имя"
    assert body["avatar"] == "🐱"

    me = client.get("/auth/me", headers=headers).json()
    assert me["name"] == "Новое имя"
    assert me["avatar"] == "🐱"


def test_empty_avatar_falls_back_to_default(client, register, auth_headers):
    user = register(email="empty@example.com")
    response = client.patch(
        f"/users/{user['id']}",
        json={"avatar": ""},
        headers=auth_headers(user["access_token"]),
    )
    assert response.status_code == 200
    assert response.json()["avatar"] == "🙂"


def test_cannot_update_someone_elses_profile(client, register, auth_headers):
    parent, child, parent_headers = make_family(client, register, auth_headers)
    response = client.patch(
        f"/users/{child['id']}",
        json={"name": "Взлом"},
        headers=parent_headers,
    )
    assert response.status_code == 403


def test_avatar_is_visible_to_family_members(client, register, auth_headers):
    parent, child, parent_headers = make_family(client, register, auth_headers)
    client.patch(
        f"/users/{child['id']}",
        json={"avatar": "🦊"},
        headers=auth_headers(child["access_token"]),
    )

    members = client.get(
        f"/families/{parent['family_id']}/members", headers=parent_headers
    ).json()
    child_in_list = next(m for m in members if m["id"] == child["id"])
    assert child_in_list["avatar"] == "🦊"


def test_change_password_flow(client, register):
    user = register(email="pwd@example.com", password="secret123")

    response = client.post(
        "/auth/change-password",
        json={"current_password": "secret123", "new_password": "newsecret456"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )
    assert response.status_code == 204

    old_login = client.post(
        "/auth/login", json={"email": "pwd@example.com", "password": "secret123"}
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/auth/login", json={"email": "pwd@example.com", "password": "newsecret456"}
    )
    assert new_login.status_code == 200


def test_change_password_rejects_wrong_current(client, register):
    user = register(email="pwd2@example.com", password="secret123")
    response = client.post(
        "/auth/change-password",
        json={"current_password": "wrong", "new_password": "newsecret456"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )
    assert response.status_code == 400


def test_change_password_validates_length(client, register):
    user = register(email="pwd3@example.com", password="secret123")
    response = client.post(
        "/auth/change-password",
        json={"current_password": "secret123", "new_password": "123"},
        headers={"Authorization": f"Bearer {user['access_token']}"},
    )
    assert response.status_code == 422
