"""Remote push delivery through the Expo Push API.

Tokens are stored per device in ``push_subscriptions``. Sending is best-effort:
failures never break the API request that triggered them, and tokens reported
as ``DeviceNotRegistered`` are deactivated.
"""

import logging
from typing import Dict, Iterable, Optional

import httpx
from sqlalchemy.orm import Session

import models
from config import settings
from database import SessionLocal

logger = logging.getLogger("familycrm.push")

MAX_BATCH = 100


def send_push_to_users(
    user_ids: Iterable[int],
    title: str,
    body: str,
    data: Optional[Dict] = None,
    db: Optional[Session] = None,
) -> int:
    """Send one notification to every active device of the given users.

    Returns the number of messages handed to Expo. Runs with its own session
    by default (safe to call from a FastAPI background task).
    """
    if not settings.push_enabled:
        return 0

    ids = sorted({int(user_id) for user_id in user_ids if user_id})
    if not ids:
        return 0

    own_session = db is None
    session = db or SessionLocal()
    try:
        subscriptions = (
            session.query(models.PushSubscription)
            .filter(
                models.PushSubscription.user_id.in_(ids),
                models.PushSubscription.active.is_(True),
            )
            .all()
        )
        if not subscriptions:
            return 0

        # One token must receive one message even if it was registered twice.
        unique: Dict[str, models.PushSubscription] = {}
        for subscription in subscriptions:
            unique[subscription.token] = subscription
        pairs = list(unique.items())

        sent = 0
        deactivated = False

        for start in range(0, len(pairs), MAX_BATCH):
            chunk = pairs[start : start + MAX_BATCH]
            messages = [
                {
                    "to": token,
                    "title": title,
                    "body": body,
                    "sound": "default",
                    "data": data or {},
                }
                for token, _ in chunk
            ]

            try:
                response = httpx.post(
                    settings.expo_push_url,
                    json=messages,
                    timeout=10,
                )
                response.raise_for_status()
                results = response.json().get("data", [])
            except Exception as exc:  # network/API failure must not break business logic
                logger.warning("Expo push request failed: %s", exc)
                continue

            for (token, subscription), result in zip(chunk, results):
                if result.get("status") != "error":
                    continue
                details = result.get("details") or {}
                if details.get("error") == "DeviceNotRegistered":
                    subscription.active = False
                    deactivated = True
                logger.info(
                    "Push to ...%s failed: %s", token[-8:], details or result
                )

            sent += len(chunk)

        if deactivated:
            session.commit()
        return sent
    finally:
        if own_session:
            session.close()
