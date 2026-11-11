"""Geofences and location enter/exit alerts."""

import main as main_module
from geofence import distance_m, is_inside

FENCE = {
    "name": "Школа",
    "latitude": 55.0,
    "longitude": 37.0,
    "radius_m": 150,
    "notify_enter": True,
    "notify_exit": True,
}


def make_family(client, register, auth_headers):
    parent = register(email="parent@example.com", name="Родитель", create_family_name="Семья")
    parent_headers = auth_headers(parent["access_token"])
    overview = client.get(
        f"/families/{parent['family_id']}/overview", headers=parent_headers
    ).json()
    child = register(
        email="child@example.com",
        name="Ребёнок",
        role="Child",
        join_code=overview["join_code"],
    )
    return parent, child, parent_headers, auth_headers(child["access_token"])


def move(client, user_id, headers, latitude, longitude):
    return client.put(
        f"/users/{user_id}/location",
        json={"latitude": latitude, "longitude": longitude},
        headers=headers,
    )


def create_fence(client, family_id, headers, **overrides):
    payload = {**FENCE, **overrides}
    return client.post(
        f"/families/{family_id}/geofences", json=payload, headers=headers
    )


def test_geometry_helpers():
    assert distance_m(55.0, 37.0, 55.0, 37.0) == 0
    # 0.001 degrees of latitude is roughly 111 metres.
    assert 100 < distance_m(55.0, 37.0, 55.001, 37.0) < 120
    assert is_inside(55.0, 37.0, 55.0, 37.0, 150)
    assert not is_inside(55.01, 37.0, 55.0, 37.0, 150)


def test_geofence_crud_and_permissions(client, register, auth_headers):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]

    response = create_fence(client, family_id, parent_headers)
    assert response.status_code == 201, response.text
    fence = response.json()
    assert fence["name"] == "Школа"
    assert fence["radius_m"] == 150

    assert len(
        client.get(f"/families/{family_id}/geofences", headers=child_headers).json()
    ) == 1

    # Children can read but not manage geofences.
    assert create_fence(client, family_id, child_headers, name="Дом").status_code == 403
    assert client.patch(
        f"/geofences/{fence['id']}", json={"radius_m": 200}, headers=child_headers
    ).status_code == 403
    assert client.delete(
        f"/geofences/{fence['id']}", headers=child_headers
    ).status_code == 403

    # Duplicate names and tiny radii are rejected.
    assert create_fence(client, family_id, parent_headers).status_code == 400
    assert create_fence(
        client, family_id, parent_headers, name="Точка", radius_m=5
    ).status_code == 422

    updated = client.patch(
        f"/geofences/{fence['id']}",
        json={"radius_m": 300, "notify_exit": False},
        headers=parent_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["radius_m"] == 300
    assert updated.json()["notify_exit"] is False

    assert client.delete(
        f"/geofences/{fence['id']}", headers=parent_headers
    ).status_code == 204
    assert client.delete(
        f"/geofences/{fence['id']}", headers=parent_headers
    ).status_code == 404


def test_enter_and_exit_alerts(client, register, auth_headers):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]
    create_fence(client, family_id, parent_headers)

    # First fix only stores the position.
    assert move(client, child["id"], child_headers, 55.01, 37.0).status_code == 200
    alerts = client.get(
        f"/families/{family_id}/location-alerts", headers=parent_headers
    ).json()
    assert alerts == []

    # Outside -> inside.
    move(client, child["id"], child_headers, 55.0, 37.0)
    alerts = client.get(
        f"/families/{family_id}/location-alerts", headers=parent_headers
    ).json()
    assert len(alerts) == 1
    assert alerts[0]["type"] == "enter"
    assert alerts[0]["geofence_name"] == "Школа"
    assert alerts[0]["user_name"] == "Ребёнок"

    # Staying inside does not duplicate the alert.
    move(client, child["id"], child_headers, 55.0001, 37.0)
    assert len(
        client.get(
            f"/families/{family_id}/location-alerts", headers=parent_headers
        ).json()
    ) == 1

    # Inside -> outside.
    move(client, child["id"], child_headers, 55.02, 37.0)
    alerts = client.get(
        f"/families/{family_id}/location-alerts", headers=parent_headers
    ).json()
    assert len(alerts) == 2
    assert alerts[0]["type"] == "exit"


def test_notify_flags_disable_alerts(client, register, auth_headers):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]
    create_fence(client, family_id, parent_headers, notify_enter=False)

    # First fix inside, then leave: enter is muted, exit is reported.
    move(client, child["id"], child_headers, 55.0, 37.0)
    move(client, child["id"], child_headers, 55.02, 37.0)

    alerts = client.get(
        f"/families/{family_id}/location-alerts", headers=parent_headers
    ).json()
    assert len(alerts) == 1
    assert alerts[0]["type"] == "exit"


def test_enter_alert_sends_push_to_parents(
    client, register, auth_headers, monkeypatch
):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]
    create_fence(client, family_id, parent_headers)

    calls = []
    monkeypatch.setattr(
        main_module, "send_push_to_users", lambda *args, **kwargs: calls.append(args)
    )

    move(client, child["id"], child_headers, 55.01, 37.0)
    move(client, child["id"], child_headers, 55.0, 37.0)

    assert calls
    user_ids, title, body, data = calls[-1]
    assert user_ids == [parent["id"]]
    assert title == "Геозона"
    assert "вошёл" in body and "Школа" in body
    assert data["screen"] == "locator"


def test_alerts_are_hidden_from_other_families(client, register, auth_headers):
    parent, child, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]
    create_fence(client, family_id, parent_headers)
    move(client, child["id"], child_headers, 55.01, 37.0)
    move(client, child["id"], child_headers, 55.0, 37.0)

    stranger = register(email="stranger@example.com", create_family_name="Чужие")
    stranger_headers = auth_headers(stranger["access_token"])

    assert client.get(
        f"/families/{family_id}/location-alerts", headers=stranger_headers
    ).status_code == 403
    assert client.get(
        f"/families/{family_id}/geofences", headers=stranger_headers
    ).status_code == 403
