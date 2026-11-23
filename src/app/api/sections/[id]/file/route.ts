import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { getSectionChecked } from '@/server/sections';
import { notFound } from '@/server/errors';

export const GET = api<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const u = await requireUser(['ADMIN', 'VIEWER', 'COMMISSION']);
  const { id } = await params;
  await getSectionChecked(prisma, u, id);
  const fid = new URL(req.url).searchParams.get('f');
  const f = await prisma.sectionFile.findFirst({ where: { sectionId: id, ...(fid ? { id: fid } : {}) }, orderBy: { uploadedAt: 'asc' } });
  if (!f) throw notFound();
  return new Response(new Uint8Array(f.data), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      'Cache-Control': 'no-store',
    },
  });
});
