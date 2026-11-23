import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkAdmin, mkUser, reset, testDb } from './helpers/db';
import { sampleFile } from './fixtures/sample';
import { commitNew, createDraft } from '@/server/sections';
import { processOp } from '@/server/ops';
import { sectionState } from '@/server/state';
import type { SessionUser } from '@/server/auth';

const db = testDb();
let admin: SessionUser, k1: SessionUser, k2: SessionUser, outsider: SessionUser;
let A: string, B: string, bId: string;
let n = 0;
const op = (u: SessionUser, type: string, payload: Record<string, unknown>, id = 'op' + ++n) => processOp(db, u, { id, type, payload });
const scan = (u: SessionUser, sectionId: string, inv: string, room = '101') => op(u, 'scan', { sectionId, inv, room, at: Date.now() });

beforeEach(async () => {
  await reset(db);
  admin = await mkAdmin(db);
  bId = (await db.building.create({ data: { name: '8-bino' } })).id;
  const other = (await db.building.create({ data: { name: 'Boshqa' } })).id;
  k1 = await mkUser(db, 'k1', 'COMMISSION', [bId]);
  k2 = await mkUser(db, 'k2', 'COMMISSION', [bId]);
  outsider = await mkUser(db, 'k3', 'COMMISSION', [other]);
  A = (await commitNew(db, admin, (await createDraft(db, admin, bId, 'A.xlsx', sampleFile(10000000, 20))).draftId)).sectionId;
  B = (await commitNew(db, admin, (await createDraft(db, admin, other, 'B.xlsx', sampleFile(90000000, 5))).draftId)).sectionId;
});
afterAll(() => db.$disconnect());

describe('skan', () => {
  it('topildi → shu xonada qayta → ogohlantirish, qayta yozilmaydi', async () => {
    expect((await scan(k1, A, '10000001')).result).toMatchObject({ status: 'found', name: 'Stul №2', room: '101' });
    const r = await scan(k2, A, '10000001');
    expect(r.result).toMatchObject({ status: 'already_here', who: 'User k1' });
    expect(await db.found.count()).toBe(1);
  });

  it('boshqa xonada topilgan → qaror: joyini yangilash', async () => {
    await scan(k1, A, '10000002', '101');
    const r = await scan(k2, A, '10000002', '205');
    expect(r.result).toMatchObject({ status: 'other_room', foundRoom: '101', foundBy: 'User k1' });
    const m = await op(k2, 'resolve', { pendingId: r.result.pendingId, choice: 'move' });
    expect(m.result.status).toBe('moved');
    const f = await db.found.findFirstOrThrow({ where: { inv: '10000002' }, include: {} });
    expect((await db.room.findUniqueOrThrow({ where: { id: f.roomId } })).name).toBe('205');
  });

  it('boshqa xonada topilgan → qaror: takroriy raqam (alohida qayd)', async () => {
    await scan(k1, A, '10000003', '101');
    const r = await scan(k2, A, '10000003', '205');
    await op(k2, 'resolve', { pendingId: r.result.pendingId, choice: 'dup' });
    expect(await db.duplicate.count({ where: { sectionId: A, inv: '10000003' } })).toBe(1);
    expect(await db.found.count()).toBe(1);
  });

  it("boshqa bo'limda bor → tasdiqlansa 'Boshqa bo'limdan', u bo'lim o'zgarmaydi, lekin hisobotida ko'rinadi", async () => {
    const r = await scan(k1, A, '90000001');
    expect(r.result).toMatchObject({ status: 'other_section' });
    expect((r.result.sections as { sectionName: string; buildingName: string }[])[0]).toMatchObject({ sectionName: 'B', buildingName: 'Boshqa' });
    await op(k1, 'resolve', { pendingId: r.result.pendingId, choice: 'confirm' });
    const ex = await db.extra.findFirstOrThrow({ where: { sectionId: A } });
    expect(ex).toMatchObject({ kind: 'OTHER_SECTION', otherSectionId: B });
    expect(await db.found.count({ where: { sectionId: B } })).toBe(0);
    const st = await sectionState(db, admin, B);
    if (st.same) throw new Error();
    expect(st.elsewhere).toEqual([expect.objectContaining({ inv: '90000001', sectionName: 'A', room: '101' })]);
  });

  it("hech qayerda yo'q → tasdiqlansa ortiqcha; bekor qilinsa hech narsa yozilmaydi", async () => {
    const r = await scan(k1, A, '55555555');
    expect(r.result.status).toBe('not_in_db');
    await op(k1, 'resolve', { pendingId: r.result.pendingId, choice: 'confirm' });
    expect(await db.extra.count({ where: { sectionId: A, kind: 'NOT_IN_DB' } })).toBe(1);
    const r2 = await scan(k1, A, '66666666');
    await op(k1, 'resolve', { pendingId: r2.result.pendingId, choice: 'cancel' });
    expect(await db.extra.count()).toBe(1);
    // qaror kutilayotgan skan ham yo'qolmaydi: bekor qilinguncha PendingScan'da turadi
    expect(await db.pendingScan.count({ where: { resolvedAt: null } })).toBe(0);
  });

  it('yakunlangan xonada skan bloklanadi (offline kelgani yo\'qolmasdan alohida saqlanadi)', async () => {
    await op(k1, 'room_done', { sectionId: A, room: '101' });
    const r = await scan(k1, A, '10000004', '101');
    expect(r.result).toMatchObject({ status: 'locked', lock: 'room' });
    expect(await db.found.count()).toBe(0);
    expect(await db.pendingScan.count({ where: { reason: 'LOCKED' } })).toBe(1);
    await op(k1, 'room_reopen', { sectionId: A, room: '101' });
    const rr = await op(k1, 'resolve', { pendingId: r.result.pendingId, choice: 'retry' });
    expect(rr.result.status).toBe('found');
  });

  it('bir xil amal qayta yuborilsa ikki marta yozilmaydi (idempotent)', async () => {
    const a = await op(k1, 'scan', { sectionId: A, inv: '10000005', room: '101' }, 'same-id');
    const b = await op(k1, 'scan', { sectionId: A, inv: '10000005', room: '101' }, 'same-id');
    expect(a.result).toEqual(b.result);
    expect(b.result.status).toBe('found');
    const c = await op(k1, 'noinv', { sectionId: A, room: '101', name: 'Doska', qty: 2 }, 'noinv-1');
    await op(k1, 'noinv', { sectionId: A, room: '101', name: 'Doska', qty: 2 }, 'noinv-1');
    expect(c.result.status).toBe('noinv_saved');
    expect(await db.noInvItem.count()).toBe(1);
  });

  it('ikki kishi bir vaqtda bitta buyumni skanerlasa — baza faqat bittasini qabul qiladi', async () => {
    const rs = await Promise.all([scan(k1, A, '10000006', '101'), scan(k2, A, '10000006', '205'), scan(admin, A, '10000006', '301')]);
    expect(await db.found.count({ where: { inv: '10000006' } })).toBe(1);
    const st = rs.map((r) => r.result.status).sort();
    expect(st.filter((s) => s === 'found')).toHaveLength(1);
    expect(st.filter((s) => s === 'other_room')).toHaveLength(2);
  });

  it('biriktirilmagan binoda skanerlab bo\'lmaydi (rad etiladi, lekin xabar qaytadi)', async () => {
    const r = await scan(outsider, A, '10000007');
    expect(r).toMatchObject({ final: true, result: { status: 'rejected', error: 'no_access' } });
    expect(await db.found.count()).toBe(0);
  });

  it("bekor qilingan yozuv savatga tushadi, bo'limning boshqa yozuvlari qoladi", async () => {
    await scan(k1, A, '10000008');
    await scan(k1, A, '10000009');
    const f = await db.found.findFirstOrThrow({ where: { inv: '10000008' } });
    await op(k1, 'cancel', { sectionId: A, kind: 'found', id: f.id });
    expect(await db.found.count()).toBe(1);
    expect(await db.trashEntry.count({ where: { kind: 'found' } })).toBe(1);
  });
});

describe('TMZ', () => {
  it('+/- son bo\'yicha sanash, manfiy bo\'lmaydi, qayta yuborilsa ikki marta qo\'shilmaydi', async () => {
    await op(k1, 'tmz_delta', { buildingId: bId, room: '12', name: 'Matras', unit: 'dona', dGood: 5, dBad: 1 }, 't1');
    await op(k1, 'tmz_delta', { buildingId: bId, room: '12', name: 'Matras', unit: 'dona', dGood: 5, dBad: 1 }, 't1');
    await op(k2, 'tmz_delta', { buildingId: bId, room: '12', name: 'Matras', unit: 'dona', dGood: 2, dBad: -3 });
    const e = await db.tmzEntry.findFirstOrThrow();
    expect([e.good, e.bad]).toEqual([7, 0]);
    const r = await op(outsider, 'tmz_delta', { buildingId: bId, room: '12', name: 'Matras', unit: 'dona', dGood: 1 });
    expect(r.result.status).toBe('rejected');
    await op(k1, 'tmz_room_done', { buildingId: bId, room: '12' });
    expect((await db.tmzRoom.findFirstOrThrow()).status).toBe('DONE');
  });
});
