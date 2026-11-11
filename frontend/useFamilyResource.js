import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { api } from './api';

/**
 * Load one family resource (events/tasks/expenses/...) for the current screen.
 *
 * - refetches when the screen regains focus;
 * - refetches when `refreshKey` changes (WebSocket updates / slow polling);
 * - ignores responses from stale requests.
 */
export default function useFamilyResource(path, { refreshKey = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;

    try {
      const result = await api.get(path);
      if (id !== requestId.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      if (err.status !== 401) {
        setError(err.message || 'Не удалось загрузить данные');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refreshKey])
  );

  return { data, loading, error, refresh: load };
}
