'use client';
// Bo'lim ma'lumotlari: buyumlar ro'yxati (telefonda keshlanadi) va joriy holat (har 3 soniyada yangilanadi).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from './client';
import { useSync } from './sync';
import type { SectionState } from '@/server/state';

export type Item = { inv: string; name: string; unit: string; mol: string; dept: string; sum: number; delisted: boolean };
export type State = Omit<SectionState, 'founds' | 'extras' | 'dups' | 'noInv' | 'pending' | 'elsewhere' | 'rooms' | 'doneAt'> & {
  doneAt: string | null;
  rooms: { id: string; name: string; status: 'IN_PROGRESS' | 'DONE'; doneAt: string | null; doneById: string | null }[];
  founds: { id: string; inv: string; roomId: string; userId: string; at: string; source: string }[];
  extras: { id: string; inv: string; kind: 'NOT_IN_DB' | 'OTHER_SECTION'; otherSectionId: string | null; otherSection: string; roomId: string; userId: string; at: string }[];
  dups: { id: string; inv: string; roomId: string; userId: string; at: string }[];
  noInv: { id: string; roomId: string; name: string; qty: number; condition: 'GOOD' | 'FAIR' | 'BAD' | 'REPAIR'; note: string; userId: string; at: string }[];
  pending: { id: string; inv: string; roomId: string; userId: string; at: string; reason: 'OTHER_ROOM' | 'OTHER_SECTION' | 'NOT_IN_DB' | 'LOCKED'; info: Record<string, any> }[];
  elsewhere: { inv: string; sectionId: string; sectionName: string; buildingName: string; room: string; userId: string; at: string }[];
};

export const POLL_MS = 3000;

export function useSectionData(sectionId: string, opts: { items?: boolean; poll?: boolean } = {}) {
  const wantItems = opts.items !== false;
  const { kv, onApplied } = useSync();
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [stale, setStale] = useState(false);
  const rev = useRef<number | undefined>(undefined);
  const cur = useRef(sectionId);
  cur.current = sectionId;

  const loadState = useCallback(async () => {
    if (!sectionId) return;
    try {
      const r = await apiFetch<State | { rev: number; same: true }>(`/api/sections/${sectionId}/state` + (rev.current !== undefined ? '?rev=' + rev.current : ''));
      if (cur.current !== sectionId) return;
      setStale(false);
      if ('same' in r && r.same) return;
      rev.current = r.rev;
      setState(r as State);
      kv.set('state:' + sectionId, r);
    } catch (e) {
      if (cur.current !== sectionId) return;
      setStale(true);
      if (!state) {
        const c = await kv.get<State>('state:' + sectionId);
        if (c) setState(c);
      }
    }
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadItems = useCallback(async () => {
    if (!sectionId || !wantItems) return;
    const cached = await kv.get<Item[]>('items:' + sectionId);
    if (cached && cur.current === sectionId) setItems(cached);
    try {
      const r = await apiFetch<Item[]>(`/api/sections/${sectionId}/items`);
      if (cur.current !== sectionId) return;
      setItems(r);
      kv.set('items:' + sectionId, r);
    } catch {}
  }, [sectionId, wantItems]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    rev.current = undefined;
    setState(null);
    setItems(null);
    if (!sectionId) return;
    loadItems();
    loadState();
    const off = onApplied(() => loadState());
    let iv: ReturnType<typeof setInterval> | undefined;
    if (opts.poll !== false) iv = setInterval(() => document.visibilityState === 'visible' && loadState(), POLL_MS);
    return () => {
      off();
      if (iv) clearInterval(iv);
    };
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemMap = useMemo(() => new Map((items || []).map((x) => [x.inv, x])), [items]);
  const foundMap = useMemo(() => new Map((state?.founds || []).map((f) => [f.inv, f])), [state]);
  const roomById = useMemo(() => new Map((state?.rooms || []).map((r) => [r.id, r])), [state]);
  const uname = useCallback((id: string | null | undefined) => (id && state?.users[id]) || '', [state]);
  return { items, state, stale, itemMap, foundMap, roomById, uname, reload: loadState, reloadItems: loadItems };
}
