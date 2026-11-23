// Bo'limlar (har bir Excel fayl — alohida bo'lim) bilan ishlash.
// Muhim: barcha o'zgarishlar faqat ko'rsatilgan sectionId ga tegishli yozuvlarga ta'sir qiladi.
import { Prisma, type PrismaClient } from '@prisma/client';
import type { SessionUser } from './auth';
import { canViewBuilding, canWorkBuilding } from './auth';
import { audit } from './audit';
import { bad, forbidden, notFound } from './errors';
import { nameFromFile, parseWorkbook, type ParseResult, type ParsedItem } from './excel';
import { toTrash } from './trash';
import type { Tx } from './db';

export const SAME_FILE_OVERLAP = 0.8;

export type CrossHit = { sectionId: string; sectionName: string; buildingName: string; originalFileName: string; count: number; sample: { inv: string; name: string; mol: string }[] };

/** Fayldagi raqamlar boshqa qaysi bo'limlarda borligini topadi */
export async function crossSections(db: Tx, invs: string[], excludeSectionId?: string | null): Promise<CrossHit[]> {
  if (!invs.length) return [];
  const rows = await db.$queryRaw<{ sectionId: string; sectionName: string; buildingName: string; originalFileName: string; inv: string; name: string; mol: string }[]>`
    SELECT i."sectionId", s."name" AS "sectionName", b."name" AS "buildingName", s."originalFileName", i."inv", i."name", i."mol"
    FROM "Item" i JOIN "Section" s ON s.id = i."sectionId" JOIN "Building" b ON b.id = s."buildingId"
    WHERE i."inv" = ANY(${invs}::text[]) AND s."deletedAt" IS NULL AND b."deletedAt" IS NULL AND i."delistedAt" IS NULL
      AND (${excludeSectionId ?? null}::text IS NULL OR i."sectionId" <> ${excludeSectionId ?? null}::text)
    ORDER BY i."sectionId", i."ord"`;
  const m = new Map<string, CrossHit>();
  for (const r of rows) {
    let h = m.get(r.sectionId);
    if (!h) m.set(r.sectionId, (h = { sectionId: r.sectionId, sectionName: r.sectionName, buildingName: r.buildingName, originalFileName: r.originalFileName, count: 0, sample: [] }));
    h.count++;
    if (h.sample.length < 300) h.sample.push({ inv: r.inv, name: r.name, mol: r.mol });
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export type SameFile = { sectionId: string; name: string; buildingName: string; originalFileName: string; reason: 'name' | 'overlap' | 'both'; overlap: number };

export type ImportAnalysis = {
  draftId: string;
  fileName: string;
  suggestedName: string;
  buildingId: string;
  stats: { items: number; dup: number; conflicts: number; skippedTotals: number; sheets: number };
  conflicts: { inv: string; names: string[] }[];
  sameFile: SameFile[];
  cross: CrossHit[];
  crossTotal: number;
};

export async function analyze(db: Tx, fileName: string, parsed: ParseResult) {
  const invs = parsed.items.map((x) => x.inv);
  const cross = await crossSections(db, invs);
  const byName = await db.section.findMany({
    where: { deletedAt: null, building: { deletedAt: null }, originalFileName: { equals: fileName, mode: 'insensitive' } },
    include: { building: true },
  });
  const same = new Map<string, SameFile>();
  for (const s of byName) same.set(s.id, { sectionId: s.id, name: s.name, buildingName: s.building.name, originalFileName: s.originalFileName, reason: 'name', overlap: 0 });
  for (const c of cross) {
    const ov = invs.length ? c.count / invs.length : 0;
    const e = same.get(c.sectionId);
    if (e) {
      e.overlap = ov;
      if (ov > SAME_FILE_OVERLAP) e.reason = 'both';
    } else if (ov > SAME_FILE_OVERLAP) {
      same.set(c.sectionId, { sectionId: c.sectionId, name: c.sectionName, buildingName: c.buildingName, originalFileName: c.originalFileName, reason: 'overlap', overlap: ov });
    }
  }
  // takroriy raqamlarning umumiy soni (bir nechta bo'limda bo'lsa ham bitta raqam bir marta)
  const crossInvs = new Set<string>();
  if (cross.length) {
    const rows = await db.$queryRaw<{ inv: string }[]>`
      SELECT DISTINCT i."inv" FROM "Item" i JOIN "Section" s ON s.id = i."sectionId" JOIN "Building" b ON b.id = s."buildingId"
      WHERE i."inv" = ANY(${invs}::text[]) AND s."deletedAt" IS NULL AND b."deletedAt" IS NULL AND i."delistedAt" IS NULL`;
    rows.forEach((r) => crossInvs.add(r.inv));
  }
  return { sameFile: [...same.values()], cross, crossTotal: crossInvs.size };
}

/** 1-qadam: faylni o'qish, vaqtinchalik saqlash va tahlil qilish. Bazadagi bo'limlarga hech narsa yozilmaydi. */
export async function createDraft(db: PrismaClient, u: SessionUser, buildingId: string, fileName: string, buf: Buffer): Promise<ImportAnalysis> {
  if (u.role !== 'ADMIN') throw forbidden();
  const b = await db.building.findFirst({ where: { id: buildingId, deletedAt: null } });
  if (!b) throw notFound();
  let parsed: ParseResult;
  try {
    parsed = parseWorkbook(buf);
  } catch {
    throw bad('file_unreadable');
  }
  if (!parsed.items.length) throw bad('no_items');
  // eski qoralamalarni tozalash
  await db.importDraft.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400_000) } } });
  const d = await db.importDraft.create({ data: { userId: u.id, buildingId, kind: 'excel', fileName, data: new Uint8Array(buf), parsed: parsed as unknown as Prisma.InputJsonValue } });
  const a = await analyze(db, fileName, parsed);
  return {
    draftId: d.id,
    fileName,
    suggestedName: nameFromFile(fileName),
    buildingId,
    stats: { items: parsed.items.length, dup: parsed.dup, conflicts: parsed.conflicts.length, skippedTotals: parsed.skippedTotals, sheets: parsed.sheets },
    conflicts: parsed.conflicts.slice(0, 500),
    ...a,
  };
}

async function getDraft(db: Tx, u: SessionUser, draftId: string) {
  const d = await db.importDraft.findUnique({ where: { id: draftId } });
  if (!d || d.userId !== u.id || d.kind !== 'excel') throw bad('draft_missing');
  return { draft: d, parsed: d.parsed as unknown as ParseResult };
}

/** "Yangi bo'lim sifatida qo'shish" */
export async function commitNew(db: PrismaClient, u: SessionUser, draftId: string, name?: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  return db.$transaction(
    async (tx) => {
      const { draft, parsed } = await getDraft(tx, u, draftId);
      const sec = await tx.section.create({
        data: {
          buildingId: draft.buildingId!,
          name: (name || '').trim().slice(0, 200) || nameFromFile(draft.fileName),
          originalFileName: draft.fileName,
          uploadedById: u.id,
          importInfo: { dup: parsed.dup, conflicts: parsed.conflicts, skippedTotals: parsed.skippedTotals, sheets: parsed.sheets } as Prisma.InputJsonValue,
        },
      });
      await tx.sectionFile.create({ data: { sectionId: sec.id, fileName: draft.fileName, data: draft.data, uploadedBy: u.id, kind: 'initial' } });
      for (let i = 0; i < parsed.items.length; i += 1000) {
        await tx.item.createMany({ data: parsed.items.slice(i, i + 1000).map((x, k) => ({ ...x, sectionId: sec.id, ord: i + k })) });
      }
      await tx.importDraft.delete({ where: { id: draft.id } });
      await audit(tx, u, 'section_import', { entity: 'section', entityId: sec.id, sectionId: sec.id, details: { file: draft.fileName, items: parsed.items.length, dup: parsed.dup, conflicts: parsed.conflicts.length } });
      return { sectionId: sec.id, items: parsed.items.length, dup: parsed.dup, conflicts: parsed.conflicts.length };
    },
    { timeout: 120_000 },
  );
}

export type UpdateDiff = {
  sectionId: string;
  added: ParsedItem[];
  delisted: { inv: string; name: string }[];
  relisted: { inv: string; name: string }[];
  changed: { inv: string; before: Partial<ParsedItem>; after: Partial<ParsedItem> }[];
  unchanged: number;
};

const FIELDS = ['name', 'unit', 'mol', 'dept', 'sum'] as const;

export async function computeDiff(db: Tx, sectionId: string, parsed: ParseResult): Promise<UpdateDiff> {
  const existing = await db.item.findMany({ where: { sectionId } });
  const ex = new Map(existing.map((x) => [x.inv, x]));
  const inFile = new Set(parsed.items.map((x) => x.inv));
  const d: UpdateDiff = { sectionId, added: [], delisted: [], relisted: [], changed: [], unchanged: 0 };
  for (const it of parsed.items) {
    const e = ex.get(it.inv);
    if (!e) {
      d.added.push(it);
      continue;
    }
    if (e.delistedAt) d.relisted.push({ inv: it.inv, name: it.name });
    const before: Partial<ParsedItem> = {},
      after: Partial<ParsedItem> = {};
    for (const f of FIELDS) {
      if (String(e[f]) !== String(it[f])) {
        (before as Record<string, unknown>)[f] = e[f];
        (after as Record<string, unknown>)[f] = it[f];
      }
    }
    if (Object.keys(after).length) d.changed.push({ inv: it.inv, before, after });
    else if (!e.delistedAt) d.unchanged++;
  }
  for (const e of existing) if (!inFile.has(e.inv) && !e.delistedAt) d.delisted.push({ inv: e.inv, name: e.name });
  return d;
}

export async function previewUpdate(db: PrismaClient, u: SessionUser, draftId: string, sectionId: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  const { parsed } = await getDraft(db, u, draftId);
  const s = await db.section.findFirst({ where: { id: sectionId, deletedAt: null } });
  if (!s) throw notFound();
  const d = await computeDiff(db, sectionId, parsed);
  return { ...d, added: d.added.slice(0, 300), addedCount: d.added.length, delisted: d.delisted.slice(0, 300), delistedCount: d.delisted.length, relisted: d.relisted.slice(0, 300), relistedCount: d.relisted.length, changed: d.changed.slice(0, 300), changedCount: d.changed.length };
}

/** "Mavjud bo'limni yangilash": skanlar saqlanadi, yangilari qo'shiladi, yo'qolganlari "ro'yxatdan chiqarilgan" bo'ladi */
export async function commitUpdate(db: PrismaClient, u: SessionUser, draftId: string, sectionId: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  return db.$transaction(
    async (tx) => {
      const { draft, parsed } = await getDraft(tx, u, draftId);
      const s = await tx.section.findFirst({ where: { id: sectionId, deletedAt: null } });
      if (!s) throw notFound();
      const d = await computeDiff(tx, sectionId, parsed);
      const maxOrd = (await tx.item.aggregate({ where: { sectionId }, _max: { ord: true } }))._max.ord ?? 0;
      for (let i = 0; i < d.added.length; i += 1000)
        await tx.item.createMany({ data: d.added.slice(i, i + 1000).map((x, k) => ({ ...x, sectionId, ord: maxOrd + 1 + i + k })) });
      const now = new Date();
      if (d.delisted.length) await tx.item.updateMany({ where: { sectionId, inv: { in: d.delisted.map((x) => x.inv) } }, data: { delistedAt: now } });
      if (d.relisted.length) await tx.item.updateMany({ where: { sectionId, inv: { in: d.relisted.map((x) => x.inv) } }, data: { delistedAt: null } });
      for (const c of d.changed) await tx.item.update({ where: { sectionId_inv: { sectionId, inv: c.inv } }, data: c.after });
      await tx.sectionFile.create({ data: { sectionId, fileName: draft.fileName, data: draft.data, uploadedBy: u.id, kind: 'update' } });
      const info = (s.importInfo || {}) as Record<string, unknown>;
      await tx.section.update({
        where: { id: sectionId },
        data: { rev: { increment: 1 }, importInfo: { ...info, dup: parsed.dup, conflicts: parsed.conflicts, lastUpdate: now.toISOString() } as Prisma.InputJsonValue },
      });
      await tx.importDraft.delete({ where: { id: draft.id } });
      const res = { added: d.added.length, delisted: d.delisted.length, relisted: d.relisted.length, changed: d.changed.length };
      await audit(tx, u, 'section_update_file', { entity: 'section', entityId: sectionId, sectionId, details: { file: draft.fileName, ...res } });
      return { sectionId, ...res };
    },
    { timeout: 120_000 },
  );
}

export async function getSectionChecked(db: Tx, u: SessionUser, sectionId: string, work = false) {
  const s = await db.section.findFirst({ where: { id: sectionId, deletedAt: null, building: { deletedAt: null } }, include: { building: true } });
  if (!s) throw notFound();
  if (!(work ? canWorkBuilding(u, s.buildingId) : canViewBuilding(u, s.buildingId))) throw forbidden();
  return s;
}

export async function renameSection(db: PrismaClient, u: SessionUser, sectionId: string, name: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  name = name.trim().slice(0, 200);
  if (!name) throw bad('required');
  return db.$transaction(async (tx) => {
    const s = await getSectionChecked(tx, u, sectionId);
    await tx.section.update({ where: { id: sectionId }, data: { name, rev: { increment: 1 } } });
    await audit(tx, u, 'section_rename', { entity: 'section', entityId: sectionId, sectionId, details: { from: s.name, to: name } });
  });
}

export async function setSectionStatus(db: PrismaClient, u: SessionUser, sectionId: string, done: boolean) {
  if (u.role !== 'ADMIN') throw forbidden();
  return db.$transaction(async (tx) => {
    await getSectionChecked(tx, u, sectionId);
    await tx.section.update({
      where: { id: sectionId },
      data: done ? { status: 'DONE', doneAt: new Date(), doneById: u.id, rev: { increment: 1 } } : { status: 'ACTIVE', doneAt: null, doneById: null, rev: { increment: 1 } },
    });
    await audit(tx, u, done ? 'section_done' : 'section_reopen', { entity: 'section', entityId: sectionId, sectionId });
  });
}

/** Natijalarni tozalash: faqat shu bo'limning skanlari savatga ko'chiriladi. Buyumlar ro'yxati qoladi. */
export async function clearSection(db: PrismaClient, u: SessionUser, sectionId: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  return db.$transaction(
    async (tx) => {
      const s = await getSectionChecked(tx, u, sectionId);
      const where = { sectionId };
      const [founds, dups, extras, noInv, pending, rooms] = await Promise.all([
        tx.found.findMany({ where }),
        tx.duplicate.findMany({ where }),
        tx.extra.findMany({ where }),
        tx.noInvItem.findMany({ where }),
        tx.pendingScan.findMany({ where }),
        tx.room.findMany({ where }),
      ]);
      await toTrash(tx, u, 'clear', s.name, { sectionId, founds, dups, extras, noInv, pending, rooms }, sectionId);
      await tx.found.deleteMany({ where });
      await tx.duplicate.deleteMany({ where });
      await tx.extra.deleteMany({ where });
      await tx.noInvItem.deleteMany({ where });
      await tx.pendingScan.deleteMany({ where });
      await tx.room.deleteMany({ where });
      await tx.section.update({ where: { id: sectionId }, data: { rev: { increment: 1 } } });
      await audit(tx, u, 'section_clear', { entity: 'section', entityId: sectionId, sectionId, details: { founds: founds.length, extras: extras.length, dups: dups.length, noInv: noInv.length } });
      return { founds: founds.length };
    },
    { timeout: 60_000 },
  );
}

/** O'chirish: bo'lim savatga tushadi (yumshoq o'chirish), boshqa bo'limlarga tegilmaydi */
export async function deleteSection(db: PrismaClient, u: SessionUser, sectionId: string) {
  if (u.role !== 'ADMIN') throw forbidden();
  return db.$transaction(async (tx) => {
    const s = await getSectionChecked(tx, u, sectionId);
    await tx.section.update({ where: { id: sectionId }, data: { deletedAt: new Date(), rev: { increment: 1 } } });
    await toTrash(tx, u, 'section', `${s.name} (${s.building.name})`, { id: sectionId }, sectionId);
    await audit(tx, u, 'section_delete', { entity: 'section', entityId: sectionId, sectionId, details: { name: s.name } });
  });
}

export type SectionRow = {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  originalFileName: string;
  uploadedAt: Date;
  uploadedBy: string;
  status: string;
  total: number;
  found: number;
  extras: number;
  rooms: number;
  roomsDone: number;
};

export async function listSections(db: Tx, u: SessionUser, buildingId?: string): Promise<SectionRow[]> {
  const secs = await db.section.findMany({
    where: { deletedAt: null, building: { deletedAt: null }, ...(buildingId ? { buildingId } : {}) },
    include: { building: true },
    orderBy: [{ building: { name: 'asc' } }, { uploadedAt: 'asc' }],
  });
  const vis = secs.filter((s) => canViewBuilding(u, s.buildingId));
  if (!vis.length) return [];
  const ids = vis.map((s) => s.id);
  const [tot, fnd, ext, rooms, users] = await Promise.all([
    db.item.groupBy({ by: ['sectionId'], where: { sectionId: { in: ids }, delistedAt: null }, _count: true }),
    db.$queryRaw<{ sectionId: string; n: bigint }[]>`
      SELECT f."sectionId", COUNT(*) AS n FROM "Found" f JOIN "Item" i ON i."sectionId" = f."sectionId" AND i."inv" = f."inv"
      WHERE f."sectionId" = ANY(${ids}::text[]) AND i."delistedAt" IS NULL GROUP BY f."sectionId"`,
    db.extra.groupBy({ by: ['sectionId'], where: { sectionId: { in: ids } }, _count: true }),
    db.room.groupBy({ by: ['sectionId', 'status'], where: { sectionId: { in: ids } }, _count: true }),
    db.user.findMany({ where: { id: { in: vis.map((s) => s.uploadedById) } }, select: { id: true, fullName: true } }),
  ]);
  const m = <T extends { sectionId: string }>(a: T[], f: (x: T) => number) => new Map(a.map((x) => [x.sectionId, f(x)]));
  const T = m(tot, (x) => x._count),
    F = m(fnd, (x) => Number(x.n)),
    E = m(ext, (x) => x._count);
  const U = new Map(users.map((x) => [x.id, x.fullName]));
  return vis.map((s) => ({
    id: s.id,
    name: s.name,
    buildingId: s.buildingId,
    buildingName: s.building.name,
    originalFileName: s.originalFileName,
    uploadedAt: s.uploadedAt,
    uploadedBy: U.get(s.uploadedById) || '',
    status: s.status,
    total: T.get(s.id) || 0,
    found: F.get(s.id) || 0,
    extras: E.get(s.id) || 0,
    rooms: rooms.filter((r) => r.sectionId === s.id).reduce((a, r) => a + r._count, 0),
    roomsDone: rooms.filter((r) => r.sectionId === s.id && r.status === 'DONE').reduce((a, r) => a + r._count, 0),
  }));
}
