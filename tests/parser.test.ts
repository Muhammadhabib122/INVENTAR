import { describe, expect, it } from 'vitest';
import { asInv, findHeaders, mergeSheets, nameFromFile, parseRows, parseWorkbook } from '@/server/excel';
import { book, header, rows, sampleFile } from './fixtures/sample';

describe('asInv', () => {
  it('faqat 8..19 xonali raqamlarni qabul qiladi', () => {
    expect(asInv('12345678')).toBe('12345678');
    expect(asInv(' 22122230000011 ')).toBe('22122230000011');
    expect(asInv(22122230000011)).toBe('22122230000011');
    expect(asInv('1234567')).toBeNull();
    expect(asInv('1'.repeat(19))).toBe('1'.repeat(19));
    expect(asInv('1'.repeat(20))).toBeNull();
    expect(asInv('1234-5678')).toBeNull();
    expect(asInv(12345678.5)).toBeNull();
    expect(asInv('')).toBeNull();
  });
});

describe('findHeaders', () => {
  it('ruscha sarlavhalarni topadi (katta-kichik harf farqsiz)', () => {
    const h = findHeaders(header());
    expect(h).toEqual({ inv: 3, name: 4, mol: 1, dept: 2, unit: 5 });
  });
  it('"инвентар-ный" yozilishini ham taniydi', () => {
    expect(findHeaders([['x', 'ИНВЕНТАР-НЫЙ НОМЕР']]).inv).toBe(1);
  });
  it('"отдел" faqat aynan shu so\'z bo\'lsa', () => {
    expect(findHeaders([['Отдел кадров', ' Отдел ']]).dept).toBe(1);
  });
  it('40-qatordan keyingi sarlavhalar hisobga olinmaydi', () => {
    const r: unknown[][] = Array.from({ length: 45 }, () => []);
    r[42] = ['Инвентар-ный'];
    expect(findHeaders(r).inv).toBe(-1);
  });
});

describe('parseRows', () => {
  it('buyumlarni ustunlar bo\'yicha o\'qiydi, summa — oxirgi son', () => {
    const p = parseRows([...header(), ...rows(10000000, 3)]);
    expect(p.items).toHaveLength(3);
    expect(p.items[0]).toEqual({ inv: '10000000', name: 'Stul №1', unit: 'дона', mol: 'Testov T.', dept: 'Kafedra-1', sum: 100000 });
  });
  it('"Итого" va "Всего" qatorlari tashlab ketiladi', () => {
    const p = parseRows([...header(), ...rows(10000000, 2), ['Итого', '', '', '10000099', '', '', 2, 201000], ['  всего по отделу', 12345678901, 5]]);
    expect(p.items.map((x) => x.inv)).toEqual(['10000000', '10000001']);
  });
  it('sarlavha topilsa raqam faqat shu ustundan olinadi', () => {
    // inventar ustuni bo'sh, lekin boshqa ustunda 8 xonali son bor — olinmaydi
    const p = parseRows([...header(), [1, 'X', 'Y', '', 'Nomi', 'дона', 1, 55555555]]);
    expect(p.items).toHaveLength(0);
  });
  it('sarlavha bo\'lmasa qatordagi birinchi mos qiymat olinadi', () => {
    // eski ilovadagi siljishlar: MOL = i-3, bo'lim = i-2, nomi = i+3, birlik = i+4
    const p = parseRows([['MOL', 'Dept', 'x', '30000001', 'a', 'b', 'Shkaf', 'дона', 500]]);
    expect(p.items[0]).toMatchObject({ inv: '30000001', name: 'Shkaf', unit: 'дона', mol: 'MOL', dept: 'Dept', sum: 500 });
  });
  it('20+ xonali son raqam deb olinmaydi', () => {
    const p = parseRows([['12345678901234567890', '40000001', 'a', 'b', 'Stol']]);
    expect(p.items[0].inv).toBe('40000001');
  });
  it('takrorlarni sanaydi, nomi farqli bo\'lsa ziddiyat', () => {
    const p = parseRows([
      ...header(),
      [1, 'M', 'D', '50000001', 'Stul', 'дона', 1, 10],
      [2, 'M', 'D', '50000001', 'stul ', 'дона', 1, 10],
      [3, 'M', 'D', '50000001', 'Kompyuter', 'дона', 1, 10],
    ]);
    expect(p.items).toHaveLength(1);
    expect(p.dup).toBe(2);
    expect(p.conflicts).toEqual([{ inv: '50000001', names: ['Stul', 'Kompyuter'] }]);
  });
});

describe('parseWorkbook', () => {
  it('soxta namuna faylni to\'g\'ri o\'qiydi, jami qatorlar buyum bo\'lmaydi', () => {
    const p = parseWorkbook(sampleFile(22122230000000, 25));
    expect(p.items).toHaveLength(25);
    expect(p.dup).toBe(0);
    expect(p.skippedTotals).toBe(1); // "Всего" qatorida inventar ustunida 11 xonali son bor — u buyum deb olinmasligi kerak
    expect(p.items.every((x) => x.name.startsWith('Stul'))).toBe(true);
  });
  it('barcha varaqlarni o\'qiydi va varaqlar orasidagi takrorlarni olib tashlaydi', () => {
    const buf = book([
      [...header(), ...rows(60000000, 5)],
      [...header(), ...rows(60000003, 5, 'M2', 'D2', 'Stul')],
    ]);
    const p = parseWorkbook(buf);
    expect(p.items).toHaveLength(8);
    expect(p.dup).toBe(2);
    expect(p.sheets).toBe(2);
  });
  it('varaqlar orasida nomi farqli takror — ziddiyat', () => {
    const p = mergeSheets([parseRows([['70000001', 'a', 'b', 'Stol']]), parseRows([['70000001', 'a', 'b', 'Divan']])]);
    expect(p.conflicts).toEqual([{ inv: '70000001', names: ['Stol', 'Divan'] }]);
  });
});

describe('nameFromFile', () => {
  it('kengaytmani olib tashlaydi', () => {
    expect(nameFromFile('7-bino_kafedra.xlsx')).toBe('7-bino kafedra');
  });
});
