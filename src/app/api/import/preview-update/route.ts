import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { previewUpdate } from '@/server/sections';

export const POST = api(async (req) => {
  const u = await requireUser(['ADMIN']);
  const b = await body(req);
  return previewUpdate(prisma, u, str(b.draftId, 100), str(b.sectionId, 100));
});
