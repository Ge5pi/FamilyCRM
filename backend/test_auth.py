from fastapi.testclient import TestClient
from main import app
import json

client = TestClient(app)

def test_auth_and_scheduling():
    print("--- Running Authentication & Scheduling Tests ---")

    # 1. Register User A (Parent)
    resp = client.post("/auth/register", json={
        "email": "mom@family.com",
        "password": "securepassword",
        "name": "Ольга (Мама)",
        "role": "Parent"
    })
    assert resp.status_code == 201
    user_a = resp.json()
    print(f"Registered User A: {user_a['name']} ({user_a['email']})")

    # 2. Login User A
    resp = client.post("/auth/login", json={
        "email": "mom@family.com",
        "password": "securepassword"
    })
    assert resp.status_code == 200
    logged_in = resp.json()
    assert logged_in["id"] == user_a["id"]
    print("Logged in User A successfully")

    # 3. Create a Family for User A
    resp = client.post("/families", json={"name": "Ивановы"})
    assert resp.status_code == 201
    family = resp.json()
    family_id = family["id"]
    print(f"Created Family with ID {family_id}")

    # Set user family
    # (Usually user is added to family, let's join A to this family)
    resp = client.post(f"/users/{user_a['id']}/join", json={"join_code": family["join_code"]})
    assert resp.status_code == 200
    print("User A joined the Family")

    # 4. Register User B (Child, not in family yet)
    resp = client.post("/auth/register", json={
        "email": "danya@family.com",
        "password": "childpassword",
        "name": "Даня (Сын)",
        "role": "Child"
    })
    assert resp.status_code == 201
    user_b = resp.json()
    print(f"Registered User B: {user_b['name']} ({user_b['email']})")

    # 5. Invite User B to Family by email
    resp = client.post(f"/families/{family_id}/invite", json={"email": "danya@family.com"})
    assert resp.status_code == 200
    user_b_updated = resp.json()
    assert user_b_updated["family_id"] == family_id
    print(f"Successfully invited {user_b['name']} to family using email!")

    # 6. Test Calendar - Recurring daily events slot checks
    # Add recurring school event from 09:00 to 14:00 for User B
    resp = client.post("/events", json={
        "title": "Школа (Каждый день)",
        "start_time": "2026-07-03T09:00:00",
        "end_time": "2026-07-03T14:00:00",
        "category": "School",
        "is_recurring": True,
        "user_id": user_b["id"],
        "family_id": family_id
    })
    assert resp.status_code == 201
    print("Added daily recurring event: 09:00 - 14:00")

    # Try adding overlapping event (even on another day, e.g., July 4th)
    # Since it's recurring daily, it should conflict with 09:00 - 14:00 slot!
    resp = client.post("/events", json={
        "title": "Кружок робототехники (нахлест)",
        "start_time": "2026-07-04T10:00:00",
        "end_time": "2026-07-04T11:00:00",
        "category": "Routine",
        "is_recurring": False,
        "user_id": user_b["id"],
        "family_id": family_id
    })
    # Must return 400 because of daily recurrence overlap check
    assert resp.status_code == 400
    print("Recurrence overlap protection check verified successfully (rejected conflicting hour slot on another day)!")

    # 7. Get individual user events list
    resp = client.get(f"/users/{user_b['id']}/events")
    assert resp.status_code == 200
    user_events = resp.json()
    assert len(user_events) == 1
    assert user_events[0]["title"] == "Школа (Каждый день)"
    print("Individual calendar retrieval verified successfully!")

    print("\n--- ALL AUTH AND CALENDAR TESTS COMPLETED ---")

if __name__ == "__main__":
    test_auth_and_scheduling()
