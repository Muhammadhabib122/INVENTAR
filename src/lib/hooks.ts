'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './client';

/** Oddiy GET yuklovchi. intervalMs berilsa, ma'lumotni muntazam yangilab turadi. */
export function useFetch<T>(url: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!url);
  const cur = useRef(url);
  cur.current = url;
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const d = await apiFetch<T>(url);
      if (cur.current === url) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (cur.current === url) setError(e);
    } finally {
      if (cur.current === url) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    setLoading(!!url);
    setData(null);
    reload();
    if (!intervalMs || !url) return;
    const iv = setInterval(() => document.visibilityState === 'visible' && reload(), intervalMs);
    return () => clearInterval(iv);
  }, [url, intervalMs, reload]);
  return { data, error, loading, reload, setData };
}
