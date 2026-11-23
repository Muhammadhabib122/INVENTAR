import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { listSections } from '@/server/sections';

export const GET = api(async (req) => {
  const u = await requireUser();
  const b = new URL(req.url).searchParams.get('buildingId') || undefined;
  return listSections(prisma, u, b);
});
