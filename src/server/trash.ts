import type { Tx } from './db';
import type { SessionUser } from './auth';

export async function toTrash(tx: Tx, u: SessionUser, kind: string, label: string, payload: unknown, sectionId?: string | null) {
  return tx.trashEntry.create({
    data: { kind, label, payload: JSON.parse(JSON.stringify(payload)), sectionId: sectionId ?? null, deletedBy: `${u.fullName} (${u.username})` },
  });
}
