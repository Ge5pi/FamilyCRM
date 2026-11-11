"""Recurring event helpers.

Recurrence is defined on the event itself:

* ``none``    — a single occurrence at ``start_time``
* ``daily``   — every day at the same time
* ``weekly``  — every week on ``recurrence_day`` (ISO weekday, Mon=0..Sun=6)
* ``monthly`` — every month on ``recurrence_day`` (1..31, clamped to the last
  day of shorter months)

Series are open-ended. Overlap detection expands occurrences inside a bounded
horizon, which is enough to decide whether two schedules can ever collide.
"""

from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Iterator, Tuple

from models import (
    RECURRENCE_DAILY,
    RECURRENCE_MONTHLY,
    RECURRENCE_NONE,
    RECURRENCE_WEEKLY,
)

# How far ahead two recurring series are compared.
OVERLAP_HORIZON_DAYS = 366
# Safety cap for pathological schedules.
MAX_OCCURRENCES = 1000


def event_occurs_on(event, day: date) -> bool:
    """Return True when ``event`` has an occurrence on the given date."""
    start_day = event.start_time.date()
    if day < start_day:
        return False

    recurrence = event.recurrence or RECURRENCE_NONE
    until = getattr(event, "recurrence_until", None)

    if recurrence == RECURRENCE_NONE:
        return day == start_day

    if until is not None and day > until:
        return False

    if recurrence == RECURRENCE_DAILY:
        return True

    if recurrence == RECURRENCE_WEEKLY:
        weekday = (
            event.recurrence_day if event.recurrence_day is not None else start_day.weekday()
        )
        return day.weekday() == weekday

    if recurrence == RECURRENCE_MONTHLY:
        target_day = event.recurrence_day or start_day.day
        last_day = monthrange(day.year, day.month)[1]
        return day.day == min(target_day, last_day)

    # Unknown value: behave like a one-off rather than dropping the event.
    return day == start_day


def occurrence_window(event, day: date) -> Tuple[datetime, datetime]:
    """Start/end datetimes of the occurrence that falls on ``day``."""
    duration = event.end_time - event.start_time
    start = datetime.combine(day, event.start_time.time())
    return start, start + duration


def iter_occurrence_days(
    event, window_start: date, window_end: date
) -> Iterator[date]:
    """Yield dates inside the window on which the event occurs."""
    if window_end < window_start:
        return
    day = window_start
    emitted = 0
    while day <= window_end and emitted < MAX_OCCURRENCES:
        if event_occurs_on(event, day):
            yield day
            emitted += 1
        day += timedelta(days=1)


def events_overlap(a, b, horizon_days: int = OVERLAP_HORIZON_DAYS) -> bool:
    """Return True if two events ever occupy overlapping time."""
    a_rec = a.recurrence or RECURRENCE_NONE
    b_rec = b.recurrence or RECURRENCE_NONE

    if a_rec == RECURRENCE_NONE and b_rec == RECURRENCE_NONE:
        return a.start_time < b.end_time and a.end_time > b.start_time

    # One-off vs recurring: only the date of the one-off matters.
    if a_rec == RECURRENCE_NONE:
        day = a.start_time.date()
        if not event_occurs_on(b, day):
            return False
        b_start, b_end = occurrence_window(b, day)
        return a.start_time < b_end and a.end_time > b_start

    if b_rec == RECURRENCE_NONE:
        day = b.start_time.date()
        if not event_occurs_on(a, day):
            return False
        a_start, a_end = occurrence_window(a, day)
        return a_start < b.end_time and a_end > b.start_time

    # Both recurring: compare occurrences over a shared horizon.
    window_start = max(a.start_time.date(), b.start_time.date())
    window_end = window_start + timedelta(days=horizon_days)

    checked = 0
    for day in iter_occurrence_days(a, window_start, window_end):
        if checked >= MAX_OCCURRENCES:
            break
        checked += 1
        if not event_occurs_on(b, day):
            continue
        a_start, a_end = occurrence_window(a, day)
        b_start, b_end = occurrence_window(b, day)
        if a_start < b_end and a_end > b_start:
            return True

    return False


def default_recurrence_day(recurrence: str, start: datetime) -> int:
    """Pick the natural ``recurrence_day`` for a weekly/monthly series."""
    if recurrence == RECURRENCE_WEEKLY:
        return start.weekday()
    if recurrence == RECURRENCE_MONTHLY:
        return start.day
    return 0
