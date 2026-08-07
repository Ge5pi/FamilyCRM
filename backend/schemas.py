from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# Common Configuration
class ORMBase(BaseModel):
    class Config:
        from_attributes = True

# --- Family Schemas ---
class FamilyBase(BaseModel):
    name: str

class FamilyCreate(FamilyBase):
    pass

class FamilyResponse(FamilyBase, ORMBase):
    id: int
    join_code: str

# --- User Schemas ---
class UserBase(BaseModel):
    name: str
    role: str = "Parent"  # Parent or Child
    email: Optional[str] = None

class UserCreate(UserBase):
    family_id: Optional[int] = None

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: str = "Parent"
    create_family_name: Optional[str] = None
    join_code: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class InviteMember(BaseModel):
    email: str

class UserJoinFamily(BaseModel):
    join_code: str

class UserResponse(UserBase, ORMBase):
    id: int
    coins: int
    family_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_updated: Optional[datetime] = None

class UserLocationUpdate(BaseModel):
    latitude: float
    longitude: float

# --- Event (Calendar) Schemas ---
class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    category: str = "General"
    is_recurring: bool = False

class EventCreate(EventBase):
    user_id: int
    family_id: int

class EventResponse(EventBase, ORMBase):
    id: int
    user_id: int
    family_id: int

# --- Task (Kanban) Schemas ---
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    reward_coins: int = 0
    status: str = "TODO"

class TaskCreate(TaskBase):
    assigned_to_id: Optional[int] = None
    created_by_id: int
    family_id: int

class TaskUpdateStatus(BaseModel):
    status: str

class TaskResponse(TaskBase, ORMBase):
    id: int
    assigned_to_id: Optional[int] = None
    created_by_id: int
    family_id: int

# --- Expense Schemas ---
class ExpenseBase(BaseModel):
    title: str
    amount: float
    category: str

class ExpenseCreate(ExpenseBase):
    user_id: int
    family_id: int

class ExpenseResponse(ExpenseBase, ORMBase):
    id: int
    date: datetime
    user_id: int
    family_id: int

# --- Aggregates ---
class FamilyOverview(ORMBase):
    id: int
    name: str
    users: List[UserResponse] = []
    events: List[EventResponse] = []
    tasks: List[TaskResponse] = []
    expenses: List[ExpenseResponse] = []
