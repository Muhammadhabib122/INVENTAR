import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';

export const GET = api(async (req) => {
  await requireUser(['ADMIN']);
  const sp = new URL(req.url).searchParams;
  const before = sp.get('before');
  const q = (sp.get('q') || '').trim();
  const list = await prisma.auditLog.findMany({
    where: {
      ...(before ? { at: { lt: new Date(before) } } : {}),
      ...(sp.get('sectionId') ? { sectionId: sp.get('sectionId') } : {}),
      ...(q ? { OR: [{ action: { contains: q, mode: 'insensitive' } }, { userName: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { at: 'desc' },
    take: 100,
  });
  const secIds = [...new Set(list.map((x) => x.sectionId).filter((x): x is string => !!x))];
  const secs = await prisma.section.findMany({ where: { id: { in: secIds } }, select: { id: true, name: true } });
  return list.map((x) => ({ ...x, sectionName: secs.find((s) => s.id === x.sectionId)?.name ?? '' }));
});
