import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { commitCsv } from '@/server/legacyCsv';

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  const b = await body(req);
  return commitCsv(prisma, u, id, str(b.draftId, 100));
});
