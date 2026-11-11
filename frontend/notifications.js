/**
 * Local event reminders.
 *
 * Remote push requires a development build (Expo Go no longer supports remote
 * push), so the app schedules local notifications for the next week instead.
 * Reminders are rescheduled whenever the family's events change.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { eventOccursOn, formatTime, parseApiDate } from './datetime';

const REMINDER_MINUTES = 15;
const HORIZON_DAYS = 7;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermission() {
  if (Platform.OS === 'web') return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Напоминания о событиях',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function cancelEventReminders() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Schedule a reminder 15 minutes before every event occurrence in the next
 * week. Returns the number of scheduled notifications.
 */
export async function scheduleEventReminders(events, userId) {
  if (Platform.OS === 'web') return 0;

  const granted = await requestNotificationPermission();
  if (!granted) return 0;

  await ensureAndroidChannel();
  await cancelEventReminders();

  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 24 * 60 * 60 * 1000;
  let scheduled = 0;

  for (const event of events || []) {
    if (event.user_id !== userId) continue;

    const start = parseApiDate(event.start_time);
    if (!start) continue;

    for (let offset = 0; offset <= HORIZON_DAYS; offset += 1) {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      day.setHours(0, 0, 0, 0);
      if (!eventOccursOn(event, day)) continue;

      const occurrence = new Date(day);
      occurrence.setHours(start.getHours(), start.getMinutes(), 0, 0);

      const triggerAt = occurrence.getTime() - REMINDER_MINUTES * 60 * 1000;
      if (triggerAt <= now || triggerAt > horizon) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: `Начало в ${formatTime(event.start_time)}`,
          data: { eventId: event.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(triggerAt),
          channelId: Platform.OS === 'android' ? 'reminders' : undefined,
        },
      });
      scheduled += 1;
    }
  }

  return scheduled;
}
