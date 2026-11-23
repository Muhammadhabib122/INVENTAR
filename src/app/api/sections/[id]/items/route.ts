import { api } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { getSectionChecked } from '@/server/sections';

export const GET = api<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const u = await requireUser();
  const { id } = await params;
  await getSectionChecked(prisma, u, id);
  const items = await prisma.item.findMany({ where: { sectionId: id }, orderBy: { ord: 'asc' } });
  return items.map((x) => ({ inv: x.inv, name: x.name, unit: x.unit, mol: x.mol, dept: x.dept, sum: x.sum, delisted: !!x.delistedAt }));
});
