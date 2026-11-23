// Bo'limning joriy holati (skanlar, xonalar, ortiqchalar...). rev o'zgarmagan bo'lsa bo'sh javob.
import type { SessionUser } from './auth';
import type { Tx } from './db';
import { getSectionChecked } from './sections';

export async function sectionState(db: Tx, u: SessionUser, sectionId: string, knownRev?: number) {
  const sec = await getSectionChecked(db, u, sectionId);
  if (knownRev !== undefined && knownRev === sec.rev) return { rev: sec.rev, same: true as const };
  const where = { sectionId };
  const [rooms, founds, extras, dups, noInv, pending, elsewhere] = await Promise.all([
    db.room.findMany({ where, orderBy: { name: 'asc' } }),
    db.found.findMany({ where, orderBy: { at: 'asc' } }),
    db.extra.findMany({ where, orderBy: { at: 'asc' } }),
    db.duplicate.findMany({ where, orderBy: { at: 'asc' } }),
    db.noInvItem.findMany({ where, orderBy: { at: 'asc' } }),
    db.pendingScan.findMany({ where: { sectionId, resolvedAt: null, ...(u.role === 'ADMIN' ? {} : { userId: u.id }) }, orderBy: { at: 'asc' } }),
    // boshqa bo'limlarda shu bo'lim buyumlari topilgan joylar
    db.extra.findMany({ where: { otherSectionId: sectionId, section: { deletedAt: null } }, include: { section: { include: { building: true } } } }),
  ]);
  const otherSecIds = [...new Set(extras.map((e) => e.otherSectionId).filter((x): x is string => !!x))];
  const otherSecs = otherSecIds.length ? await db.section.findMany({ where: { id: { in: otherSecIds } }, include: { building: true } }) : [];
  const otherRoomIds = [...new Set(elsewhere.map((e) => e.roomId))];
  const otherRooms = otherRoomIds.length ? await db.room.findMany({ where: { id: { in: otherRoomIds } } }) : [];
  const userIds = new Set<string>();
  [founds, extras, dups, noInv, pending, elsewhere].forEach((a) => a.forEach((x) => userIds.add(x.userId)));
  rooms.forEach((r) => r.doneById && userIds.add(r.doneById));
  if (sec.doneById) userIds.add(sec.doneById);
  const users = await db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, fullName: true } });
  return {
    rev: sec.rev,
    same: false as const,
    status: sec.status,
    doneAt: sec.doneAt,
    doneById: sec.doneById,
    users: Object.fromEntries(users.map((x) => [x.id, x.fullName])),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, status: r.status, doneAt: r.doneAt, doneById: r.doneById })),
    founds: founds.map((f) => ({ id: f.id, inv: f.inv, roomId: f.roomId, userId: f.userId, at: f.at, source: f.source })),
    extras: extras.map((e) => {
      const o = otherSecs.find((x) => x.id === e.otherSectionId);
      return { id: e.id, inv: e.inv, kind: e.kind, otherSectionId: e.otherSectionId, otherSection: o ? `${o.name} (${o.building.name})` : '', roomId: e.roomId, userId: e.userId, at: e.at };
    }),
    dups: dups.map((d) => ({ id: d.id, inv: d.inv, roomId: d.roomId, userId: d.userId, at: d.at })),
    noInv: noInv.map((n) => ({ id: n.id, roomId: n.roomId, name: n.name, qty: n.qty, condition: n.condition, note: n.note, userId: n.userId, at: n.at })),
    pending: pending.map((p) => ({ id: p.id, inv: p.inv, roomId: p.roomId, userId: p.userId, at: p.at, reason: p.reason, info: p.info })),
    elsewhere: elsewhere.map((e) => ({
      inv: e.inv,
      sectionId: e.sectionId,
      sectionName: e.section.name,
      buildingName: e.section.building.name,
      room: otherRooms.find((r) => r.id === e.roomId)?.name ?? '',
      userId: e.userId,
      at: e.at,
    })),
  };
}
export type SectionState = Exclude<Awaited<ReturnType<typeof sectionState>>, { same: true }>;
