// Birinchi adminni yaratadi (yoki parolini yangilaydi). .env dagi ADMIN_USERNAME / ADMIN_PASSWORD ishlatiladi.
// Ishga tushirish: docker compose exec app node prisma/seed.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
const fullName = process.env.ADMIN_FULLNAME || 'Administrator';
try {
  if (password.length < 8) {
    console.error("XATO: .env faylida ADMIN_PASSWORD kamida 8 belgidan iborat bo'lishi kerak.");
    process.exitCode = 1;
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const u = await prisma.user.upsert({
      where: { username },
      update: { passwordHash, role: 'ADMIN', active: true, deletedAt: null },
      create: { username, fullName, passwordHash, role: 'ADMIN' },
    });
    await prisma.auditLog.create({ data: { action: 'seed_admin', entity: 'user', entityId: u.id, userName: 'seed', details: { username } } });
    console.log(`Admin tayyor: login "${username}"`);
  }
} finally {
  await prisma.$disconnect();
}
