"""Recurring event rules and overlap detection."""


def create_event(client, headers, **overrides):
    payload = {
        "title": "Событие",
        "description": "",
        "start_time": "2026-07-06T09:00:00",
        "end_time": "2026-07-06T10:00:00",
        "category": "School",
        "recurrence": "none",
    }
    payload.update(overrides)
    return client.post("/events", json=payload, headers=headers)


def test_weekly_recurrence_conflicts_on_same_weekday(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])
    family_id = parent["family_id"]

    response = create_event(
        client,
        headers,
        title="Кружок",
        recurrence="weekly",
        start_time="2026-07-06T09:00:00",  # Monday
        end_time="2026-07-06T10:00:00",
        user_id=parent["id"],
        family_id=family_id,
    )
    assert response.status_code == 201
    assert response.json()["recurrence"] == "weekly"
    assert response.json()["recurrence_day"] == 0  # Monday

    # Next Monday, overlapping time -> conflict.
    conflict = create_event(
        client,
        headers,
        title="Другое",
        start_time="2026-07-13T09:30:00",
        end_time="2026-07-13T10:30:00",
        user_id=parent["id"],
        family_id=family_id,
    )
    assert conflict.status_code == 400

    # Next Tuesday, same time -> no conflict.
    ok = create_event(
        client,
        headers,
        title="Вторник",
        start_time="2026-07-07T09:30:00",
        end_time="2026-07-07T10:30:00",
        user_id=parent["id"],
        family_id=family_id,
    )
    assert ok.status_code == 201


def test_daily_recurrence_conflicts_on_any_day(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])

    response = create_event(
        client,
        headers,
        title="Зарядка",
        recurrence="daily",
        start_time="2026-07-06T07:00:00",
        end_time="2026-07-06T07:30:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201

    conflict = create_event(
        client,
        headers,
        title="Позже",
        start_time="2026-08-19T07:10:00",
        end_time="2026-08-19T07:20:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert conflict.status_code == 400


def test_monthly_recurrence_conflicts_on_same_day(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])

    response = create_event(
        client,
        headers,
        title="Оплата",
        recurrence="monthly",
        start_time="2026-07-15T10:00:00",
        end_time="2026-07-15T11:00:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201
    assert response.json()["recurrence_day"] == 15

    conflict = create_event(
        client,
        headers,
        title="Следующий месяц",
        start_time="2026-08-15T10:30:00",
        end_time="2026-08-15T11:30:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert conflict.status_code == 400

    ok = create_event(
        client,
        headers,
        title="Другой день",
        start_time="2026-08-16T10:30:00",
        end_time="2026-08-16T11:30:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert ok.status_code == 201


def test_legacy_is_recurring_flag_maps_to_daily(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = create_event(
        client,
        auth_headers(parent["access_token"]),
        is_recurring=True,
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201
    body = response.json()
    assert body["recurrence"] == "daily"
    assert body["is_recurring"] is True


def test_weekly_recurrence_day_must_be_valid(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = create_event(
        client,
        auth_headers(parent["access_token"]),
        recurrence="weekly",
        recurrence_day=9,
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 422


def test_update_event_to_recurring(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])
    event = create_event(
        client,
        headers,
        user_id=parent["id"],
        family_id=parent["family_id"],
    ).json()

    response = client.patch(
        f"/events/{event['id']}",
        json={"recurrence": "weekly", "title": "Обновлено"},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Обновлено"
    assert body["recurrence"] == "weekly"
    assert body["recurrence_day"] == 0  # 2026-07-06 is a Monday


def test_update_event_rejects_overlap(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])
    family_id = parent["family_id"]

    create_event(
        client,
        headers,
        title="Первое",
        start_time="2026-07-06T09:00:00",
        end_time="2026-07-06T10:00:00",
        user_id=parent["id"],
        family_id=family_id,
    )
    second = create_event(
        client,
        headers,
        title="Второе",
        start_time="2026-07-06T11:00:00",
        end_time="2026-07-06T12:00:00",
        user_id=parent["id"],
        family_id=family_id,
    ).json()

    response = client.patch(
        f"/events/{second['id']}",
        json={"start_time": "2026-07-06T09:30:00", "end_time": "2026-07-06T09:45:00"},
        headers=headers,
    )
    assert response.status_code == 400


def test_recurrence_until_stops_conflicts(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])

    response = create_event(
        client,
        headers,
        title="Кружок до конца июля",
        recurrence="weekly",
        recurrence_until="2026-07-20",
        start_time="2026-07-06T09:00:00",
        end_time="2026-07-06T10:00:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201, response.text
    assert response.json()["recurrence_until"] == "2026-07-20"

    # Still inside the series -> conflict.
    inside = create_event(
        client,
        headers,
        title="Внутри серии",
        start_time="2026-07-13T09:30:00",
        end_time="2026-07-13T10:30:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert inside.status_code == 400

    # After the series ended -> allowed.
    after = create_event(
        client,
        headers,
        title="После серии",
        start_time="2026-07-27T09:30:00",
        end_time="2026-07-27T10:30:00",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert after.status_code == 201


def test_recurrence_until_cannot_precede_start(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = create_event(
        client,
        auth_headers(parent["access_token"]),
        recurrence="weekly",
        recurrence_until="2026-07-01",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 422


def test_one_off_event_ignores_recurrence_until(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = create_event(
        client,
        auth_headers(parent["access_token"]),
        recurrence="none",
        recurrence_until="2026-08-01",
        user_id=parent["id"],
        family_id=parent["family_id"],
    )
    assert response.status_code == 201
    assert response.json()["recurrence_until"] is None
