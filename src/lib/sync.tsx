'use client';
// Offline navbat: har bir skan avval telefon xotirasiga (IndexedDB) yoziladi, keyin serverga yuboriladi.
// Server javob bermaguncha yozuv navbatdan o'chirilmaydi. Har bir amalning o'z ID'si bor —
// qayta yuborilsa ham server uni ikki marta yozmaydi.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { idb } from './idb';

export type Op = { id: string; type: string; payload: Record<string, unknown>; createdAt: number; tries?: number };
export type OpResult = { status: string; [k: string]: unknown };

type Ctx = {
  pending: number;
  failed: number;
  online: boolean;
  /** Amalni navbatga yozadi va natijani kutadi. Internet bo'lmasa {status:'queued'} qaytadi. */
  submit: (type: string, payload: Record<string, unknown>, waitMs?: number) => Promise<OpResult>;
  flush: () => Promise<void>;
  failedOps: () => Promise<(Op & { result: OpResult })[]>;
  dropFailed: (id: string) => Promise<void>;
  /** Navbatdagi amallar (masalan, offline skanlarni ko'rsatish uchun) */
  queued: () => Promise<Op[]>;
  /** server tasdiqlagan har bir amaldan keyin chaqiriladi */
  onApplied: (fn: () => void) => () => void;
  kv: { get: <T>(k: string) => Promise<T | undefined>; set: (k: string, v: unknown) => Promise<void> };
};

const C = createContext<Ctx | null>(null);
export const useSync = () => {
  const c = useContext(C);
  if (!c) throw new Error('SyncProvider');
  return c;
};

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

export function SyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const db = useMemo(() => (typeof window === 'undefined' ? null : idb('inventar-' + userId)), [userId]);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [online, setOnline] = useState(true);
  const waiters = useRef(new Map<string, (r: OpResult) => void>());
  const applied = useRef(new Set<() => void>());
  const busy = useRef<Promise<void> | null>(null);

  const recount = useCallback(async () => {
    if (!db) return;
    setPending(await db.count('ops'));
    setFailed(await db.count('failed'));
  }, [db]);

  const doFlush = useCallback(async () => {
    if (!db) return;
    let ops = (await db.all<Op>('ops')).sort((a, b) => a.createdAt - b.createdAt);
    while (ops.length) {
      const batch = ops.slice(0, 50);
      let res: Response;
      const ac = new AbortController();
      const tm = setTimeout(() => ac.abort(), 20000);
      try {
        res = await fetch('/api/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: batch }), credentials: 'same-origin', cache: 'no-store', signal: ac.signal });
      } catch {
        setOnline(false);
        return;
      } finally {
        clearTimeout(tm);
      }
      if (res.status === 401) {
        setOnline(true);
        return; // sessiya tugagan — qayta kirgach yuboriladi, navbat saqlanib turadi
      }
      if (!res.ok) {
        setOnline(navigator.onLine);
        return;
      }
      setOnline(true);
      const data = (await res.json()) as { results: { id: string; result: OpResult; final: boolean }[] };
      for (const r of data.results) {
        if (!r.final) continue; // server vaqtincha qabul qila olmadi — keyin qayta
        const op = batch.find((o) => o.id === r.id);
        if (r.result.status === 'rejected' && op) await db.put('failed', { ...op, result: r.result });
        await db.del('ops', r.id);
        waiters.current.get(r.id)?.(r.result);
        waiters.current.delete(r.id);
      }
      applied.current.forEach((f) => f());
      await recount();
      const done = new Set(data.results.filter((r) => r.final).map((r) => r.id));
      if (!batch.some((o) => done.has(o.id))) return;
      ops = (await db.all<Op>('ops')).sort((a, b) => a.createdAt - b.createdAt);
    }
  }, [db, recount]);

  const flush = useCallback(async () => {
    while (busy.current) await busy.current;
    busy.current = doFlush().finally(() => (busy.current = null));
    return busy.current;
  }, [doFlush]);

  const submit = useCallback(
    async (type: string, payload: Record<string, unknown>, waitMs = 8000): Promise<OpResult> => {
      if (!db) throw new Error('no db');
      const op: Op = { id: uid(), type, payload, createdAt: Date.now() };
      await db.put('ops', op); // avval telefonga yozamiz
      await recount();
      let done: OpResult | null = null;
      const p = new Promise<OpResult>((res) =>
        waiters.current.set(op.id, (r) => {
          done = r;
          res(r);
        }),
      );
      const queuedRes: OpResult = { status: 'queued', opId: op.id };
      // yuborishga urinamiz; javob kelmasa — darhol "navbatda" deymiz (yozuv telefonda saqlangan)
      const attempt = flush().then(() => done ?? queuedRes);
      const timeout = new Promise<OpResult>((res) => setTimeout(() => res(done ?? queuedRes), waitMs));
      p.catch(() => {});
      return Promise.race([attempt, timeout]);
    },
    [db, flush, recount],
  );

  useEffect(() => {
    if (!db) return;
    recount();
    flush();
    const on = () => {
      setOnline(true);
      flush();
    };
    const off = () => setOnline(false);
    const vis = () => document.visibilityState === 'visible' && flush();
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    const iv = setInterval(async () => {
      if ((await db.count('ops')) > 0) flush();
    }, 5000);
    try {
      navigator.storage?.persist?.();
    } catch {}
    const unload = (e: BeforeUnloadEvent) => {
      if (pendingRef.current > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('beforeunload', unload);
      clearInterval(iv);
    };
  }, [db, flush, recount]);

  const pendingRef = useRef(0);
  pendingRef.current = pending;

  const v = useMemo<Ctx>(
    () => ({
      pending,
      failed,
      online,
      submit,
      flush,
      failedOps: async () => (db ? db.all('failed') : []),
      dropFailed: async (id) => {
        await db?.del('failed', id);
        await recount();
      },
      queued: async () => (db ? (await db.all<Op>('ops')).sort((a, b) => a.createdAt - b.createdAt) : []),
      onApplied: (fn) => {
        applied.current.add(fn);
        return () => applied.current.delete(fn);
      },
      kv: {
        get: async <T,>(k: string) => (db ? db.get<T>('kv', k) : undefined),
        set: async (k: string, val: unknown) => {
          await db?.put('kv', val, k);
        },
      },
    }),
    [pending, failed, online, submit, flush, db, recount],
  );
  return <C.Provider value={v}>{children}</C.Provider>;
}
