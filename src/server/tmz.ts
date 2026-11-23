// TMZ amallari (8-bosqichda to'liq yoziladi)
import type { SessionUser } from './auth';
import type { Tx } from './db';
import { bad } from './errors';
export async function tmzOp(_tx: Tx, _u: SessionUser, _type: string, _p: Record<string, unknown>): Promise<{ status: string }> {
  throw bad('bad_op');
}
