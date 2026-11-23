import { api, body, clientIp, str } from '@/server/api';
import { prisma } from '@/server/db';
import { createSession, isLockedOut, recordAttempt, verifyPassword } from '@/server/auth';
import { HttpError } from '@/server/errors';
import { audit } from '@/server/audit';

export const POST = api(async (req) => {
  const b = await body(req);
  const username = str(b.username, 100).toLowerCase();
  const password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
  const ip = clientIp(req);
  if (!username || !password) throw new HttpError(400, 'bad_login');
  if (await isLockedOut(username, ip)) throw new HttpError(429, 'locked');
  const u = await prisma.user.findUnique({ where: { username } });
  const ok = !!u && u.active && !u.deletedAt && (await verifyPassword(password, u.passwordHash));
  await recordAttempt(username, ip, ok);
  if (!ok || !u) {
    // vaqt bo'yicha farqni kamaytirish
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'bad_login');
  }
  await createSession(u.id);
  await audit(prisma, { id: u.id, username: u.username, fullName: u.fullName, role: u.role, lang: u.lang, buildingIds: [] }, 'login', { entity: 'user', entityId: u.id, details: { ip } });
  return { ok: true };
});
