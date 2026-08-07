import random
import string
import hashlib
from datetime import datetime
from typing import List, Dict
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
import schemas

# Create DB Tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="FamilyCRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_join_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        db_family = db.query(models.Family).filter(models.Family.join_code == code).first()
        if not db_family:
            return code

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

@app.get("/")
def read_root():
    return {"message": "Welcome to FamilyCRM API"}

# --- Authentication ---
@app.post("/auth/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(reg: schemas.UserRegister, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == reg.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    hashed = hash_password(reg.password)
    
    family_id = None
    if reg.join_code:
        db_family = db.query(models.Family).filter(models.Family.join_code == reg.join_code.upper().strip()).first()
        if not db_family:
            raise HTTPException(status_code=400, detail="Семья с таким кодом не найдена")
        family_id = db_family.id
    elif reg.create_family_name:
        join_code = generate_join_code(db)
        new_family = models.Family(name=reg.create_family_name, join_code=join_code)
        db.add(new_family)
        db.commit()
        db.refresh(new_family)
        family_id = new_family.id
    else:
        # Fallback default: create family named after user
        join_code = generate_join_code(db)
        new_family = models.Family(name=f"Семья {reg.name}", join_code=join_code)
        db.add(new_family)
        db.commit()
        db.refresh(new_family)
        family_id = new_family.id
    
    db_user = models.User(
        email=reg.email,
        hashed_password=hashed,
        name=reg.name,
        role=reg.role,
        coins=0,
        family_id=family_id
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/auth/login", response_model=schemas.UserResponse)
def login_user(cred: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == cred.email).first()
    if not db_user or db_user.hashed_password != hash_password(cred.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return db_user

# --- Families & Invites ---
@app.post("/families", response_model=schemas.FamilyResponse, status_code=status.HTTP_201_CREATED)
def create_family(family: schemas.FamilyCreate, db: Session = Depends(get_db)):
    join_code = generate_join_code(db)
    db_family = models.Family(name=family.name, join_code=join_code)
    db.add(db_family)
    db.commit()
    db.refresh(db_family)
    return db_family

@app.post("/families/{family_id}/invite", response_model=schemas.UserResponse)
def invite_family_member(family_id: int, req: schemas.InviteMember, db: Session = Depends(get_db)):
    db_family = db.query(models.Family).filter(models.Family.id == family_id).first()
    if not db_family:
        raise HTTPException(status_code=404, detail="Family not found")
        
    db_user = db.query(models.User).filter(models.User.email == req.email).first()
    if not db_user:
        raise HTTPException(
            status_code=404, 
            detail=f"User with email '{req.email}' not found. Ask them to register first!"
        )
    
    db_user.family_id = family_id
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/families/{family_id}/overview", response_model=schemas.FamilyOverview)
def get_family_overview(family_id: int, db: Session = Depends(get_db)):
    db_family = db.query(models.Family).filter(models.Family.id == family_id).first()
    if not db_family:
        raise HTTPException(status_code=404, detail="Family not found")
    return db_family

# --- Users ---
@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@app.post("/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = models.User(name=user.name, role=user.role, family_id=user.family_id)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/users/{user_id}/join", response_model=schemas.UserResponse)
def join_family(user_id: int, join_req: schemas.UserJoinFamily, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_family = db.query(models.Family).filter(models.Family.join_code == join_req.join_code).first()
    if not db_family:
        raise HTTPException(status_code=404, detail="Invalid Join Code")
    
    db_user.family_id = db_family.id
    db.commit()
    db.refresh(db_user)
    return db_user

@app.put("/users/{user_id}/location", response_model=schemas.UserResponse)
def update_user_location(user_id: int, loc: schemas.UserLocationUpdate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.latitude = loc.latitude
    db_user.longitude = loc.longitude
    db_user.last_updated = datetime.utcnow()
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Events (Calendar) ---
@app.post("/events", response_model=schemas.EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(event: schemas.EventCreate, db: Session = Depends(get_db)):
    # Check overlaps for THIS user's own schedule (not entire family)
    user_events = db.query(models.Event).filter(models.Event.user_id == event.user_id).all()
    
    new_start = event.start_time
    new_end = event.end_time
    
    for existing in user_events:
        # Check overlap
        if event.is_recurring or existing.is_recurring:
            # Recurring event happens daily, so compare only the hour/minute times
            overlap = new_start.time() < existing.end_time.time() and new_end.time() > existing.start_time.time()
        else:
            # Regular one-off event checks exact date/time boundaries
            overlap = new_start < existing.end_time and new_end > existing.start_time
            
        if overlap:
            raise HTTPException(
                status_code=400, 
                detail=f"Time slot overlaps with event: {existing.title} ({existing.start_time.strftime('%H:%M')} - {existing.end_time.strftime('%H:%M')})"
            )

    db_event = models.Event(
        title=event.title,
        description=event.description,
        start_time=event.start_time,
        end_time=event.end_time,
        category=event.category,
        is_recurring=event.is_recurring,
        user_id=event.user_id,
        family_id=event.family_id
    )
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

@app.get("/users/{user_id}/events", response_model=List[schemas.EventResponse])
def get_user_events(user_id: int, db: Session = Depends(get_db)):
    return db.query(models.Event).filter(models.Event.user_id == user_id).all()

@app.get("/families/{family_id}/events", response_model=List[schemas.EventResponse])
def get_family_events(family_id: int, db: Session = Depends(get_db)):
    return db.query(models.Event).filter(models.Event.family_id == family_id).all()

@app.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    db_event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(db_event)
    db.commit()
    return None

# --- Tasks (Kanban) ---
@app.post("/tasks", response_model=schemas.TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    db_task = models.Task(
        title=task.title,
        description=task.description,
        reward_coins=task.reward_coins,
        status=task.status,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        family_id=task.family_id
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task

@app.get("/families/{family_id}/tasks", response_model=List[schemas.TaskResponse])
def get_family_tasks(family_id: int, db: Session = Depends(get_db)):
    return db.query(models.Task).filter(models.Task.family_id == family_id).all()

@app.put("/tasks/{task_id}/status", response_model=schemas.TaskResponse)
def update_task_status(task_id: int, update: schemas.TaskUpdateStatus, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    old_status = db_task.status
    new_status = update.status
    
    db_task.status = new_status
    
    # Coin rewards logic: transition to DONE awards coins
    if old_status != "DONE" and new_status == "DONE" and db_task.assigned_to_id:
        user = db.query(models.User).filter(models.User.id == db_task.assigned_to_id).first()
        if user:
            user.coins += db_task.reward_coins
    
    # If task was DONE and is moved back, revoke the coins
    if old_status == "DONE" and new_status != "DONE" and db_task.assigned_to_id:
        user = db.query(models.User).filter(models.User.id == db_task.assigned_to_id).first()
        if user:
            user.coins = max(0, user.coins - db_task.reward_coins)
            
    db.commit()
    db.refresh(db_task)
    return db_task

@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(db_task)
    db.commit()
    return None

# --- Expenses (Finance) ---
@app.post("/expenses", response_model=schemas.ExpenseResponse, status_code=status.HTTP_201_CREATED)
def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(get_db)):
    db_expense = models.Expense(
        title=expense.title,
        amount=expense.amount,
        category=expense.category,
        user_id=expense.user_id,
        family_id=expense.family_id
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense

@app.get("/families/{family_id}/expenses", response_model=List[schemas.ExpenseResponse])
def get_family_expenses(family_id: int, db: Session = Depends(get_db)):
    return db.query(models.Expense).filter(models.Expense.family_id == family_id).all()

@app.get("/families/{family_id}/expenses/summary", response_model=Dict[str, float])
def get_family_expenses_summary(family_id: int, db: Session = Depends(get_db)):
    expenses = db.query(models.Expense).filter(models.Expense.family_id == family_id).all()
    summary = {}
    for exp in expenses:
        summary[exp.category] = summary.get(exp.category, 0.0) + exp.amount
    return summary
