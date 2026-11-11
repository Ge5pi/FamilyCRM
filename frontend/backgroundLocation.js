/**
 * Background location sharing.
 *
 * The task runs headlessly, so it re-reads the JWT and user id from secure
 * storage instead of relying on in-memory app state.
 */

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { api, setAuthToken } from './api';
import { loadToken, loadUserId } from './storage';

export const BACKGROUND_LOCATION_TASK = 'familycrm-background-location';

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;

    const locations = data.locations || [];
    const latest = locations[locations.length - 1];
    if (!latest) return;

    try {
      const [token, userId] = await Promise.all([loadToken(), loadUserId()]);
      if (!token || !userId) return;

      setAuthToken(token);
      await api.put(`/users/${userId}/location`, {
        latitude: latest.coords.latitude,
        longitude: latest.coords.longitude,
      });
    } catch (err) {
      // Background tasks must never throw: Android/iOS would stop them.
    }
  });
}

export async function isBackgroundTrackingActive() {
  if (Platform.OS === 'web') return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK
    );
  } catch (err) {
    return false;
  }
}

export async function startBackgroundTracking() {
  if (Platform.OS === 'web') {
    throw new Error('Фоновый трекинг недоступен в веб-версии');
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    throw new Error('Разрешите доступ к геолокации');
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    throw new Error(
      'Разрешите фоновую геолокацию («Всегда») в настройках устройства'
    );
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60000,
    distanceInterval: 100,
    deferredUpdatesInterval: 60000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'FamilyCRM',
      notificationBody: 'Геопозиция передаётся семье',
    },
  });
}

export async function stopBackgroundTracking() {
  if (Platform.OS === 'web') return;
  try {
    const active = await Location.hasStartedLocationUpdatesAsync(
      BACKGROUND_LOCATION_TASK
    );
    if (active) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (err) {
    // ignore: tracking was not running
  }
}
