/**
 * Date and time helpers.
 *
 * The API exchanges ISO-8601 timestamps in UTC; the UI works with the device's
 * local time. Recurrence rules are evaluated in local time so that "09:00
 * every Monday" stays 09:00 for the user.
 */

export const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Разовое' },
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'monthly', label: 'Ежемесячно' },
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

/** Local calendar date as YYYY-MM-DD (never shifts through UTC). */
export function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convert a local date + HH:MM into an ISO-8601 UTC string. */
export function toUtcIso(dateKey, timeString) {
  if (!ISO_DATE_RE.test(dateKey)) {
    throw new Error(`Некорректная дата: ${dateKey}`);
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = String(timeString).split(':').map(Number);
  const date = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  return date.toISOString();
}

/**
 * Parse an API timestamp. Values without a timezone are treated as UTC, which
 * matches how the backend stores them.
 */
export function parseApiDate(value) {
  if (!value) return null;
  const normalised = HAS_ZONE_RE.test(value) ? value : `${value}Z`;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value) {
  const date = parseApiDate(value);
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value) {
  const date = parseApiDate(value);
  if (!date) return '';
  return date.toLocaleDateString();
}

/** ISO weekday: Monday = 0, Sunday = 6. */
export function isoWeekday(date) {
  return (date.getDay() + 6) % 7;
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** True when a recurring event has an occurrence on the given local date. */
export function eventOccursOn(event, date) {
  const start = parseApiDate(event.start_time);
  if (!start) return false;

  const targetKey = toLocalDateKey(date);
  const startKey = toLocalDateKey(start);
  if (targetKey < startKey) return false;

  const recurrence = event.recurrence || 'none';

  if (recurrence === 'none') return targetKey === startKey;
  if (recurrence === 'daily') return true;
  if (recurrence === 'weekly') {
    const weekday =
      event.recurrence_day != null ? event.recurrence_day : isoWeekday(start);
    return isoWeekday(date) === weekday;
  }
  if (recurrence === 'monthly') {
    const dayOfMonth = event.recurrence_day || start.getDate();
    return date.getDate() === Math.min(dayOfMonth, daysInMonth(date.getFullYear(), date.getMonth()));
  }
  return targetKey === startKey;
}

export function recurrenceLabel(recurrence) {
  switch (recurrence) {
    case 'daily':
      return 'Ежедневно';
    case 'weekly':
      return 'Еженедельно';
    case 'monthly':
      return 'Ежемесячно';
    default:
      return '';
  }
}

/** HH:MM in local time, suitable for a text input. */
export function formatTimeInput(value) {
  const date = parseApiDate(value);
  if (!date) return '09:00';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 42 local dates (6 weeks, Monday first) covering the given month. */
export function monthMatrix(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - offset);
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
  );
}

export function monthTitle(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}
