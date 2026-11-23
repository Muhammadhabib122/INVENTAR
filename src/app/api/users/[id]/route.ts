import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { hashPassword, requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { audit } from '@/server/audit';
import { toTrash } from '@/server/trash';
import type { Role } from '@prisma/client';

type P = { params: Promise<{ id: string }> };
const ROLES: Role[] = ['ADMIN', 'COMMISSION', 'VIEWER'];

export const PATCH = api<P>(async (req, { params }) => {
  const me = await requireUser(['ADMIN']);
  const { id } = await params;
  const b = await body(req);
  const data: Record<string, unknown> = {};
  if (typeof b.fullName === 'string' && str(b.fullName)) data.fullName = str(b.fullName, 200);
  if (ROLES.includes(b.role as Role)) data.role = b.role;
  if (typeof b.active === 'boolean') {
    if (id === me.id && !b.active) throw bad('user_self');
    data.active = b.active;
  }
  if (typeof b.password === 'string' && b.password) {
    if (b.password.length < 8) throw bad('password_short');
    data.passwordHash = await hashPassword(b.password);
  }
  if (id === me.id && data.role && data.role !== 'ADMIN') throw bad('user_self');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });
    if (Array.isArray(b.buildingIds)) {
      const ids = (b.buildingIds as unknown[]).filter((x): x is string => typeof x === 'string');
      await tx.userBuilding.deleteMany({ where: { userId: id } });
      if (ids.length) await tx.userBuilding.createMany({ data: ids.map((buildingId) => ({ userId: id, buildingId })) });
    }
    if (data.passwordHash || data.active === false) await tx.session.deleteMany({ where: { userId: id } });
    const { passwordHash, ...shown } = data;
    await audit(tx, me, 'user_update', { entity: 'user', entityId: id, details: { ...shown, passwordReset: !!passwordHash, buildingIds: b.buildingIds } });
  });
  return { ok: true };
});

export const DELETE = api<P>(async (_req, { params }) => {
  const me = await requireUser(['ADMIN']);
  const { id } = await params;
  if (id === me.id) throw bad('user_self');
  await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await tx.session.deleteMany({ where: { userId: id } });
    await toTrash(tx, me, 'user', `${u.fullName} (${u.username})`, { id });
    await audit(tx, me, 'user_delete', { entity: 'user', entityId: id, details: { username: u.username } });
  });
  return { ok: true };
});
