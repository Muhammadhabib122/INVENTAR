import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { sectionState } from '@/server/state';

export const GET = api<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  const r = new URL(req.url).searchParams.get('rev');
  return sectionState(prisma, u, id, r === null || r === '' ? undefined : Number(r));
});
