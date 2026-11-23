import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { hashPassword, requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { audit } from '@/server/audit';
import type { Role } from '@prisma/client';

const ROLES: Role[] = ['ADMIN', 'COMMISSION', 'VIEWER'];

export const GET = api(async () => {
  await requireUser(['ADMIN']);
  const list = await prisma.user.findMany({ where: { deletedAt: null }, orderBy: { fullName: 'asc' }, include: { buildings: true } });
  return list.map((u) => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, active: u.active, lang: u.lang, buildingIds: u.buildings.map((b) => b.buildingId), createdAt: u.createdAt }));
});

export const POST = api(async (req) => {
  const me = await requireUser(['ADMIN']);
  const b = await body(req);
  const username = str(b.username, 60).toLowerCase();
  const fullName = str(b.fullName, 200);
  const role = ROLES.includes(b.role as Role) ? (b.role as Role) : 'COMMISSION';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!/^[a-z0-9._-]{3,60}$/.test(username) || !fullName) throw bad('required');
  if (password.length < 8) throw bad('password_short');
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) throw bad('user_exists');
  const ids = Array.isArray(b.buildingIds) ? (b.buildingIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { username, fullName, role, passwordHash: await hashPassword(password), buildings: { create: ids.map((buildingId) => ({ buildingId })) } },
    });
    await audit(tx, me, 'user_create', { entity: 'user', entityId: u.id, details: { username, role, buildingIds: ids } });
    return { id: u.id };
  });
});
