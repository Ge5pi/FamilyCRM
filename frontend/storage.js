/**
 * Persistent storage for the auth token.
 *
 * Native builds use the OS keychain/keystore via expo-secure-store; the web
 * development build falls back to localStorage.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'familycrm.access_token';

const isWeb = Platform.OS === 'web';

export async function saveToken(token) {
  if (!token) return;
  if (isWeb) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      // Storage can be unavailable in private mode; the session then lives
      // only until the page is reloaded.
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function loadToken() {
  if (isWeb) {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken() {
  if (isWeb) {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
