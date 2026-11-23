import { api } from '@/server/api';
import { requireUser } from '@/server/auth';
export const POST = api(async () => {
  await requireUser();
  return { results: [] };
});
