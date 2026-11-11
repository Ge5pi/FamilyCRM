import { useEffect, useRef } from 'react';

import { API_URL, getAuthToken } from './api';

/**
 * Subscribes to family updates over WebSocket.
 *
 * The server pushes a short message whenever family data changes; the app can
 * then refresh only the affected data. Reconnects with capped backoff.
 */
export default function useFamilyRealtime(familyId, onUpdate) {
  const handlerRef = useRef(onUpdate);
  handlerRef.current = onUpdate;

  useEffect(() => {
    if (!familyId) return undefined;

    let socket = null;
    let closed = false;
    let retries = 0;
    let retryTimer = null;
    let pingTimer = null;

    const connect = () => {
      const token = getAuthToken();
      if (!token || closed) return;

      const wsBase = API_URL.replace(/^http/, 'ws');
      const url = `${wsBase}/ws/families/${familyId}?token=${encodeURIComponent(token)}`;
      socket = new WebSocket(url);

      socket.onopen = () => {
        retries = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handlerRef.current?.(payload);
        } catch (error) {
          // Ignore malformed frames.
        }
      };

      socket.onclose = () => {
        if (closed) return;
        retries = Math.min(retries + 1, 6);
        retryTimer = setTimeout(connect, 400 * retries);
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch (error) {
          // ignore
        }
      };

      pingTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send('ping');
        }
      }, 25000);
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      try {
        socket?.close();
      } catch (error) {
        // ignore
      }
    };
  }, [familyId]);
}
