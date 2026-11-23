import { api } from '@/server/api';
import { destroySession } from '@/server/auth';
export const POST = api(async () => {
  await destroySession();
  return { ok: true };
});
