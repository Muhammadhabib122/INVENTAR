// Hisobot hisob-kitoblari (brauzerda ham, serverda ham ishlaydi).
import type { Item, State } from './sectionData';
import { translate, type LangCode, type MsgKey } from './i18n';

export type ReportRow = {
  inv: string;
  name: string;
  unit: string;
  dept: string;
  mol: string;
  sum: number | '';
  status: string;
  time: string;
  place: string;
  who: string;
  kind: 'found' | 'missing' | 'extra' | 'other' | 'dup' | 'noinv' | 'delisted' | 'elsewhere';
};

export const fmtTash = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

export function buildReport(items: Item[], st: State, buildingName: string, lang: LangCode) {
  const t = (k: MsgKey, v?: Record<string, string | number>) => translate(lang, k, v);
  const room = new Map(st.rooms.map((r) => [r.id, r]));
  const u = (id: string | null) => (id && st.users[id]) || '';
  const place = (roomId: string) => `${buildingName} / ${room.get(roomId)?.name ?? ''}`;
  const found = new Map(st.founds.map((f) => [f.inv, f]));
  const elsewhere = new Map<string, State['elsewhere']>();
  st.elsewhere.forEach((e) => elsewhere.set(e.inv, [...(elsewhere.get(e.inv) || []), e]));

  const rows: ReportRow[] = [];
  const s = { total: 0, totalSum: 0, found: 0, foundSum: 0, missing: 0, missingSum: 0, extras: 0, other: 0, dups: 0, noInv: 0, noInvQty: 0, delisted: 0, elsewhere: 0, conflicts: 0 };
  for (const x of items) {
    const f = found.get(x.inv);
    if (x.delisted) {
      s.delisted++;
      rows.push({ inv: x.inv, name: x.name, unit: x.unit, dept: x.dept, mol: x.mol, sum: x.sum, status: t('st_delisted') + (f ? ' / ' + t('st_found') : ''), time: f ? fmtTash(f.at) : '', place: f ? place(f.roomId) : '', who: f ? u(f.userId) : '', kind: 'delisted' });
      continue;
    }
    s.total++;
    s.totalSum += x.sum || 0;
    if (f) {
      s.found++;
      s.foundSum += x.sum || 0;
      rows.push({ inv: x.inv, name: x.name, unit: x.unit, dept: x.dept, mol: x.mol, sum: x.sum, status: t('st_found'), time: fmtTash(f.at), place: place(f.roomId), who: u(f.userId), kind: 'found' });
    } else {
      s.missing++;
      s.missingSum += x.sum || 0;
      const el = elsewhere.get(x.inv);
      if (el?.length) {
        s.elsewhere++;
        const e = el[0];
        rows.push({ inv: x.inv, name: x.name, unit: x.unit, dept: x.dept, mol: x.mol, sum: x.sum, status: t('st_elsewhere'), time: fmtTash(e.at), place: t('st_elsewhere_place', { s: `${e.sectionName} (${e.buildingName})`, r: e.room }), who: u(e.userId), kind: 'elsewhere' });
      } else rows.push({ inv: x.inv, name: x.name, unit: x.unit, dept: x.dept, mol: x.mol, sum: x.sum, status: t('st_missing'), time: '', place: '', who: '', kind: 'missing' });
    }
  }
  const byInv = new Map(items.map((x) => [x.inv, x]));
  for (const e of st.extras) {
    if (e.kind === 'OTHER_SECTION') s.other++;
    else s.extras++;
    rows.push({ inv: e.inv, name: '', unit: '', dept: '', mol: '', sum: '', status: e.kind === 'OTHER_SECTION' ? t('st_other') + (e.otherSection ? ': ' + e.otherSection : '') : t('st_extra'), time: fmtTash(e.at), place: place(e.roomId), who: u(e.userId), kind: e.kind === 'OTHER_SECTION' ? 'other' : 'extra' });
  }
  for (const d of st.dups) {
    s.dups++;
    const x = byInv.get(d.inv);
    rows.push({ inv: d.inv, name: x?.name ?? '', unit: x?.unit ?? '', dept: x?.dept ?? '', mol: x?.mol ?? '', sum: '', status: t('st_dup'), time: fmtTash(d.at), place: place(d.roomId), who: u(d.userId), kind: 'dup' });
  }
  for (const n of st.noInv) {
    s.noInv++;
    s.noInvQty += n.qty;
    rows.push({ inv: '', name: `${n.name} × ${n.qty}`, unit: '', dept: '', mol: '', sum: '', status: `${t('st_noinv')}: ${t(('cond_' + n.condition) as MsgKey)}${n.note ? ' - ' + n.note : ''}`, time: fmtTash(n.at), place: place(n.roomId), who: u(n.userId), kind: 'noinv' });
  }

  // xonalar bo'yicha
  const rooms = st.rooms.map((r) => {
    const f = st.founds.filter((x) => x.roomId === r.id);
    return {
      name: r.name,
      status: r.status,
      doneAt: r.doneAt,
      doneBy: u(r.doneById),
      found: f.length,
      foundSum: f.reduce((a, x) => a + (byInv.get(x.inv)?.sum || 0), 0),
      extras: st.extras.filter((x) => x.roomId === r.id).length,
      dups: st.dups.filter((x) => x.roomId === r.id).length,
      noInv: st.noInv.filter((x) => x.roomId === r.id).reduce((a, x) => a + x.qty, 0),
    };
  });
  return { rows, summary: s, rooms };
}

export const COLS: MsgKey[] = ['col_inv', 'col_name', 'col_unit', 'col_dept', 'col_mol', 'col_sum', 'col_status', 'col_time', 'col_place', 'col_who'];
export const rowArr = (r: ReportRow) => [r.inv, r.name, r.unit, r.dept, r.mol, r.sum, r.status, r.time, r.place, r.who];

export function toCsv(header: string[], rows: (string | number)[][]) {
  const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
