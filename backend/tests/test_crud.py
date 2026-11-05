"""CRUD for events, tasks and expenses, plus targeted member listing."""


def make_family(client, register, auth_headers):
    parent = register(email="parent@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])
    overview = client.get(
        f"/families/{parent['family_id']}/overview", headers=headers
    ).json()
    child = register(
        email="child@example.com",
        role="Child",
        join_code=overview["join_code"],
    )
    return parent, child, headers


def test_members_endpoint(client, register, auth_headers):
    parent, child, headers = make_family(client, register, auth_headers)
    response = client.get(
        f"/families/{parent['family_id']}/members", headers=headers
    )
    assert response.status_code == 200
    members = response.json()
    assert {m["id"] for m in members} == {parent["id"], child["id"]}


def test_event_crud(client, register, auth_headers):
    parent, _, headers = make_family(client, register, auth_headers)
    created = client.post(
        "/events",
        json={
            "title": "Ужин",
            "start_time": "2026-07-03T18:00:00",
            "end_time": "2026-07-03T19:00:00",
            "category": "Routine",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=headers,
    ).json()

    response = client.patch(
        f"/events/{created['id']}",
        json={"title": "Поздний ужин", "category": "Home"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Поздний ужин"
    assert response.json()["category"] == "Home"

    invalid = client.patch(
        f"/events/{created['id']}",
        json={"start_time": "2026-07-03T20:00:00"},
        headers=headers,
    )
    assert invalid.status_code == 422

    assert client.delete(
        f"/events/{created['id']}", headers=headers
    ).status_code == 204
    assert client.delete(
        f"/events/{created['id']}", headers=headers
    ).status_code == 404


def test_child_cannot_edit_parents_event(client, register, auth_headers):
    parent, child, parent_headers = make_family(client, register, auth_headers)
    created = client.post(
        "/events",
        json={
            "title": "Родительское",
            "start_time": "2026-07-03T18:00:00",
            "end_time": "2026-07-03T19:00:00",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=parent_headers,
    ).json()

    response = client.patch(
        f"/events/{created['id']}",
        json={"title": "Взлом"},
        headers=auth_headers(child["access_token"]),
    )
    assert response.status_code == 403


def test_task_crud(client, register, auth_headers):
    parent, child, headers = make_family(client, register, auth_headers)
    task = client.post(
        "/tasks",
        json={
            "title": "Убрать",
            "reward_coins": 10,
            "status": "TODO",
            "assigned_to_id": child["id"],
            "created_by_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=headers,
    ).json()

    response = client.patch(
        f"/tasks/{task['id']}",
        json={
            "title": "Убрать комнату",
            "reward_coins": 25,
            "assigned_to_id": parent["id"],
        },
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Убрать комнату"
    assert body["reward_coins"] == 25
    assert body["assigned_to_id"] == parent["id"]

    # Assigning a user from another family is rejected.
    stranger = register(email="stranger@example.com", create_family_name="Чужие")
    invalid = client.patch(
        f"/tasks/{task['id']}",
        json={"assigned_to_id": stranger["id"]},
        headers=headers,
    )
    assert invalid.status_code == 400

    # The assignee cannot rewrite the task itself.
    child_task = client.patch(
        f"/tasks/{task['id']}",
        json={"assigned_to_id": child["id"]},
        headers=headers,
    )
    assert child_task.status_code == 200
    forbidden = client.patch(
        f"/tasks/{task['id']}",
        json={"title": "Не моё"},
        headers=auth_headers(child["access_token"]),
    )
    assert forbidden.status_code == 403


def test_expense_crud(client, register, auth_headers):
    parent, child, headers = make_family(client, register, auth_headers)
    expense = client.post(
        "/expenses",
        json={
            "title": "Продукты",
            "amount": 100.0,
            "category": "Продукты",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=headers,
    ).json()

    response = client.patch(
        f"/expenses/{expense['id']}",
        json={"amount": 150.0, "title": "Продукты и быт"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["amount"] == 150.0

    # A child cannot modify or delete a parent's expense.
    child_edit = client.patch(
        f"/expenses/{expense['id']}",
        json={"amount": 1.0},
        headers=auth_headers(child["access_token"]),
    )
    assert child_edit.status_code == 403
    child_delete = client.delete(
        f"/expenses/{expense['id']}",
        headers=auth_headers(child["access_token"]),
    )
    assert child_delete.status_code == 403

    assert client.delete(
        f"/expenses/{expense['id']}", headers=headers
    ).status_code == 204
    assert client.delete(
        f"/expenses/{expense['id']}", headers=headers
    ).status_code == 404


def test_missing_resources_return_404(client, register, auth_headers):
    user = register(email="u@example.com")
    headers = auth_headers(user["access_token"])
    assert client.patch("/events/9999", json={"title": "x"}, headers=headers).status_code == 404
    assert client.patch("/tasks/9999", json={"title": "x"}, headers=headers).status_code == 404
    assert client.patch("/expenses/9999", json={"title": "x"}, headers=headers).status_code == 404
