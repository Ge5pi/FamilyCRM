"""Family budgets and expense filters."""

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


def add_expense(client, headers, user_id, family_id, title, amount, category, date=None):
    expense = client.post(
        "/expenses",
        json={
            "title": title,
            "amount": amount,
            "category": category,
            "user_id": user_id,
            "family_id": family_id,
        },
        headers=headers,
    ).json()
    if date is not None:
        response = client.patch(
            f"/expenses/{expense['id']}", json={"date": date}, headers=headers
        )
        assert response.status_code == 200, response.text
        return response.json()
    return expense


def test_parent_sets_and_lists_budget(client, register, auth_headers):
    parent, _, parent_headers, _ = make_family(client, register, auth_headers)
    family_id = parent["family_id"]

    response = client.put(
        f"/families/{family_id}/budgets/Продукты",
        json={"monthly_limit": 5000},
        headers=parent_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["category"] == "Продукты"
    assert response.json()["monthly_limit"] == 5000

    budgets = client.get(
        f"/families/{family_id}/budgets", headers=parent_headers
    ).json()
    assert [(b["category"], b["monthly_limit"]) for b in budgets] == [
        ("Продукты", 5000)
    ]


def test_child_cannot_manage_budgets(client, register, auth_headers):
    parent, _, parent_headers, child_headers = make_family(
        client, register, auth_headers
    )
    family_id = parent["family_id"]

    response = client.put(
        f"/families/{family_id}/budgets/Продукты",
        json={"monthly_limit": 100},
        headers=child_headers,
    )
    assert response.status_code == 403

    # Children may still read the budgets.
    assert client.get(
        f"/families/{family_id}/budgets", headers=child_headers
    ).status_code == 200


def test_budget_is_updated_not_duplicated_and_deleted(client, register, auth_headers):
    parent, _, parent_headers, _ = make_family(client, register, auth_headers)
    family_id = parent["family_id"]

    client.put(
        f"/families/{family_id}/budgets/Развлечения",
        json={"monthly_limit": 1000},
        headers=parent_headers,
    )
    client.put(
        f"/families/{family_id}/budgets/Развлечения",
        json={"monthly_limit": 2500},
        headers=parent_headers,
    )
    budgets = client.get(
        f"/families/{family_id}/budgets", headers=parent_headers
    ).json()
    assert len(budgets) == 1
    assert budgets[0]["monthly_limit"] == 2500

    assert client.delete(
        f"/families/{family_id}/budgets/Развлечения", headers=parent_headers
    ).status_code == 204
    assert client.get(
        f"/families/{family_id}/budgets", headers=parent_headers
    ).json() == []
    assert client.delete(
        f"/families/{family_id}/budgets/Развлечения", headers=parent_headers
    ).status_code == 404


def test_expenses_can_be_filtered_by_date_and_category(client, register, auth_headers):
    parent, _, headers, _ = make_family(client, register, auth_headers)
    family_id = parent["family_id"]

    add_expense(
        client, headers, parent["id"], family_id, "Хлеб", 50, "Продукты",
        date="2026-07-05T10:00:00Z",
    )
    add_expense(
        client, headers, parent["id"], family_id, "Кино", 800, "Развлечения",
        date="2026-07-10T18:00:00Z",
    )
    add_expense(
        client, headers, parent["id"], family_id, "Молоко", 120, "Продукты",
        date="2026-08-02T09:00:00Z",
    )

    july = client.get(
        f"/families/{family_id}/expenses",
        params={
            "date_from": "2026-07-01T00:00:00Z",
            "date_to": "2026-07-31T23:59:59Z",
        },
        headers=headers,
    ).json()
    assert {e["title"] for e in july} == {"Хлеб", "Кино"}

    food = client.get(
        f"/families/{family_id}/expenses",
        params={"category": "Продукты"},
        headers=headers,
    ).json()
    assert {e["title"] for e in food} == {"Хлеб", "Молоко"}

    july_food = client.get(
        f"/families/{family_id}/expenses",
        params={
            "date_from": "2026-07-01T00:00:00Z",
            "date_to": "2026-07-31T23:59:59Z",
            "category": "Продукты",
        },
        headers=headers,
    ).json()
    assert [e["title"] for e in july_food] == ["Хлеб"]


def test_expense_summary_respects_period(client, register, auth_headers):
    parent, _, headers, _ = make_family(client, register, auth_headers)
    family_id = parent["family_id"]

    add_expense(
        client, headers, parent["id"], family_id, "Хлеб", 50, "Продукты",
        date="2026-07-05T10:00:00Z",
    )
    add_expense(
        client, headers, parent["id"], family_id, "Молоко", 120, "Продукты",
        date="2026-08-02T09:00:00Z",
    )

    summary = client.get(
        f"/families/{family_id}/expenses/summary",
        params={
            "date_from": "2026-07-01T00:00:00Z",
            "date_to": "2026-07-31T23:59:59Z",
        },
        headers=headers,
    ).json()
    assert summary == {"Продукты": 50.0}


def test_expense_filter_validation(client, register, auth_headers):
    parent, _, headers, _ = make_family(client, register, auth_headers)
    response = client.get(
        f"/families/{parent['family_id']}/expenses",
        params={"date_from": "not-a-date"},
        headers=headers,
    )
    assert response.status_code == 422
