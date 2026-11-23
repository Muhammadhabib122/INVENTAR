import type { Tx } from './db';
import type { SessionUser } from './auth';

export async function audit(
  tx: Tx,
  user: SessionUser | null,
  action: string,
  opts: { entity?: string; entityId?: string; sectionId?: string | null; details?: unknown } = {},
) {
  await tx.auditLog.create({
    data: {
      userId: user?.id ?? null,
      userName: user ? `${user.fullName} (${user.username})` : '',
      action,
      entity: opts.entity ?? '',
      entityId: opts.entityId ?? '',
      sectionId: opts.sectionId ?? null,
      details: (opts.details ?? {}) as object,
    },
  });
}
