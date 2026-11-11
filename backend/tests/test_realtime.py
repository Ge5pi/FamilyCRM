"""WebSocket live updates."""

import threading

import pytest
from starlette.websockets import WebSocketDisconnect


def test_websocket_rejects_invalid_token(client, register):
    user = register(email="ws@example.com", create_family_name="Семья")
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            f"/ws/families/{user['family_id']}?token=invalid"
        ) as websocket:
            websocket.receive_text()
    assert excinfo.value.code == 4401


def test_websocket_rejects_other_family(client, register):
    user = register(email="ws1@example.com", create_family_name="Семья")
    stranger = register(email="ws2@example.com", create_family_name="Чужие")

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            f"/ws/families/{stranger['family_id']}?token={user['access_token']}"
        ) as websocket:
            websocket.receive_text()
    assert excinfo.value.code == 4403


def test_websocket_receives_task_updates(client, register, auth_headers):
    user = register(email="ws3@example.com", create_family_name="Семья")
    headers = auth_headers(user["access_token"])

    with client.websocket_connect(
        f"/ws/families/{user['family_id']}?token={user['access_token']}"
    ) as websocket:
        worker = threading.Thread(
            target=lambda: client.post(
                "/tasks",
                json={
                    "title": "Помыть посуду",
                    "reward_coins": 5,
                    "status": "TODO",
                    "created_by_id": user["id"],
                    "family_id": user["family_id"],
                },
                headers=headers,
            )
        )
        worker.start()
        worker.join(timeout=10)

        message = websocket.receive_json()

    assert message["type"] == "tasks"
