"""FamilyCRM HTTP API.

Authentication is JWT based: ``POST /auth/register`` and ``POST /auth/login``
return an access token that must be sent as ``Authorization: Bearer <token>``.
Every other endpoint is scoped to the caller's family.

Datetimes are exchanged as ISO-8601 in UTC (``...Z`` / ``+00:00``); the
database stores naive UTC values so SQLite and PostgreSQL behave identically.
"""

import asyncio
import hashlib
import logging
import secrets
import string
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import jwt

import models
import schemas
from catalog import SHOP_ITEMS, get_shop_item
from config import DEV_SECRET_KEY, settings
from database import get_db
from email_sender import send_password_reset_code
from geofence import is_inside
from push import send_push_to_users
from deps import (
    get_current_user,
    get_family_or_404,
    get_user_or_404,
    require_family_membership,
    require_owner_or_parent,
    require_parent,
    require_same_family,
    require_self,
)
from recurrence import default_recurrence_day, events_overlap
from security import (
    create_access_token,
    decode_access_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from timeutils import ensure_utc_naive, utc_now_naive

logger = logging.getLogger("familycrm")

if settings.secret_key == DEV_SECRET_KEY:
    logger.warning(
        "SECRET_KEY is using the insecure development default. "
        "Set a strong SECRET_KEY before deploying to production."
    )

class FamilyHub:
    """Per-family WebSocket connections used for live updates."""

    def __init__(self) -> None:
        self._connections: Dict[int, set] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, family_id: int, websocket: WebSocket) -> None:
        # The endpoint accepts the handshake itself (so it can reject
        # unauthorised clients with an application close code).
        self._connections.setdefault(family_id, set()).add(websocket)

    def disconnect(self, family_id: int, websocket: WebSocket) -> None:
        connections = self._connections.get(family_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self._connections.pop(family_id, None)

    async def broadcast(self, family_id: int, payload: dict) -> None:
        for websocket in list(self._connections.get(family_id, ())):
            try:
                await websocket.send_json(payload)
            except Exception:
                self.disconnect(family_id, websocket)

    def notify(self, family_id: Optional[int], kind: str = "update") -> None:
        """Thread-safe notification callable from synchronous endpoints."""
        if family_id is None or self._loop is None or self._loop.is_closed():
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.broadcast(family_id, {"type": kind}), self._loop
            )
        except RuntimeError:
            logger.debug("WebSocket loop is unavailable; skipping notification")


hub = FamilyHub()


@asynccontextmanager
async def lifespan(_: FastAPI):
    hub.set_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title=settings.project_name, version="1.2.0", lifespan=lifespan)

# Bearer tokens are sent in headers, so cookies/credentials are not required.
# A wildcard origin is therefore safe for local development.
_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Helpers ---
def generate_join_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not db.query(models.Family).filter(models.Family.join_code == code).first():
            return code


def build_auth_response(user: models.User) -> schemas.AuthResponse:
    """Serialize a user together with a freshly issued access token."""
    token = create_access_token(user.id, extra_claims={"ver": user.token_version or 0})
    return schemas.AuthResponse(
        access_token=token,
        token_type="bearer",
        **schemas.UserResponse.model_validate(user).model_dump(),
    )


def create_family_for_user(db: Session, name: str) -> models.Family:
    family = models.Family(name=name, join_code=generate_join_code(db))
    db.add(family)
    db.commit()
    db.refresh(family)
    return family


def family_has_other_members(db: Session, user: models.User) -> bool:
    """True when the user's family contains someone besides them.

    Moving a user out of a shared family would orphan their records, so it is
    only allowed while they are the sole member (e.g. an auto-created family).
    """
    if user.family_id is None:
        return False
    return (
        db.query(models.User)
        .filter(
            models.User.family_id == user.family_id,
            models.User.id != user.id,
        )
        .first()
        is not None
    )


def hash_reset_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()


def apply_coin_change(
    db: Session,
    user: models.User,
    amount: int,
    reason: str,
    task_id: Optional[int] = None,
    purchase_id: Optional[int] = None,
) -> int:
    """Update the balance and append a ledger entry. Returns the applied delta."""
    new_balance = max(0, user.coins + amount)
    delta = new_balance - user.coins
    if delta == 0:
        return 0
    user.coins = new_balance
    db.add(
        models.CoinTransaction(
            user_id=user.id,
            amount=delta,
            balance_after=new_balance,
            reason=reason,
            task_id=task_id,
            purchase_id=purchase_id,
        )
    )
    return delta


def find_event_overlap(
    db: Session, candidate: models.Event, exclude_event_id: Optional[int] = None
) -> Optional[models.Event]:
    """Return an existing event that conflicts with ``candidate``, if any."""
    query = db.query(models.Event).filter(models.Event.user_id == candidate.user_id)
    if exclude_event_id is not None:
        query = query.filter(models.Event.id != exclude_event_id)
    for existing in query.all():
        if events_overlap(candidate, existing):
            return existing
    return None


def conflict_error(existing: models.Event) -> HTTPException:
    return HTTPException(
        status_code=400,
        detail=(
            "Время пересекается с событием: "
            f"{existing.title} "
            f"({existing.start_time.strftime('%H:%M')} - "
            f"{existing.end_time.strftime('%H:%M')})"
        ),
    )


def build_event_candidate(
    *,
    title: str,
    description: Optional[str],
    start_time,
    end_time,
    category: str,
    recurrence: str,
    recurrence_day: Optional[int],
    recurrence_until=None,
    user_id: int,
    family_id: int,
) -> models.Event:
    """Create a transient Event used for validation/overlap checks."""
    start = ensure_utc_naive(start_time)
    end = ensure_utc_naive(end_time)
    day = recurrence_day
    if recurrence in (models.RECURRENCE_WEEKLY, models.RECURRENCE_MONTHLY):
        if day is None:
            day = default_recurrence_day(recurrence, start)
    else:
        day = None
    return models.Event(
        title=title,
        description=description,
        start_time=start,
        end_time=end,
        category=category,
        recurrence=recurrence,
        recurrence_day=day,
        recurrence_until=recurrence_until if recurrence != models.RECURRENCE_NONE else None,
        user_id=user_id,
        family_id=family_id,
    )


def validate_recurrence_day(recurrence: str, day: Optional[int]) -> None:
    if recurrence == models.RECURRENCE_WEEKLY and day is not None and not 0 <= day <= 6:
        raise HTTPException(status_code=422, detail="День недели должен быть от 0 до 6")
    if recurrence == models.RECURRENCE_MONTHLY and day is not None and not 1 <= day <= 31:
        raise HTTPException(status_code=422, detail="День месяца должен быть от 1 до 31")


def filtered_expenses(
    db: Session,
    family_id: int,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    category: Optional[str] = None,
):
    query = db.query(models.Expense).filter(models.Expense.family_id == family_id)
    if date_from is not None:
        query = query.filter(models.Expense.date >= ensure_utc_naive(date_from))
    if date_to is not None:
        query = query.filter(models.Expense.date <= ensure_utc_naive(date_to))
    if category:
        query = query.filter(models.Expense.category == category)
    return query.order_by(models.Expense.date.desc())


# --- System ---
@app.get("/")
def read_root():
    return {"message": "Welcome to FamilyCRM API"}


# --- Authentication ---
@app.post(
    "/auth/register",
    response_model=schemas.AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(reg: schemas.UserRegister, db: Session = Depends(get_db)):
    existing = db.query(models.User).filter(models.User.email == reg.email).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Пользователь с таким email уже существует"
        )

    if reg.join_code:
        db_family = (
            db.query(models.Family)
            .filter(models.Family.join_code == reg.join_code.upper())
            .first()
        )
        if not db_family:
            raise HTTPException(status_code=400, detail="Семья с таким кодом не найдена")
        family = db_family
    elif reg.create_family_name:
        family = create_family_for_user(db, reg.create_family_name)
    else:
        family = create_family_for_user(db, f"Семья {reg.name}")

    db_user = models.User(
        email=reg.email,
        hashed_password=hash_password(reg.password),
        name=reg.name,
        role=reg.role,
        coins=0,
        family_id=family.id,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return build_auth_response(db_user)


@app.post("/auth/login", response_model=schemas.AuthResponse)
def login_user(cred: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == cred.email).first()
    if not db_user or not verify_password(cred.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if password_needs_rehash(db_user.hashed_password):
        db_user.hashed_password = hash_password(cred.password)
        db.commit()
        db.refresh(db_user)

    return build_auth_response(db_user)


@app.get("/auth/me", response_model=schemas.UserResponse)
def read_current_user(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.post("/auth/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    req: schemas.ForgotPassword,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Send a one-time reset code.

    The response is deliberately identical for known and unknown emails to
    avoid account enumeration. In development without SMTP the code is
    returned as ``dev_code`` (and logged) to make local testing possible.
    """
    response: Dict[str, str] = {
        "detail": "Если email зарегистрирован, код отправлен"
    }

    user = db.query(models.User).filter(models.User.email == req.email).first()
    if user is None or not user.email:
        return response

    now = utc_now_naive()
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used_at.is_(None),
    ).update({models.PasswordResetToken.used_at: now})

    code = secrets.token_hex(5).upper()
    db.add(
        models.PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_code(code),
            expires_at=now + timedelta(minutes=settings.password_reset_token_minutes),
        )
    )
    db.commit()

    background_tasks.add_task(
        send_password_reset_code,
        user.email,
        user.name,
        code,
        settings.password_reset_token_minutes,
    )

    if not settings.is_production and not settings.smtp_configured:
        response["dev_code"] = code
    return response


@app.post("/auth/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    req: schemas.ResetPassword,
    db: Session = Depends(get_db),
):
    now = utc_now_naive()
    record = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.token_hash == hash_reset_code(req.code),
            models.PasswordResetToken.used_at.is_(None),
        )
        .first()
    )
    if record is None or record.expires_at is None or record.expires_at < now:
        raise HTTPException(status_code=400, detail="Код недействителен или истёк")

    user = db.get(models.User, record.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Код недействителен или истёк")

    user.hashed_password = hash_password(req.new_password)
    user.token_version = (user.token_version or 0) + 1

    # Invalidate every outstanding code for this user.
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used_at.is_(None),
    ).update({models.PasswordResetToken.used_at: now})
    db.commit()
    return None


# --- Families & Invites ---
@app.post(
    "/families",
    response_model=schemas.FamilyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_family(
    family: schemas.FamilyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.family_id is not None and family_has_other_members(db, current_user):
        raise HTTPException(
            status_code=400,
            detail="Вы уже состоите в семье с другими участниками",
        )
    db_family = create_family_for_user(db, family.name)
    current_user.family_id = db_family.id
    db.commit()
    hub.notify(db_family.id, "family")
    return db_family


@app.post("/families/{family_id}/invite", response_model=schemas.UserResponse)
def invite_family_member(
    family_id: int,
    req: schemas.InviteMember,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    require_family_membership(current_user, family_id)
    get_family_or_404(db, family_id)

    db_user = db.query(models.User).filter(models.User.email == req.email).first()
    if not db_user:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Пользователь с email '{req.email}' не найден. "
                "Попросите его сначала зарегистрироваться."
            ),
        )

    if db_user.family_id == family_id:
        return db_user

    if db_user.family_id is not None and family_has_other_members(db, db_user):
        raise HTTPException(
            status_code=400,
            detail="Пользователь уже состоит в другой семье с участниками",
        )

    db_user.family_id = family_id
    db.commit()
    db.refresh(db_user)
    hub.notify(family_id, "family")
    background_tasks.add_task(
        send_push_to_users,
        [db_user.id],
        "FamilyCRM",
        "Вас добавили в семейное пространство",
        {"screen": "profile"},
    )
    return db_user


@app.get("/families/{family_id}", response_model=schemas.FamilyResponse)
def get_family(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Lightweight family info (name, join code) for the mobile shell."""
    require_family_membership(current_user, family_id)
    return get_family_or_404(db, family_id)


@app.get("/families/{family_id}/overview", response_model=schemas.FamilyOverview)
def get_family_overview(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return get_family_or_404(db, family_id)


@app.get("/families/{family_id}/members", response_model=List[schemas.UserResponse])
def get_family_members(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return db.query(models.User).filter(models.User.family_id == family_id).all()


# --- Users ---
@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_user = get_user_or_404(db, user_id)
    if current_user.id != user_id:
        require_same_family(current_user, db_user)
    return db_user


@app.patch("/users/{user_id}", response_model=schemas.UserResponse)
def update_user_profile(
    user_id: int,
    update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_self(current_user, user_id)
    db_user = get_user_or_404(db, user_id)

    data = update.model_dump(exclude_unset=True)
    if "avatar" in data and not data["avatar"]:
        data["avatar"] = "🙂"

    for field, value in data.items():
        setattr(db_user, field, value)

    db.commit()
    db.refresh(db_user)
    hub.notify(db_user.family_id, "family")
    return db_user


@app.post("/auth/change-password", response_model=schemas.AuthResponse)
def change_password(
    payload: schemas.PasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")

    current_user.hashed_password = hash_password(payload.new_password)
    current_user.token_version = (current_user.token_version or 0) + 1
    db.commit()
    db.refresh(current_user)
    return build_auth_response(current_user)


@app.post("/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    """Create an additional family member profile (parent-only)."""
    if current_user.family_id is None:
        raise HTTPException(status_code=400, detail="Сначала создайте или выберите семью")

    if user.email:
        existing = db.query(models.User).filter(models.User.email == user.email).first()
        if existing:
            raise HTTPException(
                status_code=400, detail="Пользователь с таким email уже существует"
            )

    db_user = models.User(
        name=user.name,
        role=user.role,
        email=user.email,
        avatar=user.avatar or "🙂",
        hashed_password=hash_password(user.password) if user.password else None,
        coins=0,
        family_id=current_user.family_id,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    hub.notify(db_user.family_id, "family")
    return db_user


@app.post("/users/{user_id}/join", response_model=schemas.UserResponse)
def join_family(
    user_id: int,
    join_req: schemas.UserJoinFamily,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_self(current_user, user_id)
    db_user = get_user_or_404(db, user_id)

    db_family = (
        db.query(models.Family)
        .filter(models.Family.join_code == join_req.join_code.strip().upper())
        .first()
    )
    if not db_family:
        raise HTTPException(status_code=404, detail="Неверный код семьи")

    db_user.family_id = db_family.id
    db.commit()
    db.refresh(db_user)
    hub.notify(db_family.id, "family")
    return db_user


@app.put("/users/{user_id}/location", response_model=schemas.UserResponse)
def update_user_location(
    user_id: int,
    loc: schemas.UserLocationUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_self(current_user, user_id)
    db_user = get_user_or_404(db, user_id)

    previous_latitude = db_user.latitude
    previous_longitude = db_user.longitude

    alerts = []
    # Transitions are only meaningful when we know the previous position;
    # the first fix simply stores the coordinate.
    if (
        db_user.family_id is not None
        and previous_latitude is not None
        and previous_longitude is not None
    ):
        fences = (
            db.query(models.Geofence)
            .filter(models.Geofence.family_id == db_user.family_id)
            .all()
        )
        for fence in fences:
            was_inside = is_inside(
                previous_latitude,
                previous_longitude,
                fence.latitude,
                fence.longitude,
                fence.radius_m,
            )
            now_inside = is_inside(
                loc.latitude, loc.longitude, fence.latitude, fence.longitude, fence.radius_m
            )
            if was_inside == now_inside:
                continue
            alert_type = "enter" if now_inside else "exit"
            if alert_type == "enter" and not fence.notify_enter:
                continue
            if alert_type == "exit" and not fence.notify_exit:
                continue
            alerts.append(
                models.LocationAlert(
                    family_id=db_user.family_id,
                    user_id=db_user.id,
                    geofence_id=fence.id,
                    geofence_name=fence.name,
                    user_name=db_user.name,
                    type=alert_type,
                    latitude=loc.latitude,
                    longitude=loc.longitude,
                )
            )

    db_user.latitude = loc.latitude
    db_user.longitude = loc.longitude
    db_user.last_updated = utc_now_naive()
    if alerts:
        db.add_all(alerts)
    db.commit()
    db.refresh(db_user)
    hub.notify(db_user.family_id, "location")

    if alerts and db_user.family_id is not None:
        parent_ids = [
            parent.id
            for parent in db.query(models.User)
            .filter(
                models.User.family_id == db_user.family_id,
                models.User.role == models.ROLE_PARENT,
                models.User.id != db_user.id,
            )
            .all()
        ]
        for alert in alerts:
            if not parent_ids:
                break
            action = "вошёл в" if alert.type == "enter" else "покинул"
            background_tasks.add_task(
                send_push_to_users,
                parent_ids,
                "Геозона",
                f"{db_user.name} {action} «{alert.geofence_name}»",
                {"screen": "locator", "geofenceId": alert.geofence_id},
            )

    return db_user


@app.get("/users/{user_id}/room", response_model=schemas.RoomResponse)
def get_room(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_user = get_user_or_404(db, user_id)
    if current_user.id != user_id:
        require_same_family(current_user, db_user)

    purchases = (
        db.query(models.Purchase)
        .filter(models.Purchase.user_id == user_id)
        .order_by(models.Purchase.created_at.asc())
        .all()
    )
    return schemas.RoomResponse(
        user_id=db_user.id,
        coins=db_user.coins,
        purchases=[schemas.PurchaseResponse.model_validate(p) for p in purchases],
    )


@app.get("/users/{user_id}/coins", response_model=schemas.CoinHistoryResponse)
def get_coin_history(
    user_id: int,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_user = get_user_or_404(db, user_id)
    if current_user.id != user_id:
        require_same_family(current_user, db_user)
        if current_user.role != models.ROLE_PARENT:
            raise HTTPException(
                status_code=403, detail="История коинов доступна только родителю"
            )

    transactions = (
        db.query(models.CoinTransaction)
        .filter(models.CoinTransaction.user_id == user_id)
        .order_by(models.CoinTransaction.created_at.desc())
        .limit(limit)
        .all()
    )
    return schemas.CoinHistoryResponse(
        user_id=db_user.id,
        coins=db_user.coins,
        transactions=[
            schemas.CoinTransactionResponse.model_validate(t) for t in transactions
        ],
    )


# --- Push subscriptions ---
@app.get(
    "/users/{user_id}/push-subscriptions",
    response_model=List[schemas.PushSubscriptionResponse],
)
def list_push_subscriptions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_self(current_user, user_id)
    return (
        db.query(models.PushSubscription)
        .filter(
            models.PushSubscription.user_id == user_id,
            models.PushSubscription.active.is_(True),
        )
        .all()
    )


@app.post(
    "/users/{user_id}/push-subscriptions",
    response_model=schemas.PushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_push_subscription(
    user_id: int,
    payload: schemas.PushSubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_self(current_user, user_id)
    now = utc_now_naive()

    subscription = (
        db.query(models.PushSubscription)
        .filter(models.PushSubscription.token == payload.token)
        .first()
    )
    if subscription is None:
        subscription = models.PushSubscription(
            user_id=user_id,
            token=payload.token,
            platform=payload.platform,
            active=True,
            updated_at=now,
        )
        db.add(subscription)
    else:
        # The same device may switch accounts: move the token to the caller.
        subscription.user_id = user_id
        subscription.platform = payload.platform
        subscription.active = True
        subscription.updated_at = now

    db.commit()
    db.refresh(subscription)
    return subscription


@app.delete("/users/{user_id}/push-subscriptions", status_code=204)
def remove_push_subscription(
    user_id: int,
    token: Optional[str] = Query(default=None, max_length=255),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_self(current_user, user_id)

    query = db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == user_id
    )
    if token:
        query = query.filter(models.PushSubscription.token == token)

    for subscription in query.all():
        db.delete(subscription)
    db.commit()
    return None


# --- Shop ---
@app.get("/shop/items", response_model=List[schemas.ShopItemResponse])
def list_shop_items(_: models.User = Depends(get_current_user)):
    return [
        schemas.ShopItemResponse(
            key=item.key, name=item.name, price=item.price, emoji=item.emoji
        )
        for item in SHOP_ITEMS
    ]


@app.post(
    "/shop/purchases",
    response_model=schemas.PurchaseResponse,
    status_code=status.HTTP_201_CREATED,
)
def purchase_shop_item(
    req: schemas.PurchaseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = get_shop_item(req.item_key)
    if item is None:
        raise HTTPException(status_code=404, detail="Товар не найден")

    if current_user.family_id is None:
        raise HTTPException(status_code=400, detail="Сначала создайте или выберите семью")

    existing = (
        db.query(models.Purchase)
        .filter(
            models.Purchase.user_id == current_user.id,
            models.Purchase.item_key == item.key,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Этот предмет уже куплен")

    if current_user.coins < item.price:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Недостаточно коинов: нужно {item.price}, "
                f"у вас {current_user.coins}"
            ),
        )

    purchase = models.Purchase(
        user_id=current_user.id,
        family_id=current_user.family_id,
        item_key=item.key,
        item_name=item.name,
        price=item.price,
    )
    db.add(purchase)
    db.flush()

    apply_coin_change(
        db,
        current_user,
        -item.price,
        models.COIN_REASON_PURCHASE,
        purchase_id=purchase.id,
    )

    db.commit()
    db.refresh(purchase)
    hub.notify(current_user.family_id, "room")
    return purchase


# --- Budgets ---
@app.get("/families/{family_id}/budgets", response_model=List[schemas.BudgetResponse])
def get_family_budgets(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return (
        db.query(models.Budget)
        .filter(models.Budget.family_id == family_id)
        .order_by(models.Budget.category)
        .all()
    )


@app.put(
    "/families/{family_id}/budgets/{category}",
    response_model=schemas.BudgetResponse,
)
def set_family_budget(
    family_id: int,
    category: str,
    update: schemas.BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    require_family_membership(current_user, family_id)
    category = category.strip()
    if not category or len(category) > 60:
        raise HTTPException(status_code=422, detail="Некорректная категория")

    budget = (
        db.query(models.Budget)
        .filter(
            models.Budget.family_id == family_id,
            models.Budget.category == category,
        )
        .first()
    )
    if budget is None:
        budget = models.Budget(
            family_id=family_id,
            category=category,
            monthly_limit=update.monthly_limit,
        )
        db.add(budget)
    else:
        budget.monthly_limit = update.monthly_limit

    db.commit()
    db.refresh(budget)
    hub.notify(family_id, "budgets")
    return budget


@app.delete("/families/{family_id}/budgets/{category}", status_code=204)
def delete_family_budget(
    family_id: int,
    category: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    require_family_membership(current_user, family_id)
    budget = (
        db.query(models.Budget)
        .filter(
            models.Budget.family_id == family_id,
            models.Budget.category == category,
        )
        .first()
    )
    if budget is None:
        raise HTTPException(status_code=404, detail="Бюджет не найден")

    db.delete(budget)
    db.commit()
    hub.notify(family_id, "budgets")
    return None


# --- Geofences & location alerts ---
@app.get(
    "/families/{family_id}/geofences",
    response_model=List[schemas.GeofenceResponse],
)
def get_family_geofences(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return (
        db.query(models.Geofence)
        .filter(models.Geofence.family_id == family_id)
        .order_by(models.Geofence.name)
        .all()
    )


@app.post(
    "/families/{family_id}/geofences",
    response_model=schemas.GeofenceResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_geofence(
    family_id: int,
    payload: schemas.GeofenceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    require_family_membership(current_user, family_id)

    existing = (
        db.query(models.Geofence)
        .filter(
            models.Geofence.family_id == family_id,
            models.Geofence.name == payload.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Геозона с таким названием уже существует"
        )

    geofence = models.Geofence(
        family_id=family_id,
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        radius_m=payload.radius_m,
        notify_enter=payload.notify_enter,
        notify_exit=payload.notify_exit,
        created_by_id=current_user.id,
        updated_at=utc_now_naive(),
    )
    db.add(geofence)
    db.commit()
    db.refresh(geofence)
    hub.notify(family_id, "location")
    return geofence


@app.patch("/geofences/{geofence_id}", response_model=schemas.GeofenceResponse)
def update_geofence(
    geofence_id: int,
    payload: schemas.GeofenceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    geofence = db.get(models.Geofence, geofence_id)
    if geofence is None:
        raise HTTPException(status_code=404, detail="Геозона не найдена")

    require_family_membership(current_user, geofence.family_id)

    data = payload.model_dump(exclude_unset=True)
    new_name = data.get("name")
    if new_name and new_name != geofence.name:
        duplicate = (
            db.query(models.Geofence)
            .filter(
                models.Geofence.family_id == geofence.family_id,
                models.Geofence.name == new_name,
                models.Geofence.id != geofence.id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(
                status_code=400, detail="Геозона с таким названием уже существует"
            )

    for field, value in data.items():
        setattr(geofence, field, value)
    geofence.updated_at = utc_now_naive()

    db.commit()
    db.refresh(geofence)
    hub.notify(geofence.family_id, "location")
    return geofence


@app.delete("/geofences/{geofence_id}", status_code=204)
def delete_geofence(
    geofence_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    geofence = db.get(models.Geofence, geofence_id)
    if geofence is None:
        raise HTTPException(status_code=404, detail="Геозона не найдена")

    require_family_membership(current_user, geofence.family_id)
    family_id = geofence.family_id
    db.delete(geofence)
    db.commit()
    hub.notify(family_id, "location")
    return None


@app.get(
    "/families/{family_id}/location-alerts",
    response_model=List[schemas.LocationAlertResponse],
)
def get_location_alerts(
    family_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return (
        db.query(models.LocationAlert)
        .filter(models.LocationAlert.family_id == family_id)
        .order_by(models.LocationAlert.created_at.desc())
        .limit(limit)
        .all()
    )


# --- Events (Calendar) ---
@app.post("/events", response_model=schemas.EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    event: schemas.EventCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, event.family_id)

    owner = get_user_or_404(db, event.user_id)
    if owner.family_id != event.family_id:
        raise HTTPException(
            status_code=400, detail="Владелец события должен быть членом этой семьи"
        )
    if current_user.id != owner.id and current_user.role != models.ROLE_PARENT:
        raise HTTPException(
            status_code=403, detail="Можно добавлять события только в свой календарь"
        )

    candidate = build_event_candidate(
        title=event.title,
        description=event.description,
        start_time=event.start_time,
        end_time=event.end_time,
        category=event.category,
        recurrence=event.recurrence,
        recurrence_day=event.recurrence_day,
        recurrence_until=event.recurrence_until,
        user_id=event.user_id,
        family_id=event.family_id,
    )
    validate_recurrence_day(candidate.recurrence, candidate.recurrence_day)

    existing = find_event_overlap(db, candidate)
    if existing is not None:
        raise conflict_error(existing)

    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    hub.notify(candidate.family_id, "events")

    if candidate.user_id != current_user.id:
        background_tasks.add_task(
            send_push_to_users,
            [candidate.user_id],
            "Новое событие в календаре",
            f"{current_user.name}: {candidate.title}",
            {"screen": "calendar", "eventId": candidate.id},
        )

    return candidate


@app.get("/users/{user_id}/events", response_model=List[schemas.EventResponse])
def get_user_events(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_user = get_user_or_404(db, user_id)
    if current_user.id != user_id:
        require_same_family(current_user, db_user)
    return db.query(models.Event).filter(models.Event.user_id == user_id).all()


@app.get("/families/{family_id}/events", response_model=List[schemas.EventResponse])
def get_family_events(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return db.query(models.Event).filter(models.Event.family_id == family_id).all()


@app.patch("/events/{event_id}", response_model=schemas.EventResponse)
def update_event(
    event_id: int,
    update: schemas.EventUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_event = db.get(models.Event, event_id)
    if db_event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")

    require_family_membership(current_user, db_event.family_id)
    require_owner_or_parent(current_user, db_event.user_id, "изменить")

    data = update.model_dump(exclude_unset=True)

    start = ensure_utc_naive(data.get("start_time", db_event.start_time))
    end = ensure_utc_naive(data.get("end_time", db_event.end_time))
    if end <= start:
        raise HTTPException(
            status_code=422, detail="Время окончания должно быть позже времени начала"
        )

    recurrence = data.get("recurrence", db_event.recurrence)
    recurrence_day = data.get("recurrence_day", db_event.recurrence_day)
    recurrence_until = data.get("recurrence_until", db_event.recurrence_until)
    validate_recurrence_day(recurrence, recurrence_day)

    if recurrence == models.RECURRENCE_NONE:
        recurrence_until = None
    elif recurrence_until is not None and recurrence_until < start.date():
        raise HTTPException(
            status_code=422,
            detail="Дата окончания серии не может быть раньше начала",
        )

    candidate = build_event_candidate(
        title=data.get("title", db_event.title),
        description=data.get("description", db_event.description),
        start_time=start,
        end_time=end,
        category=data.get("category", db_event.category),
        recurrence=recurrence,
        recurrence_day=recurrence_day,
        recurrence_until=recurrence_until,
        user_id=db_event.user_id,
        family_id=db_event.family_id,
    )

    existing = find_event_overlap(db, candidate, exclude_event_id=db_event.id)
    if existing is not None:
        raise conflict_error(existing)

    db_event.title = candidate.title
    db_event.description = candidate.description
    db_event.start_time = candidate.start_time
    db_event.end_time = candidate.end_time
    db_event.category = candidate.category
    db_event.recurrence = candidate.recurrence
    db_event.recurrence_day = candidate.recurrence_day
    db_event.recurrence_until = candidate.recurrence_until

    db.commit()
    db.refresh(db_event)
    hub.notify(db_event.family_id, "events")
    return db_event


@app.delete("/events/{event_id}", status_code=204)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_event = db.get(models.Event, event_id)
    if not db_event:
        raise HTTPException(status_code=404, detail="Событие не найдено")

    require_family_membership(current_user, db_event.family_id)
    require_owner_or_parent(current_user, db_event.user_id, "удалить")
    family_id = db_event.family_id
    db.delete(db_event)
    db.commit()
    hub.notify(family_id, "events")
    return None


# --- Tasks (Kanban) ---
@app.post("/tasks", response_model=schemas.TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    task: schemas.TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_parent),
):
    require_family_membership(current_user, task.family_id)

    if task.created_by_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Создателем задачи может быть только вы"
        )

    if task.assigned_to_id is not None:
        assignee = get_user_or_404(db, task.assigned_to_id)
        if assignee.family_id != task.family_id:
            raise HTTPException(
                status_code=400, detail="Исполнитель должен быть членом вашей семьи"
            )

    db_task = models.Task(
        title=task.title,
        description=task.description,
        reward_coins=task.reward_coins,
        status=task.status,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        family_id=task.family_id,
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    hub.notify(db_task.family_id, "tasks")

    if db_task.assigned_to_id and db_task.assigned_to_id != current_user.id:
        background_tasks.add_task(
            send_push_to_users,
            [db_task.assigned_to_id],
            "Новая задача",
            f"{current_user.name}: {db_task.title}",
            {"screen": "tasks", "taskId": db_task.id},
        )

    return db_task


@app.get("/families/{family_id}/tasks", response_model=List[schemas.TaskResponse])
def get_family_tasks(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return db.query(models.Task).filter(models.Task.family_id == family_id).all()


@app.patch("/tasks/{task_id}", response_model=schemas.TaskResponse)
def update_task(
    task_id: int,
    update: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_task = db.get(models.Task, task_id)
    if db_task is None:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    require_family_membership(current_user, db_task.family_id)
    require_owner_or_parent(current_user, db_task.created_by_id, "изменить")

    data = update.model_dump(exclude_unset=True)

    if "assigned_to_id" in data and data["assigned_to_id"] is not None:
        assignee = get_user_or_404(db, data["assigned_to_id"])
        if assignee.family_id != db_task.family_id:
            raise HTTPException(
                status_code=400, detail="Исполнитель должен быть членом вашей семьи"
            )

    for field, value in data.items():
        setattr(db_task, field, value)

    db.commit()
    db.refresh(db_task)
    hub.notify(db_task.family_id, "tasks")
    return db_task


@app.put("/tasks/{task_id}/status", response_model=schemas.TaskResponse)
def update_task_status(
    task_id: int,
    update: schemas.TaskUpdateStatus,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_task = db.get(models.Task, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    require_family_membership(current_user, db_task.family_id)
    if (
        current_user.id not in (db_task.assigned_to_id, db_task.created_by_id)
        and current_user.role != models.ROLE_PARENT
    ):
        raise HTTPException(
            status_code=403, detail="Недостаточно прав для изменения этой задачи"
        )

    old_status = db_task.status
    new_status = update.status

    db_task.status = new_status

    if db_task.assigned_to_id:
        user = db.get(models.User, db_task.assigned_to_id)
        if user:
            # Completing a task awards coins; reopening it revokes them.
            if old_status != models.TASK_DONE and new_status == models.TASK_DONE:
                apply_coin_change(
                    db,
                    user,
                    db_task.reward_coins,
                    models.COIN_REASON_TASK_DONE,
                    task_id=db_task.id,
                )
            elif old_status == models.TASK_DONE and new_status != models.TASK_DONE:
                apply_coin_change(
                    db,
                    user,
                    -db_task.reward_coins,
                    models.COIN_REASON_TASK_REOPENED,
                    task_id=db_task.id,
                )

    db.commit()
    db.refresh(db_task)
    hub.notify(db_task.family_id, "tasks")

    if (
        new_status == models.TASK_DONE
        and old_status != models.TASK_DONE
        and db_task.created_by_id != current_user.id
    ):
        background_tasks.add_task(
            send_push_to_users,
            [db_task.created_by_id],
            "Задача выполнена",
            f"{current_user.name}: {db_task.title} (+{db_task.reward_coins} 🪙)",
            {"screen": "tasks", "taskId": db_task.id},
        )

    return db_task


@app.delete("/tasks/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_task = db.get(models.Task, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    require_family_membership(current_user, db_task.family_id)
    require_owner_or_parent(current_user, db_task.created_by_id, "удалить")
    family_id = db_task.family_id
    db.delete(db_task)
    db.commit()
    hub.notify(family_id, "tasks")
    return None


# --- Expenses (Finance) ---
@app.post(
    "/expenses",
    response_model=schemas.ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_expense(
    expense: schemas.ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, expense.family_id)

    if expense.user_id != current_user.id:
        owner = get_user_or_404(db, expense.user_id)
        if current_user.role != models.ROLE_PARENT:
            raise HTTPException(
                status_code=403, detail="Можно добавлять только собственные расходы"
            )
        if owner.family_id != expense.family_id:
            raise HTTPException(
                status_code=400, detail="Пользователь должен быть членом вашей семьи"
            )

    db_expense = models.Expense(
        title=expense.title,
        amount=expense.amount,
        category=expense.category,
        user_id=expense.user_id,
        family_id=expense.family_id,
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    hub.notify(db_expense.family_id, "expenses")
    return db_expense


@app.get("/families/{family_id}/expenses", response_model=List[schemas.ExpenseResponse])
def get_family_expenses(
    family_id: int,
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    category: Optional[str] = Query(default=None, max_length=60),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    return filtered_expenses(db, family_id, date_from, date_to, category).all()


@app.patch("/expenses/{expense_id}", response_model=schemas.ExpenseResponse)
def update_expense(
    expense_id: int,
    update: schemas.ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_expense = db.get(models.Expense, expense_id)
    if db_expense is None:
        raise HTTPException(status_code=404, detail="Расход не найден")

    require_family_membership(current_user, db_expense.family_id)
    require_owner_or_parent(current_user, db_expense.user_id, "изменить")

    data = update.model_dump(exclude_unset=True)
    if "date" in data and data["date"] is not None:
        data["date"] = ensure_utc_naive(data["date"])

    for field, value in data.items():
        setattr(db_expense, field, value)

    db.commit()
    db.refresh(db_expense)
    hub.notify(db_expense.family_id, "expenses")
    return db_expense


@app.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_expense = db.get(models.Expense, expense_id)
    if db_expense is None:
        raise HTTPException(status_code=404, detail="Расход не найден")

    require_family_membership(current_user, db_expense.family_id)
    require_owner_or_parent(current_user, db_expense.user_id, "удалить")
    family_id = db_expense.family_id
    db.delete(db_expense)
    db.commit()
    hub.notify(family_id, "expenses")
    return None


@app.get("/families/{family_id}/expenses/summary", response_model=Dict[str, float])
def get_family_expenses_summary(
    family_id: int,
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_family_membership(current_user, family_id)
    expenses = filtered_expenses(db, family_id, date_from, date_to).all()
    summary: Dict[str, float] = {}
    for exp in expenses:
        summary[exp.category] = summary.get(exp.category, 0.0) + exp.amount
    return summary


# --- Live updates (WebSocket) ---
@app.websocket("/ws/families/{family_id}")
async def family_updates(
    websocket: WebSocket,
    family_id: int,
    token: str = Query(default=""),
    db: Session = Depends(get_db),
):
    """Push a short notification whenever family data changes.

    The access token is passed as a query parameter because the native
    WebSocket API cannot attach an ``Authorization`` header.
    """
    await websocket.accept()

    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        await websocket.close(code=4401)
        return

    user = db.get(models.User, user_id)
    authorized = user is not None and user.family_id == family_id
    # Release the database connection before the long-lived receive loop.
    db.close()

    if not authorized:
        await websocket.close(code=4403)
        return

    await hub.connect(family_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(family_id, websocket)
