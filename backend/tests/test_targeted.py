"""Targeted family endpoints used by individual screens."""


def make_family(client, register, auth_headers):
    parent = register(email="parent@example.com", create_family_name="Семья")
    parent_headers = auth_headers(parent["access_token"])
    overview = client.get(
        f"/families/{parent['family_id']}/overview", headers=parent_headers
    ).json()
    child = register(
        email="child@example.com", role="Child", join_code=overview["join_code"]
    )
    return parent, child, parent_headers, auth_headers(child["access_token"])


def test_family_info_endpoint(client, register, auth_headers):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]

    response = client.get(f"/families/{family_id}", headers=parent_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Семья"
    assert body["join_code"]

    # Every member can read the lightweight family info.
    assert client.get(
        f"/families/{family_id}", headers=child_headers
    ).status_code == 200


def test_family_info_is_hidden_from_other_families(client, register, auth_headers):
    parent, _, _, _ = make_family(client, register, auth_headers)
    stranger = register(email="stranger@example.com", create_family_name="Чужие")

    response = client.get(
        f"/families/{parent['family_id']}",
        headers=auth_headers(stranger["access_token"]),
    )
    assert response.status_code == 403


def test_screens_receive_only_their_own_resource(client, register, auth_headers):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]

    event = client.post(
        "/events",
        json={
            "title": "Событие",
            "start_time": "2026-07-03T09:00:00Z",
            "end_time": "2026-07-03T10:00:00Z",
            "user_id": child["id"],
            "family_id": family_id,
        },
        headers=parent_headers,
    )
    assert event.status_code == 201

    task = client.post(
        "/tasks",
        json={
            "title": "Задача",
            "reward_coins": 5,
            "status": "TODO",
            "created_by_id": parent["id"],
            "family_id": family_id,
        },
        headers=parent_headers,
    )
    assert task.status_code == 201

    expense = client.post(
        "/expenses",
        json={
            "title": "Хлеб",
            "amount": 50,
            "category": "Продукты",
            "user_id": parent["id"],
            "family_id": family_id,
        },
        headers=parent_headers,
    )
    assert expense.status_code == 201

    assert len(
        client.get(f"/families/{family_id}/events", headers=parent_headers).json()
    ) == 1
    assert len(
        client.get(f"/families/{family_id}/tasks", headers=parent_headers).json()
    ) == 1
    assert len(
        client.get(f"/families/{family_id}/expenses", headers=parent_headers).json()
    ) == 1
    assert len(
        client.get(f"/families/{family_id}/members", headers=parent_headers).json()
    ) == 2

    # The reminders query returns only the current user's events.
    assert len(
        client.get(f"/users/{child['id']}/events", headers=child_headers).json()
    ) == 1
    assert (
        client.get(f"/users/{parent['id']}/events", headers=parent_headers).json()
        == []
    )


def test_overview_still_matches_targeted_endpoints(client, register, auth_headers):
    """`/overview` is kept for debugging and must stay consistent."""
    parent, _, headers, _ = make_family(client, register, auth_headers)
    family_id = parent["family_id"]

    client.post(
        "/tasks",
        json={
            "title": "Сверка",
            "reward_coins": 1,
            "status": "TODO",
            "created_by_id": parent["id"],
            "family_id": family_id,
        },
        headers=headers,
    )

    overview = client.get(f"/families/{family_id}/overview", headers=headers).json()
    tasks = client.get(f"/families/{family_id}/tasks", headers=headers).json()
    members = client.get(f"/families/{family_id}/members", headers=headers).json()

    assert len(overview["tasks"]) == len(tasks)
    assert len(overview["users"]) == len(members)
    assert overview["join_code"] == client.get(
        f"/families/{family_id}", headers=headers
    ).json()["join_code"]
