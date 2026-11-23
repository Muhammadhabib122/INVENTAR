import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { tmzState } from '@/server/tmz';
import { bad } from '@/server/errors';

export const GET = api(async (req) => {
  const u = await requireUser();
  const b = new URL(req.url).searchParams.get('buildingId');
  if (!b) throw bad('required');
  return tmzState(prisma, u, b);
});
