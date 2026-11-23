import { api, body } from '@/server/api';
import { prisma } from '@/server/db';
import { hashPassword, requireUser, verifyPassword } from '@/server/auth';
import { bad } from '@/server/errors';
import { audit } from '@/server/audit';

export const GET = api(async () => requireUser());

export const PATCH = api(async (req) => {
  const u = await requireUser();
  const b = await body(req);
  if (b.lang === 'LAT' || b.lang === 'CYR') await prisma.user.update({ where: { id: u.id }, data: { lang: b.lang } });
  if (typeof b.newPassword === 'string') {
    if (b.newPassword.length < 8) throw bad('password_short');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(String(b.oldPassword || ''), row.passwordHash))) throw bad('old_password_bad');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(b.newPassword) } });
    await audit(prisma, u, 'password_change', { entity: 'user', entityId: u.id });
  }
  return { ok: true };
});
