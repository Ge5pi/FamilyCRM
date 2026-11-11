/**
 * Persistent storage for the auth token and small user preferences.
 *
 * Native builds use the OS keychain/keystore via expo-secure-store; the web
 * development build falls back to localStorage.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'familycrm.access_token';
const NOTIFICATIONS_KEY = 'familycrm.notifications_enabled';
const PUSH_TOKEN_KEY = 'familycrm.push_token';
const USER_ID_KEY = 'familycrm.user_id';

const isWeb = Platform.OS === 'web';

async function writeValue(key, value) {
  if (isWeb) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Storage can be unavailable in private mode; the value then lives
      // only until the page is reloaded.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function readValue(key) {
  if (isWeb) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function deleteValue(key) {
  if (isWeb) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveToken(token) {
  if (!token) return;
  await writeValue(TOKEN_KEY, token);
}

export async function loadToken() {
  return readValue(TOKEN_KEY);
}

export async function clearToken() {
  await deleteValue(TOKEN_KEY);
}

export async function saveNotificationsEnabled(enabled) {
  await writeValue(NOTIFICATIONS_KEY, enabled ? '1' : '0');
}

export async function loadNotificationsEnabled() {
  return (await readValue(NOTIFICATIONS_KEY)) === '1';
}


export async function savePushToken(token) {
  if (!token) {
    await deleteValue(PUSH_TOKEN_KEY);
    return;
  }
  await writeValue(PUSH_TOKEN_KEY, token);
}

export async function loadPushToken() {
  return readValue(PUSH_TOKEN_KEY);
}

export async function clearPushToken() {
  await deleteValue(PUSH_TOKEN_KEY);
}


export async function saveUserId(userId) {
  if (userId == null) {
    await deleteValue(USER_ID_KEY);
    return;
  }
  await writeValue(USER_ID_KEY, String(userId));
}

export async function loadUserId() {
  const value = await readValue(USER_ID_KEY);
  const userId = Number(value);
  return Number.isFinite(userId) && userId > 0 ? userId : null;
}
