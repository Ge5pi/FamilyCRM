def test_family_isolation(client, register, auth_headers):
    alice = register(email="alice@example.com", create_family_name="Алисовы")
    bob = register(email="bob@example.com", create_family_name="Бобовы")
    alice_headers = auth_headers(alice["access_token"])

    assert client.get(
        f"/families/{bob['family_id']}/overview", headers=alice_headers
    ).status_code == 403
    assert client.get(
        f"/families/{bob['family_id']}/events", headers=alice_headers
    ).status_code == 403
    assert client.get(
        f"/users/{bob['id']}", headers=alice_headers
    ).status_code == 403
    assert client.get(
        f"/users/{bob['id']}/events", headers=alice_headers
    ).status_code == 403


def test_child_cannot_manage_family(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    child = register(
        email="c@example.com", role="Child", join_code=None
    )
    # Move the child into the parent's family using the join code.
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

    child_headers = auth_headers(child["access_token"])

    assert client.post(
        "/users",
        json={"name": "Новый", "role": "Child"},
        headers=child_headers,
    ).status_code == 403

    assert client.post(
        f"/families/{parent['family_id']}/invite",
        json={"email": "someone@example.com"},
        headers=child_headers,
    ).status_code == 403


def test_parent_can_create_family_member(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = client.post(
        "/users",
        json={"name": "Бабушка", "role": "Parent", "email": "granny@example.com", "password": "secret123"},
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 201
    assert response.json()["family_id"] == parent["family_id"]

    # The new member can log in.
    login = client.post(
        "/auth/login", json={"email": "granny@example.com", "password": "secret123"}
    )
    assert login.status_code == 200


def test_create_member_without_password_requires_no_email(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = client.post(
        "/users",
        json={"name": "Малыш", "role": "Child"},
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 201
    assert response.json()["email"] is None


def test_create_member_with_password_requires_email(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = client.post(
        "/users",
        json={"name": "Без почты", "role": "Child", "password": "secret123"},
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 422


def test_only_self_can_update_location(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    child = register(email="c@example.com", role="Child")
    overview = client.get(
        f"/families/{parent['family_id']}/overview",
        headers=auth_headers(parent["access_token"]),
    ).json()
    assert client.post(
        f"/users/{child['id']}/join",
        json={"join_code": overview["join_code"]},
        headers=auth_headers(child["access_token"]),
    ).status_code == 200

    response = client.put(
        f"/users/{child['id']}/location",
        json={"latitude": 10.0, "longitude": 20.0},
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 403


def test_invite_moves_a_sole_member_but_not_a_shared_one(client, register, auth_headers):
    alice = register(email="alice@example.com", create_family_name="Алисовы")
    alice_headers = auth_headers(alice["access_token"])

    # A user who is alone in their auto-created family can be invited.
    register(email="loner@example.com")
    response = client.post(
        f"/families/{alice['family_id']}/invite",
        json={"email": "loner@example.com"},
        headers=alice_headers,
    )
    assert response.status_code == 200
    assert response.json()["family_id"] == alice["family_id"]

    # A user who already shares a family cannot be pulled away.
    other_parent = register(email="other@example.com", create_family_name="Другие")
    other_overview = client.get(
        f"/families/{other_parent['family_id']}/overview",
        headers=auth_headers(other_parent["access_token"]),
    ).json()
    member = register(
        email="member@example.com",
        role="Child",
        join_code=other_overview["join_code"],
    )
    response = client.post(
        f"/families/{alice['family_id']}/invite",
        json={"email": member["email"]},
        headers=alice_headers,
    )
    assert response.status_code == 400


def test_create_family_endpoint_moves_sole_member(client, register, auth_headers):
    user = register(email="solo@example.com")
    old_family_id = user["family_id"]
    response = client.post(
        "/families",
        json={"name": "Новая семья"},
        headers=auth_headers(user["access_token"]),
    )
    assert response.status_code == 201
    assert response.json()["id"] != old_family_id

    me = client.get(
        "/auth/me", headers=auth_headers(user["access_token"])
    ).json()
    assert me["family_id"] == response.json()["id"]


def test_create_family_rejected_for_shared_family(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    overview = client.get(
        f"/families/{parent['family_id']}/overview",
        headers=auth_headers(parent["access_token"]),
    ).json()
    register(email="c@example.com", role="Child", join_code=overview["join_code"])

    response = client.post(
        "/families",
        json={"name": "Ещё одна"},
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 400
