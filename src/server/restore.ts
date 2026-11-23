// Savatdan tiklash. Tiklash faqat o'sha yozuv tegishli bo'lgan bo'limga ta'sir qiladi.
import type { PrismaClient, Prisma } from '@prisma/client';
import type { SessionUser } from './auth';
import { audit } from './audit';
import { bad, forbidden, notFound } from './errors';
import type { Tx } from './db';

type Row = Record<string, any>;

async function roomFor(tx: Tx, sectionId: string, oldId: string, name: string, cache: Map<string, string>) {
  if (cache.has(oldId)) return cache.get(oldId)!;
  const byId = await tx.room.findUnique({ where: { id: oldId } });
  let id = byId?.sectionId === sectionId ? byId.id : '';
  if (!id && name) id = (await tx.room.upsert({ where: { sectionId_name: { sectionId, name } }, update: {}, create: { sectionId, name } })).id;
  if (!id) id = (await tx.room.upsert({ where: { sectionId_name: { sectionId, name: '?' } }, update: {}, create: { sectionId, name: '?' } })).id;
  cache.set(oldId, id);
  return id;
}

async function insertRow(tx: Tx, table: string, r: Row): Promise<boolean> {
  const { id, ...rest } = r;
  const data = { id, ...rest } as Row as never;
  let n = 0;
  if (table === 'found') n = (await tx.found.createMany({ data: [data], skipDuplicates: true })).count;
  else if (table === 'extra') n = (await tx.extra.createMany({ data: [data], skipDuplicates: true })).count;
  else if (table === 'dup') n = (await tx.duplicate.createMany({ data: [data], skipDuplicates: true })).count;
  else if (table === 'noinv') n = (await tx.noInvItem.createMany({ data: [data], skipDuplicates: true })).count;
  else if (table === 'pending') n = (await tx.pendingScan.createMany({ data: [{ ...(data as Row), info: (r.info ?? {}) as Prisma.InputJsonValue } as never], skipDuplicates: true })).count;
  return n === 1;
}

export async function restoreTrash(db: PrismaClient, u: SessionUser, trashId: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  return db.$transaction(
    async (tx) => {
      const e = await tx.trashEntry.findUnique({ where: { id: trashId } });
      if (!e) throw notFound();
      if (e.restoredAt) throw bad('already_restored');
      const p = e.payload as Row;
      let restored = 0,
        skipped = 0;
      switch (e.kind) {
        case 'building':
          await tx.building.update({ where: { id: p.id }, data: { deletedAt: null } });
          restored = 1;
          break;
        case 'user':
          await tx.user.update({ where: { id: p.id }, data: { deletedAt: null, active: true } });
          restored = 1;
          break;
        case 'section': {
          const s = await tx.section.findUniqueOrThrow({ where: { id: p.id }, include: { building: true } });
          if (s.building.deletedAt) throw bad('building_deleted');
          await tx.section.update({ where: { id: p.id }, data: { deletedAt: null, rev: { increment: 1 } } });
          restored = 1;
          break;
        }
        case 'found':
        case 'extra':
        case 'dup':
        case 'noinv': {
          const r = { ...(p.row as Row) };
          const sec = await tx.section.findUnique({ where: { id: r.sectionId } });
          if (!sec) throw notFound();
          r.roomId = await roomFor(tx, r.sectionId, r.roomId, p.roomName || '', new Map());
          if (await insertRow(tx, e.kind, r)) restored = 1;
          else skipped = 1;
          await tx.section.update({ where: { id: r.sectionId }, data: { rev: { increment: 1 } } });
          break;
        }
        case 'clear': {
          const sectionId = p.sectionId as string;
          const map = new Map<string, string>();
          for (const r of p.rooms as Row[]) {
            const ex = await tx.room.findUnique({ where: { sectionId_name: { sectionId, name: r.name } } });
            if (ex) map.set(r.id, ex.id);
            else {
              await tx.room.create({ data: { id: r.id, sectionId, name: r.name, status: r.status, doneAt: r.doneAt, doneById: r.doneById, createdAt: r.createdAt } });
              map.set(r.id, r.id);
            }
          }
          const groups: [string, Row[]][] = [
            ['found', p.founds],
            ['dup', p.dups],
            ['extra', p.extras],
            ['noinv', p.noInv],
            ['pending', p.pending],
          ];
          for (const [table, rows] of groups)
            for (const r0 of rows || []) {
              const r = { ...r0, roomId: map.get(r0.roomId) ?? (await roomFor(tx, sectionId, r0.roomId, '', map)) };
              if (await insertRow(tx, table, r)) restored++;
              else skipped++;
            }
          await tx.section.update({ where: { id: sectionId }, data: { rev: { increment: 1 } } });
          break;
        }
        case 'tmzentry': {
          const r = p.row as Row;
          const rm = await tx.tmzRoom.upsert({ where: { buildingId_name: { buildingId: p.buildingId, name: p.roomName } }, update: {}, create: { buildingId: p.buildingId, name: p.roomName } });
          const n = await tx.tmzEntry.createMany({ data: [{ id: r.id, roomId: rm.id, name: r.name, unit: r.unit, good: r.good, bad: r.bad, updatedBy: r.updatedBy }], skipDuplicates: true });
          if (n.count) restored = 1;
          else skipped = 1;
          await tx.tmzRoom.update({ where: { id: rm.id }, data: { rev: { increment: 1 } } });
          break;
        }
        default:
          throw bad('bad_kind');
      }
      await tx.trashEntry.update({ where: { id: e.id }, data: { restoredAt: new Date(), restoredBy: `${u.fullName} (${u.username})` } });
      await audit(tx, u, 'trash_restore', { entity: e.kind, entityId: e.id, sectionId: e.sectionId, details: { label: e.label, restored, skipped } });
      return { restored, skipped };
    },
    { timeout: 60_000 },
  );
}
