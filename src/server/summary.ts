// Yig'ma hisobot: har bir bo'lim alohida qatorda. Bo'limlar ma'lumotlari birlashtirilmaydi.
import type { SessionUser } from './auth';
import type { Tx } from './db';
import { listSections } from './sections';

export async function summary(db: Tx, u: SessionUser, buildingId?: string) {
  const secs = await listSections(db, u, buildingId);
  const ids = secs.map((s) => s.id);
  if (!ids.length) return [];
  const [sums, foundSums, other, dups, noinv, elsewhere] = await Promise.all([
    db.$queryRaw<{ sectionId: string; s: number }[]>`SELECT "sectionId", COALESCE(SUM("sum"),0)::float AS s FROM "Item" WHERE "sectionId" = ANY(${ids}::text[]) AND "delistedAt" IS NULL GROUP BY "sectionId"`,
    db.$queryRaw<{ sectionId: string; s: number }[]>`
      SELECT f."sectionId", COALESCE(SUM(i."sum"),0)::float AS s FROM "Found" f JOIN "Item" i ON i."sectionId" = f."sectionId" AND i."inv" = f."inv"
      WHERE f."sectionId" = ANY(${ids}::text[]) AND i."delistedAt" IS NULL GROUP BY f."sectionId"`,
    db.extra.groupBy({ by: ['sectionId', 'kind'], where: { sectionId: { in: ids } }, _count: true }),
    db.duplicate.groupBy({ by: ['sectionId'], where: { sectionId: { in: ids } }, _count: true }),
    db.noInvItem.groupBy({ by: ['sectionId'], where: { sectionId: { in: ids } }, _count: true, _sum: { qty: true } }),
    db.$queryRaw<{ sid: string; n: bigint }[]>`
      SELECT e."otherSectionId" AS sid, COUNT(DISTINCT e."inv") AS n FROM "Extra" e JOIN "Section" s ON s.id = e."sectionId"
      LEFT JOIN "Found" f ON f."sectionId" = e."otherSectionId" AND f."inv" = e."inv"
      WHERE e."otherSectionId" = ANY(${ids}::text[]) AND s."deletedAt" IS NULL AND f.id IS NULL GROUP BY e."otherSectionId"`,
  ]);
  const g = <T extends { sectionId: string }>(a: T[], id: string) => a.filter((x) => x.sectionId === id);
  return secs.map((s) => {
    const totalSum = sums.find((x) => x.sectionId === s.id)?.s || 0;
    const foundSum = foundSums.find((x) => x.sectionId === s.id)?.s || 0;
    return {
      ...s,
      totalSum,
      foundSum,
      missing: s.total - s.found,
      missingSum: totalSum - foundSum,
      extrasNotInDb: g(other, s.id).find((x) => x.kind === 'NOT_IN_DB')?._count || 0,
      otherSection: g(other, s.id).find((x) => x.kind === 'OTHER_SECTION')?._count || 0,
      dups: g(dups, s.id)[0]?._count || 0,
      noInv: g(noinv, s.id)[0]?._count || 0,
      noInvQty: g(noinv, s.id)[0]?._sum.qty || 0,
      elsewhere: Number(elsewhere.find((x) => x.sid === s.id)?.n || 0),
    };
  });
}
export type SummaryRow = Awaited<ReturnType<typeof summary>>[number];
