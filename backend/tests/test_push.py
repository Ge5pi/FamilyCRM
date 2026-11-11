"""Expo push subscriptions and notification triggers."""

import main as main_module
import push
from models import PushSubscription

TOKEN_A = "ExponentPushToken[test-device-aaaa]"
TOKEN_B = "ExpoPushToken[test-device-bbbb]"


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


def test_register_list_and_replace_subscription(client, register, auth_headers):
    user = register(email="push@example.com")
    headers = auth_headers(user["access_token"])
    url = f"/users/{user['id']}/push-subscriptions"

    response = client.post(url, json={"token": TOKEN_A, "platform": "ios"}, headers=headers)
    assert response.status_code == 201, response.text
    assert response.json()["platform"] == "ios"
    assert response.json()["active"] is True

    listed = client.get(url, headers=headers).json()
    assert len(listed) == 1

    # Re-registering the same token updates the device instead of duplicating it.
    response = client.post(
        url, json={"token": TOKEN_A, "platform": "android"}, headers=headers
    )
    assert response.status_code == 201
    listed = client.get(url, headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["platform"] == "android"


def test_invalid_push_token_is_rejected(client, register, auth_headers):
    user = register(email="push2@example.com")
    response = client.post(
        f"/users/{user['id']}/push-subscriptions",
        json={"token": "not-an-expo-token", "platform": "ios"},
        headers=auth_headers(user["access_token"]),
    )
    assert response.status_code == 422


def test_cannot_manage_someone_elses_subscriptions(client, register, auth_headers):
    parent, child, parent_headers, _ = make_family(client, register, auth_headers)
    response = client.post(
        f"/users/{child['id']}/push-subscriptions",
        json={"token": TOKEN_A, "platform": "ios"},
        headers=parent_headers,
    )
    assert response.status_code == 403


def test_delete_single_and_all_subscriptions(client, register, auth_headers):
    user = register(email="push3@example.com")
    headers = auth_headers(user["access_token"])
    url = f"/users/{user['id']}/push-subscriptions"

    client.post(url, json={"token": TOKEN_A, "platform": "ios"}, headers=headers)
    client.post(url, json={"token": TOKEN_B, "platform": "android"}, headers=headers)
    assert len(client.get(url, headers=headers).json()) == 2

    assert client.delete(
        url, params={"token": TOKEN_A}, headers=headers
    ).status_code == 204
    remaining = client.get(url, headers=headers).json()
    assert len(remaining) == 1
    assert remaining[0]["platform"] == "android"

    assert client.delete(url, headers=headers).status_code == 204
    assert client.get(url, headers=headers).json() == []


def test_token_moves_to_the_account_that_registers_it(client, register, auth_headers):
    first = register(email="first@example.com", create_family_name="Первые")
    second = register(email="second@example.com", create_family_name="Вторые")

    client.post(
        f"/users/{first['id']}/push-subscriptions",
        json={"token": TOKEN_A, "platform": "ios"},
        headers=auth_headers(first["access_token"]),
    )
    client.post(
        f"/users/{second['id']}/push-subscriptions",
        json={"token": TOKEN_A, "platform": "ios"},
        headers=auth_headers(second["access_token"]),
    )

    assert client.get(
        f"/users/{first['id']}/push-subscriptions",
        headers=auth_headers(first["access_token"]),
    ).json() == []
    assert len(
        client.get(
            f"/users/{second['id']}/push-subscriptions",
            headers=auth_headers(second["access_token"]),
        ).json()
    ) == 1


def test_task_assignment_triggers_push(client, register, auth_headers, monkeypatch):
    parent, child, parent_headers, _ = make_family(client, register, auth_headers)
    calls = []
    monkeypatch.setattr(
        main_module, "send_push_to_users", lambda *args, **kwargs: calls.append(args)
    )

    response = client.post(
        "/tasks",
        json={
            "title": "Помыть посуду",
            "reward_coins": 10,
            "status": "TODO",
            "assigned_to_id": child["id"],
            "created_by_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=parent_headers,
    )
    assert response.status_code == 201

    assert calls, "push notification was not scheduled"
    user_ids, title, body, data = calls[-1]
    assert user_ids == [child["id"]]
    assert title == "Новая задача"
    assert "Помыть посуду" in body
    assert data["screen"] == "tasks"


def test_task_completion_notifies_creator(client, register, auth_headers, monkeypatch):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    task = client.post(
        "/tasks",
        json={
            "title": "Убрать комнату",
            "reward_coins": 15,
            "status": "TODO",
            "assigned_to_id": child["id"],
            "created_by_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=parent_headers,
    ).json()

    calls = []
    monkeypatch.setattr(
        main_module, "send_push_to_users", lambda *args, **kwargs: calls.append(args)
    )

    response = client.put(
        f"/tasks/{task['id']}/status",
        json={"status": "DONE"},
        headers=child_headers,
    )
    assert response.status_code == 200

    assert calls
    user_ids, title, body, _ = calls[-1]
    assert user_ids == [parent["id"]]
    assert title == "Задача выполнена"
    assert "Убрать комнату" in body


def test_event_for_another_member_triggers_push(
    client, register, auth_headers, monkeypatch
):
    parent, child, parent_headers, _ = make_family(client, register, auth_headers)
    calls = []
    monkeypatch.setattr(
        main_module, "send_push_to_users", lambda *args, **kwargs: calls.append(args)
    )

    response = client.post(
        "/events",
        json={
            "title": "Секция",
            "start_time": "2026-07-03T09:00:00Z",
            "end_time": "2026-07-03T10:00:00Z",
            "user_id": child["id"],
            "family_id": parent["family_id"],
        },
        headers=parent_headers,
    )
    assert response.status_code == 201

    assert calls
    user_ids, title, _, data = calls[-1]
    assert user_ids == [child["id"]]
    assert title == "Новое событие в календаре"
    assert data["screen"] == "calendar"


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"data": [{"status": "error", "details": {"error": "DeviceNotRegistered"}}]}


def test_unregistered_device_is_deactivated(
    client, register, db_session, monkeypatch
):
    user = register(email="push4@example.com")
    subscription = PushSubscription(
        user_id=user["id"], token=TOKEN_A, platform="ios", active=True
    )
    db_session.add(subscription)
    db_session.commit()

    monkeypatch.setattr(push.settings, "push_enabled", True)
    monkeypatch.setattr(push.httpx, "post", lambda *args, **kwargs: FakeResponse())

    sent = push.send_push_to_users([user["id"]], "Заголовок", "Текст", db=db_session)
    assert sent == 1

    db_session.expire_all()
    refreshed = db_session.query(PushSubscription).filter_by(token=TOKEN_A).one()
    assert refreshed.active is False


def test_push_is_disabled_by_default_in_tests():
    assert push.settings.push_enabled is False
