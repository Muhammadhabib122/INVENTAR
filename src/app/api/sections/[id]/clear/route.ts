import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { clearSection } from '@/server/sections';

export const POST = api<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  return clearSection(prisma, u, id);
});
