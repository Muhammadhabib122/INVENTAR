import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';

export const GET = api(async (req) => {
  await requireUser(['ADMIN']);
  const all = new URL(req.url).searchParams.get('all') === '1';
  const list = await prisma.trashEntry.findMany({ where: all ? {} : { restoredAt: null }, orderBy: { deletedAt: 'desc' }, take: 300 });
  return list.map((e) => {
    const p = e.payload as Record<string, unknown>;
    const counts = e.kind === 'clear' ? { founds: (p.founds as unknown[])?.length || 0, extras: (p.extras as unknown[])?.length || 0, noInv: (p.noInv as unknown[])?.length || 0 } : undefined;
    return { id: e.id, kind: e.kind, label: e.label, deletedBy: e.deletedBy, deletedAt: e.deletedAt, restoredAt: e.restoredAt, restoredBy: e.restoredBy, counts };
  });
});
