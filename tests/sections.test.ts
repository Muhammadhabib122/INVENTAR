// Bo'limlar bir-biriga aralashmasligini tekshiruvchi testlar.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkAdmin, reset, testDb } from './helpers/db';
import { sampleFile } from './fixtures/sample';
import { clearSection, commitNew, commitUpdate, createDraft, deleteSection, listSections, previewUpdate } from '@/server/sections';
import type { SessionUser } from '@/server/auth';

const db = testDb();
let admin: SessionUser;
let buildingId: string;

beforeEach(async () => {
  await reset(db);
  admin = await mkAdmin(db);
  buildingId = (await db.building.create({ data: { name: '7-bino' } })).id;
});
afterAll(() => db.$disconnect());

async function upload(fileName: string, start: number, n: number, opts?: { name?: string }) {
  const a = await createDraft(db, admin, buildingId, fileName, sampleFile(start, n, opts));
  return a;
}
async function uploadNew(fileName: string, start: number, n: number, opts?: { name?: string }) {
  const a = await upload(fileName, start, n, opts);
  const r = await commitNew(db, admin, a.draftId);
  return { analysis: a, sectionId: r.sectionId };
}
async function scanFound(sectionId: string, inv: string) {
  const room = await db.room.upsert({ where: { sectionId_name: { sectionId, name: '101' } }, update: {}, create: { sectionId, name: '101' } });
  return db.found.create({ data: { sectionId, inv, roomId: room.id, userId: admin.id } });
}

describe("(a) raqamlari qisman bir xil ikkita fayl — ikkita alohida bo'lim", () => {
  it("ikkita bo'lim yaratiladi, buyumlar aralashmaydi, ogohlantirish chiqadi", async () => {
    // A: 10000000..10000099 (100 ta), B: 10000070..10000169 (100 ta) — 30 tasi umumiy
    const A = await uploadNew('kafedra-A.xlsx', 10000000, 100);
    const bDraft = await upload('kafedra-B.xlsx', 10000070, 100, { name: 'Shkaf' });
    expect(bDraft.crossTotal).toBe(30);
    expect(bDraft.cross[0]).toMatchObject({ sectionId: A.sectionId, count: 30 });
    expect(bDraft.sameFile).toHaveLength(0); // 30% < 80% — "bir xil fayl" deb hisoblanmaydi
    const B = await commitNew(db, admin, bDraft.draftId);

    expect(B.sectionId).not.toBe(A.sectionId);
    expect(await db.item.count({ where: { sectionId: A.sectionId } })).toBe(100);
    expect(await db.item.count({ where: { sectionId: B.sectionId } })).toBe(100);
    // umumiy raqam ikkala bo'limda o'z nomi bilan turibdi — ustiga yozilmagan
    const a = await db.item.findUnique({ where: { sectionId_inv: { sectionId: A.sectionId, inv: '10000080' } } });
    const b = await db.item.findUnique({ where: { sectionId_inv: { sectionId: B.sectionId, inv: '10000080' } } });
    expect(a?.name).toMatch(/^Stul/);
    expect(b?.name).toMatch(/^Shkaf/);

    // bir bo'limdagi skan ikkinchisida ko'rinmaydi
    await scanFound(A.sectionId, '10000080');
    const list = await listSections(db, admin);
    expect(list.find((s) => s.id === A.sectionId)?.found).toBe(1);
    expect(list.find((s) => s.id === B.sectionId)?.found).toBe(0);
    // ikkinchi bo'limda xuddi shu raqamni alohida topish mumkin (unikal cheklov bo'lim bo'yicha)
    await scanFound(B.sectionId, '10000080');
    expect(await db.found.count()).toBe(2);
  });
});

describe("(b) bitta bo'limni o'chirish yoki tozalash ikkinchisiga ta'sir qilmaydi", () => {
  it("tozalash faqat o'z bo'limining skanlarini olib tashlaydi", async () => {
    const A = await uploadNew('A.xlsx', 20000000, 50);
    const B = await uploadNew('B.xlsx', 20000040, 50, { name: 'Stol' });
    await scanFound(A.sectionId, '20000045');
    await scanFound(B.sectionId, '20000045');
    await scanFound(B.sectionId, '20000060');

    await clearSection(db, admin, A.sectionId);
    expect(await db.found.count({ where: { sectionId: A.sectionId } })).toBe(0);
    expect(await db.found.count({ where: { sectionId: B.sectionId } })).toBe(2);
    expect(await db.item.count({ where: { sectionId: A.sectionId } })).toBe(50); // buyumlar ro'yxati qoladi
    expect(await db.room.count({ where: { sectionId: B.sectionId } })).toBe(1);
    // tozalangan ma'lumot savatda
    expect(await db.trashEntry.count({ where: { kind: 'clear', sectionId: A.sectionId } })).toBe(1);
  });

  it("o'chirish faqat o'z bo'limini yashiradi va savatga tushiradi", async () => {
    const A = await uploadNew('A.xlsx', 30000000, 20);
    const B = await uploadNew('B.xlsx', 30000010, 20);
    await scanFound(B.sectionId, '30000015');

    await deleteSection(db, admin, A.sectionId);
    const list = await listSections(db, admin);
    expect(list.map((s) => s.id)).toEqual([B.sectionId]);
    expect(list[0]).toMatchObject({ total: 20, found: 1 });
    // ma'lumot butunlay o'chmagan — faqat belgilangan
    expect(await db.item.count({ where: { sectionId: A.sectionId } })).toBe(20);
    expect(await db.trashEntry.count({ where: { kind: 'section' } })).toBe(1);
  });
});

describe("(c) bir xil faylni qayta yuklashda tizim so'raydi, o'zi birlashtirmaydi", () => {
  it('fayl nomi bir xil bo\'lsa — so\'raydi, hech narsa yozilmaydi', async () => {
    const A = await uploadNew('Telekom 8-bino.xlsx', 40000000, 30);
    const again = await upload('telekom 8-BINO.xlsx', 50000000, 10); // nom bir xil, raqamlar boshqa
    expect(again.sameFile).toEqual([expect.objectContaining({ sectionId: A.sectionId, reason: 'name' })]);
    // tahlil bosqichida bazadagi bo'limlar o'zgarmaydi
    expect(await db.section.count()).toBe(1);
    expect(await db.item.count()).toBe(30);
  });

  it("raqamlarning 80% dan ko'pi mos kelsa — so'raydi", async () => {
    const A = await uploadNew('birinchi.xlsx', 41000000, 100);
    const again = await upload('boshqa-nom.xlsx', 41000005, 100); // 95 tasi mos
    expect(again.sameFile).toEqual([expect.objectContaining({ sectionId: A.sectionId, reason: 'overlap' })]);
    expect(again.sameFile[0].overlap).toBeCloseTo(0.95);
    expect(await db.item.count()).toBe(100);
  });

  it("\"Mavjud bo'limni yangilash\": skanlar saqlanadi, yangilar qo'shiladi, yo'qlari ro'yxatdan chiqariladi", async () => {
    const A = await uploadNew('fayl.xlsx', 42000000, 10); // 42000000..42000009
    await scanFound(A.sectionId, '42000000');
    await scanFound(A.sectionId, '42000005');
    const again = await upload('fayl.xlsx', 42000002, 10); // 42000002..42000011
    const diff = await previewUpdate(db, admin, again.draftId, A.sectionId);
    expect(diff.addedCount).toBe(2); // ...10, ...11
    expect(diff.delistedCount).toBe(2); // ...00, ...01
    // ko'rib chiqishdan keyin ham hali hech narsa o'zgarmagan
    expect(await db.item.count({ where: { sectionId: A.sectionId } })).toBe(10);

    const r = await commitUpdate(db, admin, again.draftId, A.sectionId);
    expect(r).toMatchObject({ added: 2, delisted: 2 });
    expect(await db.item.count({ where: { sectionId: A.sectionId } })).toBe(12); // hech narsa o'chmagan
    const gone = await db.item.findUnique({ where: { sectionId_inv: { sectionId: A.sectionId, inv: '42000000' } } });
    expect(gone?.delistedAt).not.toBeNull();
    expect(await db.found.count({ where: { sectionId: A.sectionId } })).toBe(2); // skanlar joyida
    expect(await db.section.count()).toBe(1);
  });

  it("\"Yangi bo'lim sifatida qo'shish\" tanlansa — alohida bo'lim, eskisiga tegilmaydi", async () => {
    const A = await uploadNew('fayl.xlsx', 43000000, 10);
    await scanFound(A.sectionId, '43000001');
    const again = await upload('fayl.xlsx', 43000000, 10);
    const B = await commitNew(db, admin, again.draftId, 'fayl (2)');
    expect(B.sectionId).not.toBe(A.sectionId);
    expect(await db.item.count({ where: { sectionId: A.sectionId } })).toBe(10);
    expect(await db.item.count({ where: { sectionId: B.sectionId } })).toBe(10);
    expect(await db.found.count({ where: { sectionId: A.sectionId } })).toBe(1);
    expect(await db.found.count({ where: { sectionId: B.sectionId } })).toBe(0);
  });
});

describe('cheklovlar', () => {
  it("bir bo'limda bitta raqam ikki marta topilmaydi (baza darajasida)", async () => {
    const A = await uploadNew('x.xlsx', 44000000, 5);
    await scanFound(A.sectionId, '44000001');
    await expect(scanFound(A.sectionId, '44000001')).rejects.toThrow();
  });
  it('qoralama boshqa foydalanuvchi tomonidan ishlatilmaydi', async () => {
    const a = await upload('y.xlsx', 45000000, 5);
    const other = await mkAdmin(db, 'admin2');
    await expect(commitNew(db, other, a.draftId)).rejects.toThrow();
  });
});

describe('Savat', () => {
  it("tozalangan natijalar va o'chirilgan bo'lim savatdan tiklanadi", async () => {
    const { restoreTrash } = await import('@/server/restore');
    const A = await uploadNew('A.xlsx', 46000000, 10);
    await scanFound(A.sectionId, '46000001');
    await scanFound(A.sectionId, '46000002');
    await clearSection(db, admin, A.sectionId);
    expect(await db.found.count()).toBe(0);
    // tozalashdan keyin yangi skan qilingan bo'lsa — tiklashda ustiga yozilmaydi
    await scanFound(A.sectionId, '46000002');
    const tr = await db.trashEntry.findFirstOrThrow({ where: { kind: 'clear' } });
    const r = await restoreTrash(db, admin, tr.id);
    expect(r).toEqual({ restored: 1, skipped: 1 });
    expect(await db.found.count({ where: { sectionId: A.sectionId } })).toBe(2);
    await expect(restoreTrash(db, admin, tr.id)).rejects.toThrow();

    await deleteSection(db, admin, A.sectionId);
    expect(await listSections(db, admin)).toHaveLength(0);
    const ts = await db.trashEntry.findFirstOrThrow({ where: { kind: 'section' } });
    await restoreTrash(db, admin, ts.id);
    expect((await listSections(db, admin))[0]).toMatchObject({ id: A.sectionId, found: 2 });
  });
});
