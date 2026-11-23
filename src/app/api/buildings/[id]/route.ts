import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { audit } from '@/server/audit';
import { toTrash } from '@/server/trash';

type P = { params: Promise<{ id: string }> };

export const PATCH = api<P>(async (req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  const b = await body(req);
  const name = str(b.name, 200);
  if (!name) throw bad('required');
  return prisma.$transaction(async (tx) => {
    const old = await tx.building.findUniqueOrThrow({ where: { id } });
    const r = await tx.building.update({ where: { id }, data: { name, note: str(b.note, 500) } });
    await audit(tx, u, 'building_update', { entity: 'building', entityId: id, details: { from: old.name, to: name } });
    return r;
  });
});

export const DELETE = api<P>(async (_req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  await prisma.$transaction(async (tx) => {
    const b = await tx.building.findUniqueOrThrow({ where: { id } });
    await tx.building.update({ where: { id }, data: { deletedAt: new Date() } });
    await toTrash(tx, u, 'building', b.name, { id });
    await audit(tx, u, 'building_delete', { entity: 'building', entityId: id, details: { name: b.name } });
  });
  return { ok: true };
});
