/**
 * Central API client.
 *
 * - One place for the base URL (EXPO_PUBLIC_API_URL, see .env.example).
 * - Attaches the JWT access token to every request.
 * - Normalises errors into ApiError so screens can show real messages.
 */

const DEFAULT_API_URL = 'http://127.0.0.1:8000';
const REQUEST_TIMEOUT_MS = 15000;

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(
  /\/+$/,
  ''
);

let authToken = null;
let unauthorizedHandler = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
}

/** Register a callback invoked whenever the backend answers 401. */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function extractDetail(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => item.msg || String(item)).join('; ');
  }
  return fallback;
}

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller ? controller.signal : undefined,
    });

    if (response.status === 401 && unauthorizedHandler) {
      unauthorizedHandler();
    }

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        // Response had no JSON body (e.g. a proxy error page).
      }
      const message = extractDetail(
        payload,
        `Ошибка запроса (${response.status})`
      );
      throw new ApiError(message, response.status, message);
    }

    if (response.status === 204) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error && error.name === 'AbortError') {
      throw new ApiError('Сервер не ответил вовремя. Попробуйте ещё раз.', 0, 'timeout');
    }
    throw new ApiError(
      'Не удалось связаться с сервером. Проверьте подключение.',
      0,
      error ? error.message : null
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
};

export default api;
