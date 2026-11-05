import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base

# User roles
ROLE_PARENT = "Parent"
ROLE_CHILD = "Child"
USER_ROLES = (ROLE_PARENT, ROLE_CHILD)

# Task statuses (Kanban columns)
TASK_TODO = "TODO"
TASK_IN_PROGRESS = "IN_PROGRESS"
TASK_DONE = "DONE"
TASK_STATUSES = (TASK_TODO, TASK_IN_PROGRESS, TASK_DONE)

# Event recurrence
RECURRENCE_NONE = "none"
RECURRENCE_DAILY = "daily"
RECURRENCE_WEEKLY = "weekly"
RECURRENCE_MONTHLY = "monthly"
RECURRENCE_TYPES = (RECURRENCE_NONE, RECURRENCE_DAILY, RECURRENCE_WEEKLY, RECURRENCE_MONTHLY)

# Coin ledger reasons
COIN_REASON_TASK_DONE = "task_done"
COIN_REASON_TASK_REOPENED = "task_reopened"
COIN_REASON_PURCHASE = "purchase"
COIN_REASON_ADJUSTMENT = "adjustment"


def utcnow() -> datetime.datetime:
    """Timezone-aware UTC timestamp (``utcnow()`` is deprecated in Python 3.12+)."""
    return datetime.datetime.now(datetime.timezone.utc)


class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    join_code = Column(String, unique=True, index=True, nullable=False)

    users = relationship("User", back_populates="family")
    events = relationship("Event", back_populates="family")
    tasks = relationship("Task", back_populates="family")
    expenses = relationship("Expense", back_populates="family")
    purchases = relationship("Purchase", back_populates="family")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    role = Column(String, default=ROLE_PARENT)
    coins = Column(Integer, default=0, nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), index=True, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    last_updated = Column(DateTime, nullable=True)

    family = relationship("Family", back_populates="users")
    events = relationship("Event", back_populates="user")
    assigned_tasks = relationship(
        "Task", foreign_keys="[Task.assigned_to_id]", back_populates="assigned_to"
    )
    expenses = relationship("Expense", back_populates="user")
    purchases = relationship("Purchase", back_populates="user")
    coin_transactions = relationship("CoinTransaction", back_populates="user")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    category = Column(String, default="General")
    # none | daily | weekly | monthly
    recurrence = Column(String, nullable=False, default=RECURRENCE_NONE)
    # weekly: ISO weekday 0..6 (Mon..Sun); monthly: day of month 1..31
    recurrence_day = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), index=True, nullable=False)

    family = relationship("Family", back_populates="events")
    user = relationship("User", back_populates="events")

    @property
    def is_recurring(self) -> bool:
        """Backwards-compatible flag used by older API clients."""
        return (self.recurrence or RECURRENCE_NONE) != RECURRENCE_NONE


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    reward_coins = Column(Integer, default=0)
    status = Column(String, default=TASK_TODO)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), index=True, nullable=False)

    family = relationship("Family", back_populates="tasks")
    assigned_to = relationship(
        "User", foreign_keys=[assigned_to_id], back_populates="assigned_tasks"
    )


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False)
    date = Column(DateTime, default=utcnow, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), index=True, nullable=False)

    family = relationship("Family", back_populates="expenses")
    user = relationship("User", back_populates="expenses")


class Purchase(Base):
    """A virtual room item bought by a family member for coins."""

    __tablename__ = "purchases"
    __table_args__ = (
        UniqueConstraint("user_id", "item_key", name="uq_purchases_user_item"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    family_id = Column(
        Integer, ForeignKey("families.id", ondelete="CASCADE"), index=True, nullable=False
    )
    item_key = Column(String, nullable=False)
    item_name = Column(String, nullable=False)
    price = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    user = relationship("User", back_populates="purchases")
    family = relationship("Family", back_populates="purchases")


class CoinTransaction(Base):
    """Append-only ledger of coin movements.

    ``users.coins`` is the current balance (kept in sync inside the same
    transaction); this table provides the audit trail and history screen.
    """

    __tablename__ = "coin_transactions"
    __table_args__ = (
        CheckConstraint("amount != 0", name="ck_coin_transactions_amount_nonzero"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    amount = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    task_id = Column(
        Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    purchase_id = Column(
        Integer, ForeignKey("purchases.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    user = relationship("User", back_populates="coin_transactions")
    task = relationship("Task")
    purchase = relationship("Purchase")
