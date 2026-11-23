import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { bad } from '@/server/errors';
import { previewCsv } from '@/server/legacyCsv';

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  const fd = await req.formData();
  const f = fd.get('file');
  if (!(f instanceof File)) throw bad('required');
  if (f.size > 20 * 1024 * 1024) throw bad('file_too_big');
  return previewCsv(prisma, u, id, f.name, Buffer.from(await f.arrayBuffer()));
});
