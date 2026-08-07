from fastapi.testclient import TestClient
from main import app
import json

client = TestClient(app)

def test_flow():
    print("--- Testing API Flow ---")
    
    # 1. Create a Family group
    resp = client.post("/families", json={"name": "Ивановы"})
    assert resp.status_code == 201
    family = resp.json()
    family_id = family["id"]
    join_code = family["join_code"]
    print(f"Created Family: {family['name']} with ID: {family_id}, Join Code: {join_code}")

    # 2. Create parent and child users
    resp = client.post("/users", json={"name": "Ольга", "role": "Parent", "family_id": family_id})
    assert resp.status_code == 201
    parent = resp.json()
    print(f"Created Parent: {parent['name']} (ID: {parent['id']})")

    resp = client.post("/users", json={"name": "Даня", "role": "Child", "family_id": family_id})
    assert resp.status_code == 201
    child = resp.json()
    print(f"Created Child: {child['name']} (ID: {child['id']})")

    # 3. Add location update
    resp = client.put(f"/users/{child['id']}/location", json={"latitude": 55.7558, "longitude": 37.6173})
    assert resp.status_code == 200
    updated_child = resp.json()
    print(f"Updated location for child: Lat={updated_child['latitude']}, Lng={updated_child['longitude']}")

    # 4. Create calendar events
    # Event 1
    resp = client.post("/events", json={
        "title": "Школа",
        "start_time": "2026-07-03T08:30:00",
        "end_time": "2026-07-03T14:00:00",
        "category": "School",
        "user_id": child["id"],
        "family_id": family_id
    })
    assert resp.status_code == 201
    print("Created first calendar event 'Школа' successfully")

    # Event 2 - overlapping with Event 1 (should fail)
    resp = client.post("/events", json={
        "title": "Репетитор по математике (внахлест)",
        "start_time": "2026-07-03T12:00:00",
        "end_time": "2026-07-03T13:00:00",
        "category": "Routine",
        "user_id": child["id"],
        "family_id": family_id
    })
    assert resp.status_code == 400
    print("Overlapping time-slot check passed (correctly rejected overlap!)")

    # Event 3 - non-overlapping (should succeed)
    resp = client.post("/events", json={
        "title": "Репетитор по математике",
        "start_time": "2026-07-03T15:00:00",
        "end_time": "2026-07-03T16:30:00",
        "category": "Routine",
        "user_id": child["id"],
        "family_id": family_id
    })
    assert resp.status_code == 201
    print("Created non-overlapping calendar event successfully")

    # 5. Tasks (Kanban) and Coins Engine
    resp = client.post("/tasks", json={
        "title": "Помыть посуду",
        "reward_coins": 15,
        "status": "TODO",
        "assigned_to_id": child["id"],
        "created_by_id": parent["id"],
        "family_id": family_id
    })
    assert resp.status_code == 201
    task = resp.json()
    print(f"Created task '{task['title']}' rewarding {task['reward_coins']} coins")

    # Update status to IN_PROGRESS
    resp = client.put(f"/tasks/{task['id']}/status", json={"status": "IN_PROGRESS"})
    assert resp.status_code == 200
    print("Task updated to IN_PROGRESS")

    # Update status to DONE (check coin increment logic)
    resp = client.put(f"/tasks/{task['id']}/status", json={"status": "DONE"})
    assert resp.status_code == 200
    
    # Query child details again to see if coins were awarded
    resp = client.get(f"/families/{family_id}/overview")
    assert resp.status_code == 200
    overview = resp.json()
    child_in_db = next(u for u in overview["users"] if u["id"] == child["id"])
    assert child_in_db["coins"] == 15
    print(f"Coins successfully awarded! Child current coins: {child_in_db['coins']}")

    # 6. Expenses
    client.post("/expenses", json={"title": "Продукты Ашан", "amount": 1250.0, "category": "Продукты", "user_id": parent["id"], "family_id": family_id})
    client.post("/expenses", json={"title": "Билеты в театр", "amount": 3000.0, "category": "Развлечения", "user_id": parent["id"], "family_id": family_id})
    client.post("/expenses", json={"title": "Хлеб", "amount": 50.0, "category": "Продукты", "user_id": parent["id"], "family_id": family_id})

    # Summary
    resp = client.get(f"/families/{family_id}/expenses/summary")
    assert resp.status_code == 200
    summary = resp.json()
    print("Financial summary:")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    assert summary["Продукты"] == 1300.0
    assert summary["Развлечения"] == 3000.0
    
    print("\n--- ALL TESTS COMPLETED SUCCESSFULLY ---")

if __name__ == "__main__":
    test_flow()
