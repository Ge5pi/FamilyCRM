from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
import datetime
from database import Base

class Family(Base):
    __tablename__ = "families"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    join_code = Column(String, unique=True, index=True, nullable=False)

    users = relationship("User", back_populates="family")
    events = relationship("Event", back_populates="family")
    tasks = relationship("Task", back_populates="family")
    expenses = relationship("Expense", back_populates="family")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String, nullable=True)
    name = Column(String, nullable=False)
    role = Column(String, default="Parent")  # Parent or Child
    coins = Column(Integer, default=0)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    last_updated = Column(DateTime, nullable=True)

    family = relationship("Family", back_populates="users")
    events = relationship("Event", back_populates="user")
    assigned_tasks = relationship("Task", foreign_keys="[Task.assigned_to_id]", back_populates="assigned_to")
    expenses = relationship("Expense", back_populates="user")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    category = Column(String, default="General")  # Work, School, Routine, One-off
    is_recurring = Column(Boolean, default=False)  # Recurring daily
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False)

    family = relationship("Family", back_populates="events")
    user = relationship("User", back_populates="events")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    reward_coins = Column(Integer, default=0)
    status = Column(String, default="TODO")  # TODO, IN_PROGRESS, DONE
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False)

    family = relationship("Family", back_populates="tasks")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id], back_populates="assigned_tasks")

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False)  # Food, Entertainment, Utilities, etc.
    date = Column(DateTime, default=datetime.datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    family_id = Column(Integer, ForeignKey("families.id"), nullable=False)

    family = relationship("Family", back_populates="expenses")
    user = relationship("User", back_populates="expenses")
