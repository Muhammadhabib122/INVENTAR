'use client';
// Hozir ochiq bo'lim va xona. Boshqa bo'limga faqat aniq tanlov orqali o'tiladi (Bo'limlar sahifasi).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch } from './client';
import { useSync } from './sync';

export type SectionInfo = {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  originalFileName: string;
  status: 'ACTIVE' | 'DONE';
  canWork: boolean;
  importInfo: { dup?: number; conflicts?: { inv: string; names: string[] }[] };
  files: { id: string; fileName: string; uploadedAt: string; kind: string }[];
};

type Ctx = {
  sectionId: string;
  section: SectionInfo | null;
  room: string;
  setSection: (id: string) => void;
  setRoom: (r: string) => void;
  reloadSection: () => void;
};
const C = createContext<Ctx | null>(null);
export const useCurrent = () => {
  const c = useContext(C);
  if (!c) throw new Error('CurrentProvider');
  return c;
};

const read = () => {
  try {
    return JSON.parse(localStorage.getItem('inv_cur') || '{}') as { sectionId?: string; rooms?: Record<string, string> };
  } catch {
    return {};
  }
};

export function CurrentProvider({ children }: { children: ReactNode }) {
  const { kv } = useSync();
  const [sectionId, setSid] = useState('');
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [section, setSectionInfo] = useState<SectionInfo | null>(null);
  useEffect(() => {
    const s = read();
    setSid(s.sectionId || '');
    setRooms(s.rooms || {});
  }, []);
  const persist = (sid: string, r: Record<string, string>) => {
    try {
      localStorage.setItem('inv_cur', JSON.stringify({ sectionId: sid, rooms: r }));
    } catch {}
  };
  const load = useCallback(async () => {
    if (!sectionId) {
      setSectionInfo(null);
      return;
    }
    try {
      const s = await apiFetch<SectionInfo>('/api/sections/' + sectionId);
      setSectionInfo(s);
      kv.set('section:' + sectionId, s);
    } catch (e) {
      const cached = await kv.get<SectionInfo>('section:' + sectionId);
      if (cached && (e as { code?: string }).code === 'network') setSectionInfo(cached);
      else if ((e as { status?: number }).status === 404 || (e as { status?: number }).status === 403) {
        setSectionInfo(null);
        setSid('');
        persist('', rooms);
      } else if (cached) setSectionInfo(cached);
    }
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  const v = useMemo<Ctx>(
    () => ({
      sectionId,
      section: section && section.id === sectionId ? section : null,
      room: rooms[sectionId] || '',
      setSection: (id) => {
        setSid(id);
        persist(id, rooms);
      },
      setRoom: (r) => {
        const n = { ...rooms, [sectionId]: r };
        setRooms(n);
        persist(sectionId, n);
      },
      reloadSection: load,
    }),
    [sectionId, section, rooms, load],
  );
  return <C.Provider value={v}>{children}</C.Provider>;
}
