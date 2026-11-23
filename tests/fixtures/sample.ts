// Soxta namuna fayllar (haqiqiy ism-familiyalar yo'q). Tuzilma universitet tizimidan
// eksport qilingan fayllarga o'xshaydi: tepada sarlavha bloki, ruscha ustun nomlari, "Итого" qatorlari.
import * as XLSX from '@e965/xlsx';

export type Row = [string | number, string, string, string | number, string, string, number, number];

export function header(): unknown[][] {
  return [
    ['ФАРГОНА ДАВЛАТ ТЕХНИКА УНИВЕРСИТЕТИ'],
    ['Оборотная ведомость основных средств'],
    [],
    ['№', 'М.О.Л', 'Отдел', 'Инвентар-\nный номер', 'Наименование основных средств', 'Единица измерения', 'Кол-во', 'Сумма'],
  ];
}

/** n ta buyum: raqamlar start dan boshlab */
export function rows(start: number, n: number, mol = 'Testov T.', dept = 'Kafedra-1', namePrefix = 'Stul'): unknown[][] {
  return Array.from({ length: n }, (_, k) => [k + 1, mol, dept, String(start + k), `${namePrefix} №${k + 1}`, 'дона', 1, 100000 + k * 1000]);
}

export function book(sheets: unknown[][][]): Buffer {
  const wb = XLSX.utils.book_new();
  sheets.forEach((aoa, i) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Лист' + (i + 1)));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Standart namuna: sarlavha + n qator + Итого */
export function sampleFile(start: number, n: number, opts: { mol?: string; dept?: string; name?: string } = {}) {
  const r = rows(start, n, opts.mol, opts.dept, opts.name);
  const total = r.reduce((s, x) => s + (x[7] as number), 0);
  return book([[...header(), ...r, ['Итого по МОЛ', '', '', '', '', '', n, total], ['Всего', '', '', 99999999999, '', '', n, total]]]);
}
