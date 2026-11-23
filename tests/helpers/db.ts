// Integratsion testlar alohida test bazasida ishlaydi (TEST_DATABASE_URL).
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import type { SessionUser } from '@/server/auth';

const url = process.env.TEST_DATABASE_URL || 'postgresql://inventar:inventar@localhost:5432/inventar_test';
process.env.DATABASE_URL = url;
let migrated = false;

export function testDb() {
  if (!migrated) {
    execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
    migrated = true;
  }
  return new PrismaClient({ datasources: { db: { url } } });
}

export async function reset(db: PrismaClient) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} CASCADE`);
}

export async function mkAdmin(db: PrismaClient, username = 'admin'): Promise<SessionUser> {
  const u = await db.user.create({ data: { username, fullName: 'Admin ' + username, passwordHash: 'x', role: 'ADMIN' } });
  return { id: u.id, username, fullName: u.fullName, role: 'ADMIN', lang: 'LAT', buildingIds: [] };
}

export async function mkUser(db: PrismaClient, username: string, role: 'COMMISSION' | 'VIEWER', buildingIds: string[]): Promise<SessionUser> {
  const u = await db.user.create({ data: { username, fullName: 'User ' + username, passwordHash: 'x', role, buildings: { create: buildingIds.map((buildingId) => ({ buildingId })) } } });
  return { id: u.id, username, fullName: u.fullName, role, lang: 'LAT', buildingIds };
}
