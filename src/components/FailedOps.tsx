'use client';
import { useEffect, useState } from 'react';
import { useApp } from './AppContext';
import { useSync, type Op, type OpResult } from '@/lib/sync';
import { fmtTime } from '@/lib/client';
import type { MsgKey } from '@/lib/i18n';

/** Server qabul qilmagan amallar (masalan, huquq olib qo'yilgan). Telefonda saqlanadi, foydalanuvchi ko'radi. */
export function FailedOps() {
  const { t, confirm } = useApp();
  const { failed, failedOps, dropFailed } = useSync();
  const [list, setList] = useState<(Op & { result: OpResult })[]>([]);
  useEffect(() => {
    failedOps().then(setList);
  }, [failed, failedOps]);
  if (!list.length) return null;
  return (
    <div className="card er">
      <b>
        {t('failed_ops')} ({list.length})
      </b>
      <p className="h">{t('failed_ops_h')}</p>
      <div className="list">
        {list.map((o) => (
          <div className="it" key={o.id}>
            <div className="t">
              <div className="n">
                {String(o.payload.inv || o.payload.name || o.type)} · {t(('e_' + o.result.error) as MsgKey)}
              </div>
              <small>
                {String(o.payload.room || '')} · {fmtTime(o.createdAt)}
              </small>
            </div>
            <button
              className="btn s sm auto"
              onClick={async () => {
                if (await confirm(t('failed_drop_q'), String(o.payload.inv || o.payload.name || ''), t('delete'))) dropFailed(o.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
