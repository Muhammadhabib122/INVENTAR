import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { parseCsv, parseLegacy, parseLegacyTime } from '@/server/legacyCsv';
import { mkAdmin, reset, testDb } from './helpers/db';
import { sampleFile } from './fixtures/sample';
import { commitNew, createDraft } from '@/server/sections';
import { commitCsv, previewCsv } from '@/server/legacyCsv';
import type { SessionUser } from '@/server/auth';

const tz = (d: Date | null) => d && new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 19); // Toshkent vaqtida

describe('parseLegacyTime', () => {
  it('turli brauzer formatlarini o\'qiydi (Toshkent vaqti)', () => {
    expect(tz(parseLegacyTime('23.11.2026, 10:15:30'))).toBe('2026-11-23T10:15:30');
    expect(tz(parseLegacyTime('23/11/2026, 10:15:30'))).toBe('2026-11-23T10:15:30');
    expect(tz(parseLegacyTime('11/23/2026, 10:15:30 AM'))).toBe('2026-11-23T10:15:30');
    expect(tz(parseLegacyTime('11/23/2026, 1:05:00 PM'))).toBe('2026-11-23T13:05:00');
    expect(tz(parseLegacyTime('3/4/2026, 12:00:00 AM'))).toBe('2026-03-04T00:00:00');
    expect(tz(parseLegacyTime('04.03.2026 9:05'))).toBe('2026-03-04T09:05:00');
    expect(tz(parseLegacyTime('2026-11-23 10:15:30'))).toBe('2026-11-23T10:15:30');
    expect(parseLegacyTime('2026-11-23T05:15:30.000Z')?.toISOString()).toBe('2026-11-23T05:15:30.000Z');
    expect(parseLegacyTime('kecha')).toBeNull();
    expect(parseLegacyTime('')).toBeNull();
    expect(parseLegacyTime('31.13.2026, 10:00')).toBeNull();
  });
});

describe('parseCsv', () => {
  it("BOM, qo'shtirnoq, vergul va qator ko'chishi", () => {
    expect(parseCsv('﻿"a","b,c"\r\n"d ""x""","e\nf"\n')).toEqual([
      ['a', 'b,c'],
      ['d "x"', 'e\nf'],
    ]);
  });
});

const OLD = `﻿"Inventar raqam","Nomi","Birlik","Bo'lim","Summa","Holat","Vaqt","Joylashuv"
"10000001","Stul №2","дона","Kafedra-1","101000","Topildi","23.11.2026, 10:15:30","7-bino / 205"
"10000002","Stul №3","дона","Kafedra-1","102000","Topilmadi","",""
"10000003","Stul №4","дона","Kafedra-1","103000","Topildi","bilmayman","7-bino / 206"
"77777777","","","","","Ortiqcha","23.11.2026, 10:20:00","7-bino / 205"
"10000004","Stul №5","","","","Takroriy raqam","23.11.2026, 10:21:00","7-bino / 205"
"","Doska × 3","","","","Inventarsiz: Ta'mirga muhtoj - oynasi singan","23.11.2026, 10:22:00","7-bino / 206"
"99999999","Stol","дона","","5000","Topildi","23.11.2026, 10:23:00","7-bino / 206"`;

describe('parseLegacy', () => {
  it('holatlarni ajratadi', () => {
    const p = parseLegacy(OLD);
    expect(p.headerOk).toBe(true);
    expect(p.rows.map((r) => r.kind)).toEqual(['found', 'missing', 'found', 'extra', 'dup', 'noinv', 'found']);
    expect(p.rows[0]).toMatchObject({ inv: '10000001', room: '205', timeOk: true });
    expect(p.rows[2].timeOk).toBe(false);
    expect(p.badTimes).toBe(1);
    expect(p.rows[5]).toMatchObject({ name: 'Doska', qty: 3, condition: 'REPAIR', note: 'oynasi singan', room: '206' });
  });
  it('kirill yozuvdagi holatlarni ham taniydi', () => {
    const p = parseLegacy('"Инвентар рақам","Номи","Бирлик","Бўлим","Сумма","Ҳолат","Вақт","Жойлашув"\n"10000001","x","","","","Топилди","23.11.2026, 10:15","Б / 1"');
    expect(p.rows[0]).toMatchObject({ kind: 'found', room: '1' });
  });
});

describe('CSV import bazaga', () => {
  const db = testDb();
  let admin: SessionUser;
  beforeEach(async () => {
    await reset(db);
    admin = await mkAdmin(db);
  });
  afterAll(() => db.$disconnect());

  it("faqat tanlangan bo'limga yoziladi, avval ko'rsatiladi, xonalar 'jarayonda'", async () => {
    const b = (await db.building.create({ data: { name: '7-bino' } })).id;
    const A = (await commitNew(db, admin, (await createDraft(db, admin, b, 'A.xlsx', sampleFile(10000000, 20))).draftId)).sectionId;
    const B = (await commitNew(db, admin, (await createDraft(db, admin, b, 'B.xlsx', sampleFile(10000000, 20))).draftId)).sectionId;
    const pv = await previewCsv(db, admin, B, 'eski.csv', Buffer.from(OLD));
    expect(pv.counts).toMatchObject({ found: 2, foundNotInSection: 1, extra: 2, dup: 1, noinv: 1, missing: 1, rooms: 2 });
    expect(await db.found.count()).toBe(0); // ko'rib chiqishda hech narsa yozilmaydi
    const r = await commitCsv(db, admin, B, pv.draftId);
    expect(r).toMatchObject({ found: 2, extras: 2, dups: 1, noinv: 1, rooms: 2 });
    expect(await db.found.count({ where: { sectionId: A } })).toBe(0);
    expect(await db.found.count({ where: { sectionId: B } })).toBe(2);
    expect(await db.room.count({ where: { sectionId: B, status: 'IN_PROGRESS' } })).toBe(2);
    const f = await db.found.findFirstOrThrow({ where: { inv: '10000001' } });
    expect(f.at.toISOString()).toBe('2026-11-23T05:15:30.000Z');
    // qayta yuklansa ikki marta yozilmaydi
    const pv2 = await previewCsv(db, admin, B, 'eski.csv', Buffer.from(OLD));
    expect(pv2.counts.found).toBe(0);
    expect(pv2.counts.foundSkip).toBeGreaterThan(0);
  });
});
