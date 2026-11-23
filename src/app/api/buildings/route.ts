import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { buildingFilter, requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { audit } from '@/server/audit';

export const GET = api(async () => {
  const u = await requireUser();
  const list = await prisma.building.findMany({
    where: { deletedAt: null, ...buildingFilter(u) },
    orderBy: { name: 'asc' },
    include: { _count: { select: { sections: { where: { deletedAt: null } } } } },
  });
  return list.map((b) => ({ id: b.id, name: b.name, note: b.note, sections: b._count.sections }));
});

export const POST = api(async (req) => {
  const u = await requireUser(['ADMIN']);
  const b = await body(req);
  const name = str(b.name, 200);
  if (!name) throw bad('required');
  const row = await prisma.$transaction(async (tx) => {
    const r = await tx.building.create({ data: { name, note: str(b.note, 500) } });
    await audit(tx, u, 'building_create', { entity: 'building', entityId: r.id, details: { name } });
    return r;
  });
  return row;
});
