// Telefondan keladigan amallar (skan, qaror, bekor qilish, inventarsiz jihoz, xonani yakunlash, TMZ).
// Har bir amal ID bilan keladi va ClientOp jadvalida natijasi saqlanadi: qayta yuborilsa
// qayta yozilmaydi, oldingi natija qaytariladi. Shu tufayli internet uzilib-ulanganda ham
// hech bir skan yo'qolmaydi va ikkilanmaydi.
import { Prisma, type PrismaClient, type Condition } from '@prisma/client';
import type { SessionUser } from './auth';
import { canWorkBuilding } from './auth';
import { audit } from './audit';
import { HttpError, bad, forbidden, notFound } from './errors';
import { toTrash } from './trash';
import type { Tx } from './db';
import { tmzOp } from './tmz';

export type OpIn = { id: string; type: string; payload: Record<string, unknown>; createdAt?: number };
export type OpOut = { id: string; final: boolean; result: Record<string, unknown> & { status: string } };

const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const normRoom = (v: unknown) => s(v, 100);
export const normInv = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[\s\u0000-\u001f]+/g, '').slice(0, 64) : '');

function opTime(v: unknown) {
  const n = typeof v === 'number' ? v : Date.now();
  const now = Date.now();
  // kelajakdagi yoki juda eski vaqt — server vaqti
  if (!Number.isFinite(n) || n > now + 5 * 60_000 || n < now - 60 * 86400_000) return new Date(now);
  return new Date(n);
}

async function workSection(tx: Tx, u: SessionUser, sectionId: string) {
  const sec = await tx.section.findFirst({ where: { id: sectionId }, include: { building: true } });
  if (!sec || sec.deletedAt || sec.building.deletedAt) throw new HttpError(404, 'section_missing');
  if (!canWorkBuilding(u, sec.buildingId)) throw forbidden('no_access');
  return sec;
}

async function userName(tx: Tx, id: string) {
  return (await tx.user.findUnique({ where: { id }, select: { fullName: true } }))?.fullName || '';
}

const bump = (tx: Tx, sectionId: string) => tx.section.update({ where: { id: sectionId }, data: { rev: { increment: 1 } } });

type R = Record<string, unknown> & { status: string };

/** Skan mantig'i. Qaror kerak bo'lsa PendingScan yaratiladi (skan yo'qolmasligi uchun). */
async function scan(tx: Tx, u: SessionUser, p: Record<string, unknown>): Promise<R> {
  const sectionId = s(p.sectionId, 60);
  const inv = normInv(p.inv);
  const roomName = normRoom(p.room);
  if (!inv) throw bad('no_inv');
  if (!roomName) throw bad('no_room');
  const sec = await workSection(tx, u, sectionId);
  const at = opTime(p.at);
  const method = s(p.method, 20) || 'scan';
  const room = await tx.room.upsert({ where: { sectionId_name: { sectionId, name: roomName } }, update: {}, create: { sectionId, name: roomName } });
  const item = await tx.item.findUnique({ where: { sectionId_inv: { sectionId, inv } } });
  const base = { inv, room: roomName, name: item?.name ?? '', sum: item?.sum ?? 0, delisted: !!item?.delistedAt };

  if (sec.status === 'DONE' || room.status === 'DONE') {
    const pend = await tx.pendingScan.create({ data: { sectionId, inv, roomId: room.id, userId: u.id, at, reason: 'LOCKED', info: { lock: sec.status === 'DONE' ? 'section' : 'room', method } } });
    await bump(tx, sectionId);
    return { status: 'locked', lock: sec.status === 'DONE' ? 'section' : 'room', pendingId: pend.id, ...base };
  }

  if (item) {
    const ins = await tx.found.createMany({ data: [{ sectionId, inv, roomId: room.id, userId: u.id, at, source: method }], skipDuplicates: true });
    if (ins.count === 1) {
      await bump(tx, sectionId);
      return { status: 'found', ...base };
    }
    const ex = await tx.found.findUniqueOrThrow({ where: { sectionId_inv: { sectionId, inv } } });
    const who = await userName(tx, ex.userId);
    if (ex.roomId === room.id) return { status: 'already_here', who, at: ex.at, ...base };
    const exRoom = await tx.room.findUnique({ where: { id: ex.roomId } });
    const pend = await tx.pendingScan.create({
      data: { sectionId, inv, roomId: room.id, userId: u.id, at, reason: 'OTHER_ROOM', info: { foundId: ex.id, foundRoom: exRoom?.name ?? '', foundBy: who, foundAt: ex.at.toISOString(), method } },
    });
    await bump(tx, sectionId);
    return { status: 'other_room', pendingId: pend.id, foundRoom: exRoom?.name ?? '', foundBy: who, foundAt: ex.at, ...base };
  }

  const ext = await tx.extra.findUnique({ where: { sectionId_inv: { sectionId, inv } } });
  if (ext) {
    const r = await tx.room.findUnique({ where: { id: ext.roomId } });
    return { status: 'extra_already', kind: ext.kind, extraRoom: r?.name ?? '', who: await userName(tx, ext.userId), at: ext.at, ...base };
  }

  const others = await tx.item.findMany({
    where: { inv, sectionId: { not: sectionId }, delistedAt: null, section: { deletedAt: null, building: { deletedAt: null } } },
    include: { section: { include: { building: true } } },
    take: 10,
  });
  if (others.length) {
    const list = others.map((o) => ({ sectionId: o.sectionId, sectionName: o.section.name, buildingName: o.section.building.name, mol: o.mol, itemName: o.name }));
    const pend = await tx.pendingScan.create({ data: { sectionId, inv, roomId: room.id, userId: u.id, at, reason: 'OTHER_SECTION', info: { sections: list, method } } });
    await bump(tx, sectionId);
    return { status: 'other_section', pendingId: pend.id, sections: list, ...base };
  }
  const pend = await tx.pendingScan.create({ data: { sectionId, inv, roomId: room.id, userId: u.id, at, reason: 'NOT_IN_DB', info: { method } } });
  await bump(tx, sectionId);
  return { status: 'not_in_db', pendingId: pend.id, ...base };
}

async function resolve(tx: Tx, u: SessionUser, p: Record<string, unknown>): Promise<R> {
  const pend = await tx.pendingScan.findUnique({ where: { id: s(p.pendingId, 60) } });
  if (!pend) throw notFound();
  if (pend.userId !== u.id && u.role !== 'ADMIN') throw forbidden();
  const sec = await workSection(tx, u, pend.sectionId);
  if (pend.resolvedAt) return { status: 'already_resolved', resolution: pend.resolution };
  const choice = s(p.choice, 20);
  const room = await tx.room.findUniqueOrThrow({ where: { id: pend.roomId } });
  const info = pend.info as Record<string, unknown>;
  const done = async (resolution: string) => {
    await tx.pendingScan.update({ where: { id: pend.id }, data: { resolvedAt: new Date(), resolution } });
    await bump(tx, pend.sectionId);
  };
  const base = { inv: pend.inv, room: room.name };
  if (choice === 'cancel') {
    await done('cancel');
    await audit(tx, u, 'scan_discard', { entity: 'pending', entityId: pend.id, sectionId: pend.sectionId, details: { inv: pend.inv, reason: pend.reason, room: room.name } });
    return { status: 'cancelled', ...base };
  }
  if ((choice === 'move' || choice === 'dup') && sec.status === 'DONE') throw bad('section_done');
  if (room.status === 'DONE' && choice !== 'retry') throw bad('room_done');

  switch (pend.reason) {
    case 'OTHER_ROOM': {
      const f = await tx.found.findUnique({ where: { sectionId_inv: { sectionId: pend.sectionId, inv: pend.inv } } });
      if (choice === 'move') {
        if (!f) {
          await tx.found.create({ data: { sectionId: pend.sectionId, inv: pend.inv, roomId: room.id, userId: u.id, at: pend.at } });
        } else {
          const from = await tx.room.findUnique({ where: { id: f.roomId } });
          await tx.found.update({ where: { id: f.id }, data: { roomId: room.id, userId: u.id, at: pend.at } });
          await audit(tx, u, 'found_move', { entity: 'found', entityId: f.id, sectionId: pend.sectionId, details: { inv: pend.inv, from: from?.name, to: room.name, prevUser: f.userId, prevAt: f.at } });
        }
        await done('move');
        return { status: 'moved', from: info.foundRoom, ...base };
      }
      if (choice === 'dup') {
        await tx.duplicate.create({ data: { sectionId: pend.sectionId, inv: pend.inv, roomId: room.id, userId: u.id, at: pend.at } });
        await done('dup');
        return { status: 'dup_saved', ...base };
      }
      break;
    }
    case 'OTHER_SECTION':
    case 'NOT_IN_DB': {
      if (choice !== 'confirm') break;
      const otherId = pend.reason === 'OTHER_SECTION' ? (s(p.otherSectionId, 60) || ((info.sections as { sectionId: string }[])?.[0]?.sectionId ?? null)) : null;
      const ins = await tx.extra.createMany({
        data: [{ sectionId: pend.sectionId, inv: pend.inv, kind: pend.reason === 'OTHER_SECTION' ? 'OTHER_SECTION' : 'NOT_IN_DB', otherSectionId: otherId, roomId: room.id, userId: u.id, at: pend.at }],
        skipDuplicates: true,
      });
      await done(ins.count ? 'confirm' : 'exists');
      return { status: ins.count ? (pend.reason === 'OTHER_SECTION' ? 'other_saved' : 'extra_saved') : 'extra_already', ...base };
    }
    case 'LOCKED': {
      if (choice !== 'retry') break;
      if (sec.status === 'DONE') throw bad('section_done');
      if (room.status === 'DONE') throw bad('room_done');
      await done('retry');
      return scan(tx, u, { sectionId: pend.sectionId, inv: pend.inv, room: room.name, at: pend.at.getTime(), method: 'retry' });
    }
  }
  throw bad('bad_choice');
}

async function assertOpen(tx: Tx, sectionId: string, roomId: string) {
  const [sec, room] = await Promise.all([tx.section.findUnique({ where: { id: sectionId } }), tx.room.findUnique({ where: { id: roomId } })]);
  if (sec?.status === 'DONE') throw bad('section_done');
  if (room?.status === 'DONE') throw bad('room_done');
}

/** "Bu xonada topilganlar" ro'yxatidan bitta yozuvni bekor qilish — savatga tushadi */
async function cancel(tx: Tx, u: SessionUser, p: Record<string, unknown>): Promise<R> {
  const kind = s(p.kind, 10);
  const id = s(p.id, 60);
  const sectionId = s(p.sectionId, 60);
  const sec = await workSection(tx, u, sectionId);
  const label = (x: { inv?: string; name?: string }) => `${sec.name}: ${x.inv ?? x.name ?? ''}`;
  let row: { id: string; sectionId: string; roomId: string; inv?: string; name?: string } | null = null;
  if (kind === 'found') row = await tx.found.findFirst({ where: { id, sectionId } });
  else if (kind === 'extra') row = await tx.extra.findFirst({ where: { id, sectionId } });
  else if (kind === 'dup') row = await tx.duplicate.findFirst({ where: { id, sectionId } });
  else if (kind === 'noinv') row = await tx.noInvItem.findFirst({ where: { id, sectionId } });
  else throw bad('bad_kind');
  if (!row) return { status: 'gone' };
  await assertOpen(tx, sectionId, row.roomId);
  await toTrash(tx, u, kind, label(row), { table: kind, row }, sectionId);
  if (kind === 'found') await tx.found.delete({ where: { id } });
  if (kind === 'extra') await tx.extra.delete({ where: { id } });
  if (kind === 'dup') await tx.duplicate.delete({ where: { id } });
  if (kind === 'noinv') await tx.noInvItem.delete({ where: { id } });
  await bump(tx, sectionId);
  await audit(tx, u, 'cancel_' + kind, { entity: kind, entityId: id, sectionId, details: row });
  return { status: 'cancelled', inv: row.inv ?? row.name };
}

/** Ro'yxatda qo'lda "topilmadi" qilish (inventar raqam bo'yicha) */
async function unfound(tx: Tx, u: SessionUser, p: Record<string, unknown>): Promise<R> {
  const sectionId = s(p.sectionId, 60);
  await workSection(tx, u, sectionId);
  const f = await tx.found.findUnique({ where: { sectionId_inv: { sectionId, inv: normInv(p.inv) } } });
  if (!f) return { status: 'gone' };
  return cancel(tx, u, { kind: 'found', id: f.id, sectionId });
}

const CONDS: Condition[] = ['GOOD', 'FAIR', 'BAD', 'REPAIR'];
async function noinv(tx: Tx, u: SessionUser, p: Record<string, unknown>): Promise<R> {
  const sectionId = s(p.sectionId, 60);
  const roomName = normRoom(p.room);
  const name = s(p.name, 200);
  if (!roomName) throw bad('no_room');
  if (!name) throw bad('required');
  const sec = await workSection(tx, u, sectionId);
  const room = await tx.room.upsert({ where: { sectionId_name: { sectionId, name: roomName } }, update: {}, create: { sectionId, name: roomName } });
  const at = opTime(p.at);
  const qty = Math.max(1, Math.min(100000, Math.floor(Number(p.qty) || 1)));
  const condition = CONDS.includes(p.condition as Condition) ? (p.condition as Condition) : 'GOOD';
  if (sec.status === 'DONE' || room.status === 'DONE') {
    // offline'da qo'shilgan bo'lishi mumkin — yo'qolmasin: baribir saqlaymiz va ogohlantiramiz
    const r = await tx.noInvItem.create({ data: { sectionId, roomId: room.id, name, qty, condition, note: s(p.note, 500), userId: u.id, at } });
    await bump(tx, sectionId);
    return { status: 'noinv_saved_locked', id: r.id, name, qty, room: roomName };
  }
  const r = await tx.noInvItem.create({ data: { sectionId, roomId: room.id, name, qty, condition, note: s(p.note, 500), userId: u.id, at } });
  await bump(tx, sectionId);
  return { status: 'noinv_saved', id: r.id, name, qty, room: roomName };
}

async function roomStatus(tx: Tx, u: SessionUser, p: Record<string, unknown>, done: boolean): Promise<R> {
  const sectionId = s(p.sectionId, 60);
  const roomName = normRoom(p.room);
  if (!roomName) throw bad('no_room');
  const sec = await workSection(tx, u, sectionId);
  if (sec.status === 'DONE') throw bad('section_done');
  const room = await tx.room.upsert({ where: { sectionId_name: { sectionId, name: roomName } }, update: {}, create: { sectionId, name: roomName } });
  await tx.room.update({ where: { id: room.id }, data: done ? { status: 'DONE', doneAt: new Date(), doneById: u.id } : { status: 'IN_PROGRESS', doneAt: null, doneById: null } });
  await bump(tx, sectionId);
  await audit(tx, u, done ? 'room_done' : 'room_reopen', { entity: 'room', entityId: room.id, sectionId, details: { room: roomName } });
  return { status: done ? 'room_done' : 'room_reopened', room: roomName };
}

async function run(tx: Tx, u: SessionUser, op: OpIn): Promise<R> {
  const p = op.payload || {};
  switch (op.type) {
    case 'scan':
      return scan(tx, u, p);
    case 'resolve':
      return resolve(tx, u, p);
    case 'cancel':
      return cancel(tx, u, p);
    case 'unfound':
      return unfound(tx, u, p);
    case 'noinv':
      return noinv(tx, u, p);
    case 'room_done':
      return roomStatus(tx, u, p, true);
    case 'room_reopen':
      return roomStatus(tx, u, p, false);
    default:
      if (op.type.startsWith('tmz_')) return tmzOp(tx, u, op.type, p);
      throw bad('bad_op');
  }
}

export async function processOp(db: PrismaClient, u: SessionUser, op: OpIn): Promise<OpOut> {
  const id = typeof op.id === 'string' ? op.id.slice(0, 80) : '';
  if (!id) return { id, final: true, result: { status: 'rejected', error: 'bad_id' } };
  try {
    return await db.$transaction(
      async (tx) => {
        const prev = await tx.clientOp.findUnique({ where: { id } });
        if (prev) return { id, final: true, result: prev.result as R };
        let result: R;
        try {
          result = await run(tx, u, op);
        } catch (e) {
          if (!(e instanceof HttpError)) throw e;
          // doimiy xato (huquq yo'q, bo'lim o'chirilgan va h.k.) — telefon uni "qabul qilinmagan" ro'yxatiga oladi
          result = { status: 'rejected', error: e.code };
          throw Object.assign(new Error('rejected'), { rejected: result });
        }
        await tx.clientOp.create({ data: { id, userId: u.id, type: op.type, result: result as Prisma.InputJsonValue } });
        return { id, final: true, result };
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    const rej = (e as { rejected?: R }).rejected;
    if (rej) {
      // xatoni ham saqlab qo'yamiz (tranzaksiyadan tashqarida), takror yuborilsa bir xil javob
      await db.clientOp.createMany({ data: [{ id, userId: u.id, type: op.type, result: rej as Prisma.InputJsonValue }], skipDuplicates: true });
      return { id, final: true, result: rej };
    }
    console.error('op failed', op.type, e);
    return { id, final: false, result: { status: 'retry' } };
  }
}
