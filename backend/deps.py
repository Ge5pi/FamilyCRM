"""Shared FastAPI dependencies: authentication and authorization helpers."""

from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

import models
from database import get_db
from security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Не удалось подтвердить учётные данные",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Resolve the authenticated user from the ``Authorization: Bearer`` header."""
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_EXCEPTION

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise CREDENTIALS_EXCEPTION

    user = db.get(models.User, user_id)
    if user is None:
        raise CREDENTIALS_EXCEPTION
    return user


def require_parent(current_user: models.User = Depends(get_current_user)) -> models.User:
    """Allow access to parents (family administrators) only."""
    if current_user.role != models.ROLE_PARENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Действие доступно только родителю",
        )
    return current_user


def get_family_or_404(db: Session, family_id: int) -> models.Family:
    family = db.get(models.Family, family_id)
    if family is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Семья не найдена"
        )
    return family


def get_user_or_404(db: Session, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден"
        )
    return user


def require_family_membership(current_user: models.User, family_id: int) -> None:
    """Ensure the current user belongs to the given family."""
    if current_user.family_id is None or current_user.family_id != family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к этой семье",
        )


def require_family_member_or_404(
    db: Session, current_user: models.User, family_id: int
) -> models.Family:
    family = get_family_or_404(db, family_id)
    require_family_membership(current_user, family_id)
    return family


def require_user_in_family(
    db: Session, current_user: models.User, user_id: int
) -> models.User:
    """Load a user and make sure they share a family with the current user."""
    target = get_user_or_404(db, user_id)
    if current_user.family_id is None or target.family_id != current_user.family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь не состоит в вашей семье",
        )
    return target


def require_self(current_user: models.User, user_id: int) -> None:
    if current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Можно изменять только собственный профиль",
        )


def require_owner_or_parent(
    current_user: models.User, owner_id: int, action: str = "изменять"
) -> None:
    """Allow the owner of a record or any parent in the same family."""
    if current_user.id == owner_id:
        return
    if current_user.role == models.ROLE_PARENT:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Недостаточно прав, чтобы {action} эту запись",
    )


def require_same_family(current_user: models.User, other: models.User) -> None:
    if current_user.family_id is None or other.family_id != current_user.family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Нет доступа к данным этого пользователя",
        )
