import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { summary } from '@/server/summary';

export const GET = api(async (req) => {
  const u = await requireUser();
  return summary(prisma, u, new URL(req.url).searchParams.get('buildingId') || undefined);
});
