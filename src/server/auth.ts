import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Role, Lang } from '@prisma/client';
import { prisma } from './db';
import { HttpError } from './errors';

export const SESSION_COOKIE = 'inv_s';
const SESSION_DAYS = 30;
const MAX_FAILS = 5; // shu muddat ichida
const FAIL_WINDOW_MIN = 15;

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  lang: Lang;
  buildingIds: string[];
};

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 12);
}
export async function verifyPassword(p: string, h: string) {
  return bcrypt.compare(p, h);
}

export async function isLockedOut(username: string, ip: string) {
  const since = new Date(Date.now() - FAIL_WINDOW_MIN * 60_000);
  const [u, i] = await Promise.all([
    prisma.loginAttempt.count({ where: { key: 'u:' + username.toLowerCase(), success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { key: 'ip:' + ip, success: false, createdAt: { gte: since } } }),
  ]);
  return u >= MAX_FAILS || i >= MAX_FAILS * 4;
}

export async function recordAttempt(username: string, ip: string, success: boolean) {
  await prisma.loginAttempt.createMany({
    data: [
      { key: 'u:' + username.toLowerCase(), success },
      { key: 'ip:' + ip, success },
    ],
  });
  if (success) {
    await prisma.loginAttempt.deleteMany({ where: { key: 'u:' + username.toLowerCase(), success: false } });
  }
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({ data: { id: sha(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await prisma.session.deleteMany({ where: { id: sha(t) } });
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const s = await prisma.session.findUnique({
    where: { id: sha(t) },
    include: { user: { include: { buildings: true } } },
  });
  if (!s || s.expiresAt < new Date() || !s.user.active || s.user.deletedAt) return null;
  // sessiyani uzaytirish (kuniga bir marta)
  if (s.expiresAt.getTime() - Date.now() < (SESSION_DAYS - 1) * 86400_000) {
    await prisma.session.update({ where: { id: s.id }, data: { expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) } });
  }
  const u = s.user;
  return { id: u.id, username: u.username, fullName: u.fullName, role: u.role, lang: u.lang, buildingIds: u.buildings.map((b) => b.buildingId) };
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getUser();
  if (!u) throw new HttpError(401, 'unauthorized');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'forbidden');
  return u;
}

/** Foydalanuvchi shu binoni ko'ra oladimi? Admin — hammasini. Kuzatuvchi — biriktirilmagan bo'lsa hammasini. Komissiya — faqat biriktirilganlarni. */
export function canViewBuilding(u: SessionUser, buildingId: string) {
  if (u.role === 'ADMIN') return true;
  if (u.role === 'VIEWER' && u.buildingIds.length === 0) return true;
  return u.buildingIds.includes(buildingId);
}
/** Skanerlash, xona yakunlash va h.k. */
export function canWorkBuilding(u: SessionUser, buildingId: string) {
  if (u.role === 'ADMIN') return true;
  if (u.role === 'COMMISSION') return u.buildingIds.includes(buildingId);
  return false;
}
/** Prisma filtri: foydalanuvchi ko'ra oladigan binolar */
export function buildingFilter(u: SessionUser) {
  if (u.role === 'ADMIN' || (u.role === 'VIEWER' && u.buildingIds.length === 0)) return {};
  return { id: { in: u.buildingIds } };
}
