def _create_event(client, headers, *, title, start, end, user_id, family_id, recurring=False):
    return client.post(
        "/events",
        json={
            "title": title,
            "description": "",
            "start_time": start,
            "end_time": end,
            "category": "School",
            "is_recurring": recurring,
            "user_id": user_id,
            "family_id": family_id,
        },
        headers=headers,
    )


def test_full_family_flow(client, register, auth_headers):
    parent = register(
        email="mom@example.com", name="Ольга", create_family_name="Ивановы"
    )
    parent_headers = auth_headers(parent["access_token"])

    overview = client.get(
        f"/families/{parent['family_id']}/overview", headers=parent_headers
    ).json()

    child = register(
        email="child@example.com",
        name="Даня",
        role="Child",
        join_code=overview["join_code"],
    )
    child_headers = auth_headers(child["access_token"])
    assert child["family_id"] == parent["family_id"]

    overview = client.get(
        f"/families/{parent['family_id']}/overview", headers=parent_headers
    ).json()
    assert len(overview["users"]) == 2

    # --- Calendar ---------------------------------------------------------
    response = _create_event(
        client,
        parent_headers,
        title="Школа",
        start="2026-07-03T08:30:00",
        end="2026-07-03T14:00:00",
        user_id=child["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201

    response = _create_event(
        client,
        child_headers,
        title="Репетитор (внахлёст)",
        start="2026-07-03T12:00:00",
        end="2026-07-03T13:00:00",
        user_id=child["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 400
    assert "пересекается" in response.json()["detail"]

    response = _create_event(
        client,
        child_headers,
        title="Репетитор",
        start="2026-07-03T15:00:00",
        end="2026-07-03T16:30:00",
        user_id=child["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201

    response = client.get(
        f"/users/{child['id']}/events", headers=parent_headers
    )
    assert response.status_code == 200
    assert len(response.json()) == 2

    # --- Kanban and coins -------------------------------------------------
    response = client.post(
        "/tasks",
        json={
            "title": "Помыть посуду",
            "description": "",
            "reward_coins": 15,
            "status": "TODO",
            "assigned_to_id": child["id"],
            "created_by_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=parent_headers,
    )
    assert response.status_code == 201
    task = response.json()

    response = client.put(
        f"/tasks/{task['id']}/status",
        json={"status": "IN_PROGRESS"},
        headers=child_headers,
    )
    assert response.status_code == 200

    response = client.put(
        f"/tasks/{task['id']}/status",
        json={"status": "DONE"},
        headers=child_headers,
    )
    assert response.status_code == 200

    response = client.get("/auth/me", headers=child_headers)
    assert response.json()["coins"] == 15

    # Moving a done task back revokes the reward.
    response = client.put(
        f"/tasks/{task['id']}/status",
        json={"status": "TODO"},
        headers=child_headers,
    )
    assert response.status_code == 200
    response = client.get("/auth/me", headers=child_headers)
    assert response.json()["coins"] == 0

    # --- Expenses ---------------------------------------------------------
    for title, amount, category in [
        ("Продукты Ашан", 1250.0, "Продукты"),
        ("Билеты в театр", 3000.0, "Развлечения"),
        ("Хлеб", 50.0, "Продукты"),
    ]:
        response = client.post(
            "/expenses",
            json={
                "title": title,
                "amount": amount,
                "category": category,
                "user_id": parent["id"],
                "family_id": parent["family_id"],
            },
            headers=parent_headers,
        )
        assert response.status_code == 201

    summary = client.get(
        f"/families/{parent['family_id']}/expenses/summary", headers=parent_headers
    ).json()
    assert summary["Продукты"] == 1300.0
    assert summary["Развлечения"] == 3000.0

    # --- Locator ----------------------------------------------------------
    response = client.put(
        f"/users/{child['id']}/location",
        json={"latitude": 55.7558, "longitude": 37.6173},
        headers=child_headers,
    )
    assert response.status_code == 200
    assert response.json()["latitude"] == 55.7558

    # --- Deletion rules ---------------------------------------------------
    parent_event = _create_event(
        client,
        parent_headers,
        title="Ужин семьи",
        start="2026-07-03T19:00:00",
        end="2026-07-03T20:00:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    ).json()

    response = client.delete(f"/events/{parent_event['id']}", headers=child_headers)
    assert response.status_code == 403

    response = client.delete(f"/events/{parent_event['id']}", headers=parent_headers)
    assert response.status_code == 204


def test_event_time_validation(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])
    response = _create_event(
        client,
        headers,
        title="Неправильный интервал",
        start="2026-07-03T15:00:00",
        end="2026-07-03T14:00:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 422


def test_negative_reward_is_rejected(client, register, auth_headers):
    parent = register(email="p2@example.com", create_family_name="Семья")
    response = client.post(
        "/tasks",
        json={
            "title": "Странная задача",
            "reward_coins": -5,
            "status": "TODO",
            "created_by_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 422
