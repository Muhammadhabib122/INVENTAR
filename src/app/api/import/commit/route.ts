import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { commitNew, commitUpdate } from '@/server/sections';

export const maxDuration = 120;

export const POST = api(async (req) => {
  const u = await requireUser(['ADMIN']);
  const b = await body(req);
  const draftId = str(b.draftId, 100);
  if (b.mode === 'new') return commitNew(prisma, u, draftId, str(b.name, 200));
  if (b.mode === 'update') return commitUpdate(prisma, u, draftId, str(b.sectionId, 100));
  throw bad('bad_mode');
});
