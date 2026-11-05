"""Timezone handling: the API speaks UTC, storage is naive UTC."""

from datetime import datetime, timezone


def parse_api_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_offset_aware_input_is_normalised_to_utc(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = client.post(
        "/events",
        json={
            "title": "Утро",
            # 13:00 in Almaty (UTC+5) == 08:00 UTC
            "start_time": "2026-07-03T13:00:00+05:00",
            "end_time": "2026-07-03T14:00:00+05:00",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=auth_headers(parent["access_token"]),
    )
    assert response.status_code == 201
    body = response.json()
    start = parse_api_datetime(body["start_time"])
    assert start == datetime(2026, 7, 3, 8, 0, tzinfo=timezone.utc)
    assert start.tzinfo is not None


def test_naive_input_is_treated_as_utc(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    response = client.post(
        "/events",
        json={
            "title": "Наивное",
            "start_time": "2026-07-03T09:00:00",
            "end_time": "2026-07-03T10:00:00",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=auth_headers(parent["access_token"]),
    )
    body = response.json()
    assert parse_api_datetime(body["start_time"]) == datetime(
        2026, 7, 3, 9, 0, tzinfo=timezone.utc
    )


def test_overlap_detection_compares_absolute_time(client, register, auth_headers):
    parent = register(email="p@example.com", create_family_name="Семья")
    headers = auth_headers(parent["access_token"])

    first = client.post(
        "/events",
        json={
            "title": "UTC",
            "start_time": "2026-07-03T09:00:00Z",
            "end_time": "2026-07-03T10:00:00Z",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=headers,
    )
    assert first.status_code == 201

    # 14:00+05:00 is exactly 09:00 UTC -> conflict.
    second = client.post(
        "/events",
        json={
            "title": "Алматы",
            "start_time": "2026-07-03T14:00:00+05:00",
            "end_time": "2026-07-03T15:00:00+05:00",
            "user_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=headers,
    )
    assert second.status_code == 400
