import { api, body } from '@/server/api';
import { prisma } from '@/server/db';
import { requireUser } from '@/server/auth';
import { processOp, type OpIn, type OpOut } from '@/server/ops';
import { bad } from '@/server/errors';

export const maxDuration = 60;

/** Telefondan navbatdagi amallarni qabul qiladi. Tartib saqlanadi (bittadan, ketma-ket). */
export const POST = api(async (req) => {
  const u = await requireUser();
  const b = await body<{ ops?: OpIn[] }>(req);
  if (!Array.isArray(b.ops) || b.ops.length > 100) throw bad('bad_ops');
  const results: OpOut[] = [];
  for (const op of b.ops) results.push(await processOp(prisma, u, op));
  return { results };
});
