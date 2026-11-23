import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { createDraft } from '@/server/sections';

export const maxDuration = 120;

export const POST = api(async (req) => {
  const u = await requireUser(['ADMIN']);
  const fd = await req.formData();
  const f = fd.get('file');
  const buildingId = String(fd.get('buildingId') || '');
  if (!(f instanceof File) || !buildingId) throw bad('required');
  if (f.size > 25 * 1024 * 1024) throw bad('file_too_big');
  const buf = Buffer.from(await f.arrayBuffer());
  return createDraft(prisma, u, buildingId, f.name, buf);
});
