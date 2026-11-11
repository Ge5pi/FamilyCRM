/**
 * Expo remote push registration.
 *
 * Remote push requires a development build (Expo Go does not support it since
 * SDK 53) and an EAS project id. The token is stored locally and re-registered
 * with the backend on every login so a stale database can recover.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

export function getEasProjectId() {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    throw new Error('Push-уведомления недоступны в веб-версии');
  }
  if (!Device.isDevice) {
    throw new Error('Push работает только на реальном устройстве');
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    throw new Error(
      'Не настроен EAS projectId. Укажите EXPO_PUBLIC_EAS_PROJECT_ID и соберите development build — в Expo Go удалённый push не работает.'
    );
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    throw new Error('Разрешите уведомления в настройках устройства');
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
