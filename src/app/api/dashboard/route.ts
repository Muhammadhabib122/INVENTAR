import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { listSections } from '@/server/sections';

/** Bosh sahifa: bino va bo'limlar bo'yicha bajarilish foizi, kim qancha skanerlagani */
export const GET = api(async () => {
  const u = await requireUser();
  const secs = await listSections(prisma, u);
  const ids = secs.map((s) => s.id);
  // Toshkent vaqti UTC+5 (yozgi vaqt yo'q): bugungi kun boshi
  const H5 = 5 * 3600_000;
  const since = new Date(Math.floor((Date.now() + H5) / 86400_000) * 86400_000 - H5);
  const [f, e, n, d, fToday] = await Promise.all([
    prisma.found.groupBy({ by: ['userId'], where: { sectionId: { in: ids } }, _count: true }),
    prisma.extra.groupBy({ by: ['userId'], where: { sectionId: { in: ids } }, _count: true }),
    prisma.noInvItem.groupBy({ by: ['userId'], where: { sectionId: { in: ids } }, _count: true }),
    prisma.duplicate.groupBy({ by: ['userId'], where: { sectionId: { in: ids } }, _count: true }),
    prisma.found.groupBy({ by: ['userId'], where: { sectionId: { in: ids }, at: { gte: since } }, _count: true }),
  ]);
  const uids = [...new Set([...f, ...e, ...n, ...d].map((x) => x.userId))];
  const users = await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, fullName: true } });
  const c = (a: { userId: string; _count: number }[], id: string) => a.find((x) => x.userId === id)?._count || 0;
  const people = users
    .map((x) => ({ id: x.id, name: x.fullName, found: c(f, x.id), other: c(e, x.id) + c(n, x.id) + c(d, x.id), today: c(fToday, x.id) }))
    .sort((a, b) => b.found + b.other - (a.found + a.other));
  return { sections: secs, people };
});
