// TMZ (tovar-moddiy zaxira): inventar raqamsiz, son bo'yicha sanash (matras, postel va h.k.).
// Amallar skanlar kabi ID bilan keladi (offline navbat, qayta yozilmaslik).
import type { SessionUser } from './auth';
import { canViewBuilding, canWorkBuilding } from './auth';
import { audit } from './audit';
import { bad, forbidden, notFound } from './errors';
import { toTrash } from './trash';
import type { Tx } from './db';

export const TMZ_UNITS = ['dona', 'juft', 'kg', 'komplekt', 'metr'] as const;
const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(-100000, Math.min(100000, n)) : 0;
};

async function building(tx: Tx, u: SessionUser, id: string) {
  const b = await tx.building.findFirst({ where: { id, deletedAt: null } });
  if (!b) throw notFound('building_missing');
  if (!canWorkBuilding(u, b.id)) throw forbidden('no_access');
  return b;
}
async function room(tx: Tx, buildingId: string, name: string) {
  if (!name) throw bad('no_room');
  return tx.tmzRoom.upsert({ where: { buildingId_name: { buildingId, name } }, update: {}, create: { buildingId, name } });
}

export async function tmzOp(tx: Tx, u: SessionUser, type: string, p: Record<string, unknown>): Promise<{ status: string; [k: string]: unknown }> {
  if (type === 'tmz_delta' || type === 'tmz_set') {
    const b = await building(tx, u, s(p.buildingId, 60));
    const r = await room(tx, b.id, s(p.room, 100));
    const name = s(p.name, 200);
    const unit = TMZ_UNITS.includes(p.unit as (typeof TMZ_UNITS)[number]) ? (p.unit as string) : 'dona';
    if (!name) throw bad('required');
    const key = { roomId_name_unit: { roomId: r.id, name, unit } };
    let e;
    if (type === 'tmz_delta') {
      const dg = int(p.dGood),
        db = int(p.dBad);
      e = await tx.tmzEntry.upsert({
        where: key,
        update: { good: { increment: dg }, bad: { increment: db }, updatedBy: u.id },
        create: { roomId: r.id, name, unit, good: Math.max(0, dg), bad: Math.max(0, db), updatedBy: u.id },
      });
      if (e.good < 0 || e.bad < 0) e = await tx.tmzEntry.update({ where: { id: e.id }, data: { good: Math.max(0, e.good), bad: Math.max(0, e.bad) } });
    } else {
      const good = Math.max(0, int(p.good)),
        bd = Math.max(0, int(p.bad));
      e = await tx.tmzEntry.upsert({ where: key, update: { good, bad: bd, updatedBy: u.id }, create: { roomId: r.id, name, unit, good, bad: bd, updatedBy: u.id } });
    }
    await tx.tmzRoom.update({ where: { id: r.id }, data: { rev: { increment: 1 } } });
    // yakunlangan xonaga offline'da kelgan o'zgarish yo'qolmasin — saqlanadi, lekin bildiriladi
    return { status: r.status === 'DONE' ? 'tmz_saved_locked' : 'tmz_saved', id: e.id, good: e.good, bad: e.bad, room: r.name, name };
  }
  if (type === 'tmz_del') {
    const e = await tx.tmzEntry.findUnique({ where: { id: s(p.id, 60) }, include: { room: true } });
    if (!e) return { status: 'gone' };
    await building(tx, u, e.room.buildingId);
    if (e.room.status === 'DONE') throw bad('room_done');
    const { room: rm, ...row } = e;
    await toTrash(tx, u, 'tmzentry', `${rm.name}: ${e.name} (${e.good}+${e.bad} ${e.unit})`, { row, roomName: rm.name, buildingId: rm.buildingId });
    await tx.tmzEntry.delete({ where: { id: e.id } });
    await tx.tmzRoom.update({ where: { id: rm.id }, data: { rev: { increment: 1 } } });
    await audit(tx, u, 'tmz_delete', { entity: 'tmzentry', entityId: e.id, details: { room: rm.name, name: e.name, good: e.good, bad: e.bad } });
    return { status: 'cancelled', name: e.name };
  }
  if (type === 'tmz_room_done' || type === 'tmz_room_reopen') {
    const b = await building(tx, u, s(p.buildingId, 60));
    const r = await room(tx, b.id, s(p.room, 100));
    const done = type === 'tmz_room_done';
    await tx.tmzRoom.update({ where: { id: r.id }, data: done ? { status: 'DONE', doneAt: new Date(), doneById: u.id, rev: { increment: 1 } } : { status: 'IN_PROGRESS', doneAt: null, doneById: null, rev: { increment: 1 } } });
    await audit(tx, u, done ? 'tmz_room_done' : 'tmz_room_reopen', { entity: 'tmzroom', entityId: r.id, details: { building: b.name, room: r.name } });
    return { status: done ? 'room_done' : 'room_reopened', room: r.name };
  }
  throw bad('bad_op');
}

export async function tmzState(db: Tx, u: SessionUser, buildingId: string) {
  const b = await db.building.findFirst({ where: { id: buildingId, deletedAt: null } });
  if (!b) throw notFound();
  if (!canViewBuilding(u, b.id)) throw forbidden();
  const rooms = await db.tmzRoom.findMany({ where: { buildingId }, include: { entries: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
  const uids = new Set<string>();
  rooms.forEach((r) => {
    if (r.doneById) uids.add(r.doneById);
    r.entries.forEach((e) => uids.add(e.updatedBy));
  });
  const users = await db.user.findMany({ where: { id: { in: [...uids] } }, select: { id: true, fullName: true } });
  return {
    building: { id: b.id, name: b.name },
    canWork: canWorkBuilding(u, b.id),
    users: Object.fromEntries(users.map((x) => [x.id, x.fullName])),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      doneAt: r.doneAt,
      doneById: r.doneById,
      entries: r.entries.map((e) => ({ id: e.id, name: e.name, unit: e.unit, good: e.good, bad: e.bad, updatedBy: e.updatedBy, updatedAt: e.updatedAt })),
    })),
  };
}
