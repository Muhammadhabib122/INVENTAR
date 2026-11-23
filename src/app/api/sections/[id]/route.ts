import { api, body, str } from '@/server/api';
import { prisma } from '@/server/db';
import { canWorkBuilding, requireUser } from '@/server/auth';
import { deleteSection, getSectionChecked, renameSection, setSectionStatus } from '@/server/sections';

type P = { params: Promise<{ id: string }> };

export const GET = api<P>(async (_req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  const s = await getSectionChecked(prisma, u, id);
  const files = await prisma.sectionFile.findMany({ where: { sectionId: id }, select: { id: true, fileName: true, uploadedAt: true, kind: true }, orderBy: { uploadedAt: 'asc' } });
  return {
    id: s.id,
    name: s.name,
    buildingId: s.buildingId,
    buildingName: s.building.name,
    originalFileName: s.originalFileName,
    uploadedAt: s.uploadedAt,
    status: s.status,
    importInfo: s.importInfo,
    canWork: canWorkBuilding(u, s.buildingId),
    files,
  };
});

export const PATCH = api<P>(async (req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  const b = await body(req);
  if (typeof b.name === 'string') await renameSection(prisma, u, id, str(b.name, 200));
  if (b.status === 'DONE' || b.status === 'ACTIVE') await setSectionStatus(prisma, u, id, b.status === 'DONE');
  return { ok: true };
});

export const DELETE = api<P>(async (_req, { params }) => {
  const u = await requireUser(['ADMIN']);
  const { id } = await params;
  await deleteSection(prisma, u, id);
  return { ok: true };
});
