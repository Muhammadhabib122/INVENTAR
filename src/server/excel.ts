// Excel fayldan buyumlarni o'qish. Qoidalar eski ilovadagi parseRows bilan bir xil,
// topshiriqdagi aniqlashtirishlar bilan:
//  - sarlavhalar birinchi 40 qatordan qidiriladi (katta-kichik harf farq qilmaydi);
//  - inventar raqam: faqat raqamlar, 8..19 xonali (20+ xonali son raqam emas);
//  - sarlavha topilsa raqam faqat shu ustundan, topilmasa qatordagi birinchi mos qiymat;
//  - "Итого"/"Всего" bilan boshlanadigan qatorlar tashlab ketiladi;
//  - summa: qatordagi oxirgi son qiymat;
//  - barcha varaqlar o'qiladi, takrorlar olib tashlanadi, nomlari farq qilsa — ziddiyat.
import * as XLSX from '@e965/xlsx';

export type ParsedItem = { inv: string; name: string; unit: string; mol: string; dept: string; sum: number };
export type Conflict = { inv: string; names: string[] };
export type ParseResult = { items: ParsedItem[]; dup: number; conflicts: Conflict[]; skippedTotals: number; sheets: number };

const INV_RE = /^\d{8,19}$/;
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Katak qiymatini inventar raqam sifatida o'qish (mos kelmasa null) */
export function asInv(v: unknown): string | null {
  let s: string;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) return null;
    s = v < 1e21 ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }) : '';
  } else s = String(v ?? '').trim();
  return INV_RE.test(s) ? s : null;
}

function isTotalRow(row: unknown[]) {
  for (const c of row) {
    if (typeof c !== 'string') continue;
    const s = c.trim().toLowerCase();
    if (!s) continue;
    if (s.startsWith('итого') || s.startsWith('всего')) return true;
  }
  return false;
}

type Headers = { inv: number; name: number; mol: number; dept: number; unit: number };

export function findHeaders(rows: unknown[][]): Headers {
  const h: Headers = { inv: -1, name: -1, mol: -1, dept: -1, unit: -1 };
  for (let r = 0; r < rows.length && r < 40; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const s = String(row[c] ?? '').toLowerCase();
      const st = s.trim();
      if (h.inv < 0 && (s.includes('инвентар-ный') || st.startsWith('инвентар-'))) h.inv = c;
      if (h.name < 0 && s.includes('наименование основных')) h.name = c;
      if (h.mol < 0 && s.includes('м.о.л')) h.mol = c;
      if (h.dept < 0 && st === 'отдел') h.dept = c;
      if (h.unit < 0 && s.includes('единица')) h.unit = c;
    }
  }
  return h;
}

/** Bitta varaq qatorlarini o'qish. Takrorlar shu varaq ichida olib tashlanadi. */
export function parseRows(rows: unknown[][]): ParseResult {
  const h = findHeaders(rows);
  const items: ParsedItem[] = [];
  const seen = new Map<string, ParsedItem>();
  const conflicts = new Map<string, Set<string>>();
  let dup = 0,
    skippedTotals = 0;
  for (const raw of rows) {
    const row = raw || [];
    if (!row.length) continue;
    let i = -1;
    let inv: string | null = null;
    if (h.inv > -1) {
      inv = asInv(row[h.inv]);
      if (inv) i = h.inv;
    } else {
      for (let c = 0; c < row.length; c++) {
        inv = asInv(row[c]);
        if (inv) {
          i = c;
          break;
        }
      }
    }
    if (i < 0 || !inv) continue;
    if (isTotalRow(row)) {
      skippedTotals++;
      continue;
    }
    const at = (hc: number, off: number) => clean(row[hc > -1 ? hc : i + off]);
    let sum = 0;
    for (let c = row.length - 1; c >= 0; c--) {
      if (c !== i && typeof row[c] === 'number' && Number.isFinite(row[c] as number)) {
        sum = row[c] as number;
        break;
      }
    }
    const it: ParsedItem = { inv, name: at(h.name, 3), unit: at(h.unit, 4), mol: at(h.mol, -3), dept: at(h.dept, -2), sum };
    const prev = seen.get(inv);
    if (prev) {
      dup++;
      if (normName(prev.name) !== normName(it.name)) {
        const set = conflicts.get(inv) ?? new Set([prev.name]);
        set.add(it.name);
        conflicts.set(inv, set);
      }
      continue;
    }
    seen.set(inv, it);
    items.push(it);
  }
  return { items, dup, conflicts: [...conflicts].map(([inv, s]) => ({ inv, names: [...s] })), skippedTotals, sheets: 1 };
}

/** Bir nechta varaq natijalarini birlashtirish (fayl ichida) */
export function mergeSheets(parts: ParseResult[]): ParseResult {
  const items: ParsedItem[] = [];
  const seen = new Map<string, ParsedItem>();
  const conflicts = new Map<string, Set<string>>();
  let dup = 0,
    skippedTotals = 0;
  for (const p of parts) {
    dup += p.dup;
    skippedTotals += p.skippedTotals;
    for (const c of p.conflicts) {
      const s = conflicts.get(c.inv) ?? new Set<string>();
      c.names.forEach((n) => s.add(n));
      conflicts.set(c.inv, s);
    }
    for (const it of p.items) {
      const prev = seen.get(it.inv);
      if (prev) {
        dup++;
        if (normName(prev.name) !== normName(it.name)) {
          const s = conflicts.get(it.inv) ?? new Set([prev.name]);
          s.add(it.name);
          conflicts.set(it.inv, s);
        }
        continue;
      }
      seen.set(it.inv, it);
      items.push(it);
    }
  }
  return { items, dup, conflicts: [...conflicts].map(([inv, s]) => ({ inv, names: [...s] })), skippedTotals, sheets: parts.length };
}

export function parseWorkbook(buf: Buffer | Uint8Array): ParseResult {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, dense: true });
  const parts = wb.SheetNames.map((n) => parseRows(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: '' })));
  return mergeSheets(parts);
}

/** Fayl nomidan bo'lim nomi: kengaytmasiz, ortiqcha belgilarsiz */
export function nameFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Bo\'lim';
}
