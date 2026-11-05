from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from security import BCRYPT_MAX_PASSWORD_BYTES
from timeutils import as_utc

UserRole = Literal["Parent", "Child"]
TaskStatus = Literal["TODO", "IN_PROGRESS", "DONE"]
Recurrence = Literal["none", "daily", "weekly", "monthly"]


# Common Configuration
class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _utc(value: Optional[datetime]) -> Optional[datetime]:
    """Treat naive timestamps as UTC and normalise aware ones."""
    return as_utc(value)


# --- Family Schemas ---
class FamilyBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Название семьи не может быть пустым")
        return value


class FamilyCreate(FamilyBase):
    pass


class FamilyResponse(FamilyBase, ORMBase):
    id: int
    join_code: str


# --- User Schemas ---
class UserBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: UserRole = "Parent"
    email: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Имя не может быть пустым")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip().lower()
        return value or None


class PasswordMixin(BaseModel):
    password: str = Field(min_length=6, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, value: str) -> str:
        if len(value.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
            raise ValueError(
                f"Пароль не должен превышать {BCRYPT_MAX_PASSWORD_BYTES} байт"
            )
        return value


class UserCreate(UserBase):
    """A family member created by a parent.

    Email and password are optional so that a child profile can exist without
    login credentials; providing a password requires an email.
    """

    password: Optional[str] = Field(default=None, min_length=6, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_optional_password(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if len(value.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
            raise ValueError(
                f"Пароль не должен превышать {BCRYPT_MAX_PASSWORD_BYTES} байт"
            )
        return value

    @model_validator(mode="after")
    def validate_credentials_pair(self) -> "UserCreate":
        if self.password and not self.email:
            raise ValueError("Для пароля требуется email")
        return self


class UserRegister(PasswordMixin):
    email: str = Field(min_length=3, max_length=255)
    name: str = Field(min_length=1, max_length=120)
    role: UserRole = "Parent"
    create_family_name: Optional[str] = None
    join_code: Optional[str] = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Имя не может быть пустым")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value:
            raise ValueError("Некорректный email")
        return value

    @field_validator("create_family_name", "join_code")
    @classmethod
    def strip_optional(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        return value or None


class UserLogin(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class InviteMember(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserJoinFamily(BaseModel):
    join_code: str = Field(min_length=1, max_length=32)


class UserResponse(UserBase, ORMBase):
    id: int
    coins: int
    family_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_updated: Optional[datetime] = None

    @field_validator("last_updated")
    @classmethod
    def to_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _utc(value)


class AuthResponse(UserResponse):
    access_token: str
    token_type: str = "bearer"


class UserLocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


# --- Event (Calendar) Schemas ---
class EventBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    category: str = Field(default="General", max_length=60)
    recurrence: Recurrence = "none"
    recurrence_day: Optional[int] = None
    # Deprecated input flag kept for older clients: True means "daily".
    is_recurring: Optional[bool] = None

    @field_validator("start_time", "end_time")
    @classmethod
    def to_utc(cls, value: datetime) -> datetime:
        return as_utc(value)

    @model_validator(mode="before")
    @classmethod
    def apply_legacy_flag(cls, data):
        if isinstance(data, dict):
            legacy = data.get("is_recurring")
            recurrence = data.get("recurrence")
            if legacy and recurrence in (None, "none"):
                data = {**data, "recurrence": "daily"}
        return data

    @model_validator(mode="after")
    def validate_schedule(self) -> "EventBase":
        if self.end_time <= self.start_time:
            raise ValueError("Время окончания должно быть позже времени начала")
        if self.recurrence == "weekly":
            if self.recurrence_day is not None and not 0 <= self.recurrence_day <= 6:
                raise ValueError("День недели должен быть от 0 (понедельник) до 6 (воскресенье)")
        elif self.recurrence == "monthly":
            if self.recurrence_day is not None and not 1 <= self.recurrence_day <= 31:
                raise ValueError("День месяца должен быть от 1 до 31")
        else:
            self.recurrence_day = None
        return self


class EventCreate(EventBase):
    user_id: int
    family_id: int


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    category: Optional[str] = Field(default=None, max_length=60)
    recurrence: Optional[Recurrence] = None
    recurrence_day: Optional[int] = None

    @field_validator("start_time", "end_time")
    @classmethod
    def to_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _utc(value)

    @field_validator("recurrence_day")
    @classmethod
    def validate_day(cls, value: Optional[int]) -> Optional[int]:
        if value is not None and not 0 <= value <= 31:
            raise ValueError("Некорректный день повторения")
        return value


class EventResponse(EventBase, ORMBase):
    id: int
    user_id: int
    family_id: int


# --- Task (Kanban) Schemas ---
class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    reward_coins: int = Field(default=0, ge=0, le=10_000)
    status: TaskStatus = "TODO"


class TaskCreate(TaskBase):
    assigned_to_id: Optional[int] = None
    created_by_id: int
    family_id: int


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    reward_coins: Optional[int] = Field(default=None, ge=0, le=10_000)
    assigned_to_id: Optional[int] = None


class TaskUpdateStatus(BaseModel):
    status: TaskStatus


class TaskResponse(TaskBase, ORMBase):
    id: int
    assigned_to_id: Optional[int] = None
    created_by_id: int
    family_id: int


# --- Expense Schemas ---
class ExpenseBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=100_000_000)
    category: str = Field(min_length=1, max_length=60)


class ExpenseCreate(ExpenseBase):
    user_id: int
    family_id: int


class ExpenseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    amount: Optional[float] = Field(default=None, gt=0, le=100_000_000)
    category: Optional[str] = Field(default=None, min_length=1, max_length=60)
    date: Optional[datetime] = None

    @field_validator("date")
    @classmethod
    def to_utc(cls, value: Optional[datetime]) -> Optional[datetime]:
        return _utc(value)


class ExpenseResponse(ExpenseBase, ORMBase):
    id: int
    date: datetime
    user_id: int
    family_id: int

    @field_validator("date")
    @classmethod
    def to_utc(cls, value: datetime) -> datetime:
        return as_utc(value)


# --- Shop / Room / Coins ---
class ShopItemResponse(BaseModel):
    key: str
    name: str
    price: int
    emoji: str


class PurchaseCreate(BaseModel):
    item_key: str = Field(min_length=1, max_length=60)


class PurchaseResponse(ORMBase):
    id: int
    item_key: str
    item_name: str
    price: int
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def to_utc(cls, value: datetime) -> datetime:
        return as_utc(value)


class CoinTransactionResponse(ORMBase):
    id: int
    amount: int
    balance_after: int
    reason: str
    task_id: Optional[int] = None
    purchase_id: Optional[int] = None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def to_utc(cls, value: datetime) -> datetime:
        return as_utc(value)


class RoomResponse(BaseModel):
    user_id: int
    coins: int
    purchases: List[PurchaseResponse] = []


class CoinHistoryResponse(BaseModel):
    user_id: int
    coins: int
    transactions: List[CoinTransactionResponse] = []


# --- Aggregates ---
class FamilyOverview(ORMBase):
    id: int
    name: str
    join_code: str
    users: List[UserResponse] = []
    events: List[EventResponse] = []
    tasks: List[TaskResponse] = []
    expenses: List[ExpenseResponse] = []
