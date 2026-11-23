// Eski ilovalardagi "CSV tayyorlash" faylini tanlangan bo'limga ko'chirish.
// Ustunlar: Inventar raqam, Nomi, Birlik, Bo'lim, Summa, Holat, Vaqt, Joylashuv.
import type { PrismaClient, Condition, Prisma } from '@prisma/client';
import type { SessionUser } from './auth';
import { audit } from './audit';
import { bad, forbidden } from './errors';
import { getSectionChecked } from './sections';

export type LegacyRow = { inv: string; name: string; status: string; time: string; place: string };
export type LegacyKind = 'found' | 'missing' | 'extra' | 'dup' | 'noinv' | 'other' | 'unknown';
export type LegacyParsed = {
  kind: LegacyKind;
  inv: string;
  name: string;
  qty: number;
  condition: Condition;
  note: string;
  room: string;
  at: string; // ISO
  timeOk: boolean;
  line: number;
};

/** Oddiy CSV o'quvchi: qo'shtirnoq ichidagi vergul va qator ko'chishini to'g'ri tushunadi */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// lotin/kirill yozuvdagi qiymatlarni bir xil ko'rinishga keltirish
const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', ъ: "'", ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };
export const norm = (s: string) =>
  s
    .toLowerCase()
    .split('')
    .map((c) => CYR[c] ?? c)
    .join('')
    .replace(/[’ʻʼ‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

const COND: [string, Condition][] = [
  ["ta'mir", 'REPAIR'],
  ['yomon', 'BAD'],
  ["o'rtacha", 'FAIR'],
  ['yaxshi', 'GOOD'],
];

/**
 * Brauzerning toLocaleString() formatidagi vaqtni o'qish (Toshkent vaqti deb).
 * Qo'llab-quvvatlanadi: 23.11.2026, 10:15:30 | 23/11/2026, 10:15 | 11/23/2026, 10:15:30 AM |
 * 2026-11-23 10:15:30 | 2026-11-23T05:15:30.000Z. O'qib bo'lmasa — null.
 */
export function parseLegacyTime(s: string): Date | null {
  s = s.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})[,\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?/);
  if (!m) {
    const dOnly = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dOnly) return tash(+dOnly[3], +dOnly[2], +dOnly[1], 0, 0, 0);
    return null;
  }
  let [, a, b, c, hh, mi, ss, ap] = m;
  let y: number, mo: number, d: number;
  const sep = s.match(/^\d{1,4}([./-])/)![1];
  if (a.length === 4) {
    y = +a;
    mo = +b;
    d = +c;
  } else {
    y = +c;
    if (y < 100) y += 2000;
    const A = +a,
      B = +b;
    if (sep === '.') {
      d = A;
      mo = B;
    } else if (A > 12) {
      d = A;
      mo = B;
    } else if (B > 12) {
      mo = A;
      d = B;
    } else if (ap) {
      // AM/PM bor — Amerika formati (oy/kun/yil)
      mo = A;
      d = B;
    } else {
      // O'zbekistonda brauzerlar odatda kun/oy/yil yozadi
      d = A;
      mo = B;
    }
  }
  let H = +hh;
  if (ap) {
    const pm = /p/i.test(ap);
    if (pm && H < 12) H += 12;
    if (!pm && H === 12) H = 0;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || H > 23 || +mi > 59) return null;
  return tash(y, mo, d, H, +mi, +(ss || 0));
}
const tash = (y: number, mo: number, d: number, h: number, mi: number, s: number) => new Date(Date.UTC(y, mo - 1, d, h - 5, mi, s));

const HEAD: Record<string, string[]> = {
  inv: ['inventar raqam', 'inventar'],
  name: ['nomi'],
  status: ['holat'],
  time: ['vaqt'],
  place: ['joylashuv', 'joy'],
};

export function parseLegacy(text: string, now = new Date()): { rows: LegacyParsed[]; badTimes: number; headerOk: boolean } {
  const all = parseCsv(text);
  if (!all.length) return { rows: [], badTimes: 0, headerOk: false };
  const h = all[0].map(norm);
  const idx = (k: string) => h.findIndex((x) => HEAD[k].some((n) => x === n || x.startsWith(n)));
  let col = { inv: idx('inv'), name: idx('name'), status: idx('status'), time: idx('time'), place: idx('place') };
  const headerOk = col.inv >= 0 && col.status >= 0;
  if (!headerOk) col = { inv: 0, name: 1, status: 5, time: 6, place: 7 };
  const body = headerOk ? all.slice(1) : all;
  let badTimes = 0;
  const rows = body.map((r, i): LegacyParsed => {
    const get = (c: number) => (c >= 0 ? (r[c] ?? '').trim() : '');
    const st = norm(get(col.status));
    const place = get(col.place);
    const room = (place.includes(' / ') ? place.split(' / ').pop()! : place).trim() || '?';
    const t = parseLegacyTime(get(col.time));
    const needsTime = !st.startsWith('topilmadi');
    if (!t && needsTime) badTimes++;
    const base = { inv: get(col.inv).replace(/\s+/g, ''), name: get(col.name), qty: 1, condition: 'GOOD' as Condition, note: '', room, at: (t ?? now).toISOString(), timeOk: !!t, line: i + (headerOk ? 2 : 1) };
    if (st.startsWith('topilmadi')) return { ...base, kind: 'missing' };
    if (st.startsWith('topildi')) return { ...base, kind: 'found' };
    if (st.startsWith('ortiqcha')) return { ...base, kind: 'extra' };
    if (st.startsWith("boshqa bo'lim")) return { ...base, kind: 'other' };
    if (st.startsWith('takroriy')) return { ...base, kind: 'dup' };
    if (st.startsWith('inventarsiz')) {
      const rest = get(col.status).replace(/^[^:]*:\s*/, '');
      const [cond, ...noteParts] = rest.split(' - ');
      const cn = norm(cond || '');
      const condition = COND.find(([k]) => cn.startsWith(k))?.[1] ?? 'GOOD';
      const nm = base.name.match(/^(.*?)\s*[×xX]\s*(\d+)\s*$/);
      return { ...base, kind: 'noinv', name: nm ? nm[1].trim() : base.name, qty: nm ? Math.max(1, +nm[2]) : 1, condition, note: noteParts.join(' - ').trim() };
    }
    return { ...base, kind: 'unknown' };
  });
  return { rows, badTimes, headerOk };
}

export type CsvPreview = {
  draftId: string;
  fileName: string;
  headerOk: boolean;
  badTimes: number;
  counts: { found: number; foundSkip: number; foundNotInSection: number; extra: number; dup: number; noinv: number; missing: number; unknown: number; rooms: number };
  rooms: string[];
  samples: { foundSkip: string[]; foundNotInSection: string[]; unknown: string[] };
};

async function plan(db: PrismaClient, sectionId: string, rows: LegacyParsed[]) {
  const items = new Set((await db.item.findMany({ where: { sectionId }, select: { inv: true } })).map((x) => x.inv));
  const already = new Set((await db.found.findMany({ where: { sectionId }, select: { inv: true } })).map((x) => x.inv));
  const extrasEx = new Set((await db.extra.findMany({ where: { sectionId }, select: { inv: true } })).map((x) => x.inv));
  const found: LegacyParsed[] = [],
    foundSkip: LegacyParsed[] = [],
    asExtra: LegacyParsed[] = [],
    dups: LegacyParsed[] = [],
    noinv: LegacyParsed[] = [],
    unknown: LegacyParsed[] = [];
  let missing = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.kind === 'missing') missing++;
    else if (r.kind === 'found') {
      if (!r.inv) unknown.push(r);
      else if (!items.has(r.inv)) {
        if (extrasEx.has(r.inv) || seen.has('x' + r.inv)) foundSkip.push(r);
        else (asExtra.push(r), seen.add('x' + r.inv));
      }
      else if (already.has(r.inv) || seen.has(r.inv)) foundSkip.push(r);
      else (found.push(r), seen.add(r.inv));
    } else if (r.kind === 'extra' || r.kind === 'other') {
      if (!r.inv || extrasEx.has(r.inv) || seen.has('x' + r.inv)) foundSkip.push(r);
      else (asExtra.push(r), seen.add('x' + r.inv));
    } else if (r.kind === 'dup') dups.push(r);
    else if (r.kind === 'noinv') noinv.push(r);
    else unknown.push(r);
  }
  const rooms = [...new Set([...found, ...asExtra, ...dups, ...noinv].map((r) => r.room))].sort();
  return { found, foundSkip, asExtra, dups, noinv, unknown, missing, rooms, items };
}

export async function previewCsv(db: PrismaClient, u: SessionUser, sectionId: string, fileName: string, buf: Buffer): Promise<CsvPreview> {
  if (u.role !== 'ADMIN') throw forbidden();
  await getSectionChecked(db, u, sectionId);
  const text = buf.toString('utf8');
  const parsed = parseLegacy(text);
  if (!parsed.rows.length) throw bad('csv_empty');
  const p = await plan(db, sectionId, parsed.rows);
  const d = await db.importDraft.create({ data: { userId: u.id, sectionId, kind: 'csv', fileName, data: new Uint8Array(buf), parsed: parsed as unknown as Prisma.InputJsonValue } });
  const fmt = (r: LegacyParsed) => `${r.line}: ${r.inv || r.name} (${r.room})`;
  return {
    draftId: d.id,
    fileName,
    headerOk: parsed.headerOk,
    badTimes: parsed.badTimes,
    counts: {
      found: p.found.length,
      foundSkip: p.foundSkip.length,
      foundNotInSection: p.asExtra.filter((r) => r.kind === 'found').length,
      extra: p.asExtra.length,
      dup: p.dups.length,
      noinv: p.noinv.length,
      missing: p.missing,
      unknown: p.unknown.length,
      rooms: p.rooms.length,
    },
    rooms: p.rooms,
    samples: { foundSkip: p.foundSkip.slice(0, 100).map(fmt), foundNotInSection: p.asExtra.filter((r) => r.kind === 'found').slice(0, 100).map(fmt), unknown: p.unknown.slice(0, 100).map(fmt) },
  };
}

/** Tasdiqlangandan keyin yozish. Faqat tanlangan bo'limga. Xonalar "jarayonda" holatida. */
export async function commitCsv(db: PrismaClient, u: SessionUser, sectionId: string, draftId: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  const d = await db.importDraft.findUnique({ where: { id: draftId } });
  if (!d || d.userId !== u.id || d.kind !== 'csv' || d.sectionId !== sectionId) throw bad('draft_missing');
  await getSectionChecked(db, u, sectionId);
  const parsed = d.parsed as unknown as { rows: LegacyParsed[] };
  const p = await plan(db, sectionId, parsed.rows);
  return db.$transaction(
    async (tx) => {
      const roomId = new Map<string, string>();
      for (const name of p.rooms) {
        const r = await tx.room.upsert({ where: { sectionId_name: { sectionId, name } }, update: {}, create: { sectionId, name } });
        roomId.set(name, r.id);
      }
      const R = (r: LegacyParsed) => roomId.get(r.room)!;
      const f = await tx.found.createMany({ data: p.found.map((r) => ({ sectionId, inv: r.inv, roomId: R(r), userId: u.id, at: new Date(r.at), source: 'csv' })), skipDuplicates: true });
      // ortiqcha: boshqa bo'limda bo'lsa — "boshqa bo'limdan"
      const others = p.asExtra.length
        ? await tx.item.findMany({ where: { inv: { in: p.asExtra.map((r) => r.inv) }, sectionId: { not: sectionId }, delistedAt: null, section: { deletedAt: null } }, select: { inv: true, sectionId: true } })
        : [];
      const om = new Map(others.map((o) => [o.inv, o.sectionId]));
      const e = await tx.extra.createMany({
        data: p.asExtra.map((r) => ({ sectionId, inv: r.inv, kind: om.has(r.inv) ? ('OTHER_SECTION' as const) : ('NOT_IN_DB' as const), otherSectionId: om.get(r.inv) ?? null, roomId: R(r), userId: u.id, at: new Date(r.at) })),
        skipDuplicates: true,
      });
      const du = await tx.duplicate.createMany({ data: p.dups.map((r) => ({ sectionId, inv: r.inv, roomId: R(r), userId: u.id, at: new Date(r.at) })) });
      const n = await tx.noInvItem.createMany({ data: p.noinv.map((r) => ({ sectionId, roomId: R(r), name: r.name || '?', qty: r.qty, condition: r.condition, note: r.note, userId: u.id, at: new Date(r.at) })) });
      await tx.sectionFile.create({ data: { sectionId, fileName: d.fileName, data: d.data, uploadedBy: u.id, kind: 'csv' } });
      await tx.importDraft.delete({ where: { id: d.id } });
      await tx.section.update({ where: { id: sectionId }, data: { rev: { increment: 1 } } });
      const res = { found: f.count, extras: e.count, dups: du.count, noinv: n.count, rooms: p.rooms.length, skipped: p.foundSkip.length };
      await audit(tx, u, 'csv_import', { entity: 'section', entityId: sectionId, sectionId, details: { file: d.fileName, ...res } });
      return res;
    },
    { timeout: 120_000 },
  );
}
