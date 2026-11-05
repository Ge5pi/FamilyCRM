"""Shop purchases, the virtual room and the coin ledger."""


def setup_family_with_child(client, register, auth_headers):
    parent = register(email="parent@example.com", create_family_name="Семья")
    overview = client.get(
        f"/families/{parent['family_id']}/overview",
        headers=auth_headers(parent["access_token"]),
    ).json()
    child = register(
        email="child@example.com",
        name="Даня",
        role="Child",
        join_code=overview["join_code"],
    )
    return parent, child


def earn_coins(client, parent, child, auth_headers, amount=15):
    task = client.post(
        "/tasks",
        json={
            "title": "Помыть посуду",
            "reward_coins": amount,
            "status": "TODO",
            "assigned_to_id": child["id"],
            "created_by_id": parent["id"],
            "family_id": parent["family_id"],
        },
        headers=auth_headers(parent["access_token"]),
    ).json()
    response = client.put(
        f"/tasks/{task['id']}/status",
        json={"status": "DONE"},
        headers=auth_headers(child["access_token"]),
    )
    assert response.status_code == 200
    return task


def test_shop_items_are_served_by_backend(client, register, auth_headers):
    user = register(email="u@example.com")
    response = client.get(
        "/shop/items", headers=auth_headers(user["access_token"])
    )
    assert response.status_code == 200
    items = response.json()
    assert len(items) >= 5
    assert {"key", "name", "price", "emoji"} <= set(items[0].keys())
    assert all(item["price"] > 0 for item in items)


def test_purchase_updates_balance_room_and_ledger(client, register, auth_headers):
    parent, child = setup_family_with_child(client, register, auth_headers)
    earn_coins(client, parent, child, auth_headers, amount=15)

    child_headers = auth_headers(child["access_token"])

    room = client.get(f"/users/{child['id']}/room", headers=child_headers).json()
    assert room["coins"] == 15
    assert room["purchases"] == []

    # Buy the 15-coin lamp.
    response = client.post(
        "/shop/purchases", json={"item_key": "lamp"}, headers=child_headers
    )
    assert response.status_code == 201, response.text
    purchase = response.json()
    assert purchase["price"] == 15

    room = client.get(f"/users/{child['id']}/room", headers=child_headers).json()
    assert room["coins"] == 0
    assert [p["item_key"] for p in room["purchases"]] == ["lamp"]

    # Buying the same item twice is rejected.
    duplicate = client.post(
        "/shop/purchases", json={"item_key": "lamp"}, headers=child_headers
    )
    assert duplicate.status_code == 400

    history = client.get(
        f"/users/{child['id']}/coins", headers=child_headers
    ).json()
    assert history["coins"] == 0
    assert [t["reason"] for t in history["transactions"]] == [
        "purchase",
        "task_done",
    ]
    assert history["transactions"][0]["amount"] == -15
    assert history["transactions"][0]["balance_after"] == 0
    assert history["transactions"][1]["amount"] == 15
    assert sum(t["amount"] for t in history["transactions"]) == history["coins"]


def test_purchase_rejected_without_enough_coins(client, register, auth_headers):
    parent, child = setup_family_with_child(client, register, auth_headers)
    response = client.post(
        "/shop/purchases",
        json={"item_key": "pc"},
        headers=auth_headers(child["access_token"]),
    )
    assert response.status_code == 400
    assert "Недостаточно" in response.json()["detail"]


def test_unknown_item_returns_404(client, register, auth_headers):
    user = register(email="u@example.com")
    response = client.post(
        "/shop/purchases",
        json={"item_key": "spaceship"},
        headers=auth_headers(user["access_token"]),
    )
    assert response.status_code == 404


def test_room_is_hidden_from_other_families(client, register, auth_headers):
    _, child = setup_family_with_child(client, register, auth_headers)
    stranger = register(email="stranger@example.com", create_family_name="Чужие")
    response = client.get(
        f"/users/{child['id']}/room",
        headers=auth_headers(stranger["access_token"]),
    )
    assert response.status_code == 403


def test_coin_history_of_child_is_parent_only(client, register, auth_headers):
    parent, child = setup_family_with_child(client, register, auth_headers)
    other_overview = client.get(
        f"/families/{parent['family_id']}/overview",
        headers=auth_headers(parent["access_token"]),
    ).json()
    sibling = register(
        email="sibling@example.com",
        role="Child",
        join_code=other_overview["join_code"],
    )

    # The parent may inspect the child's ledger.
    assert client.get(
        f"/users/{child['id']}/coins",
        headers=auth_headers(parent["access_token"]),
    ).status_code == 200

    # A sibling cannot.
    assert client.get(
        f"/users/{child['id']}/coins",
        headers=auth_headers(sibling["access_token"]),
    ).status_code == 403


def test_reopening_a_task_revokes_coins_and_writes_ledger(
    client, register, auth_headers
):
    parent, child = setup_family_with_child(client, register, auth_headers)
    task = earn_coins(client, parent, child, auth_headers, amount=20)

    response = client.put(
        f"/tasks/{task['id']}/status",
        json={"status": "TODO"},
        headers=auth_headers(child["access_token"]),
    )
    assert response.status_code == 200

    history = client.get(
        f"/users/{child['id']}/coins",
        headers=auth_headers(child["access_token"]),
    ).json()
    assert history["coins"] == 0
    assert [t["reason"] for t in history["transactions"]] == [
        "task_reopened",
        "task_done",
    ]
