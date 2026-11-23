'use client';
import { useState } from 'react';
import { useApp } from '@/components/AppContext';
import { apiFetch, fmtTime } from '@/lib/client';
import { useFetch } from '@/lib/hooks';
import type { MsgKey } from '@/lib/i18n';

type E = { id: string; kind: string; label: string; deletedBy: string; deletedAt: string; restoredAt: string | null; restoredBy: string | null; counts?: { founds: number; extras: number; noInv: number } };

/** Savat: o'chirilgan narsalar. Admin tiklay oladi. Hech narsa butunlay o'chmaydi. */
export default function Trash() {
  const { t, me, toast, errMsg, confirm } = useApp();
  const [all, setAll] = useState(false);
  const { data, reload } = useFetch<E[]>('/api/trash' + (all ? '?all=1' : ''));
  if (me.role !== 'ADMIN') return <main className="card">{t('err_forbidden')}</main>;
  async function restore(e: E) {
    if (!(await confirm(t('restore_q'), e.label, t('restore'), false))) return;
    try {
      const r = await apiFetch<{ restored: number; skipped: number }>(`/api/trash/${e.id}/restore`, { method: 'POST' });
      toast(t('restored', { n: r.restored, s: r.skipped }));
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }
  return (
    <main>
      <h2>{t('nav_trash')}</h2>
      <p className="h">{t('trash_h')}</p>
      <label className="row" style={{ alignItems: 'center' }}>
        <input type="checkbox" className="auto" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <span>{t('trash_show_restored')}</span>
      </label>
      <div className="list">
        {data?.map((e) => (
          <div className="it" key={e.id}>
            <div className="t">
              <div className="n">
                <span className="tag">{t(('tk_' + e.kind) as MsgKey)}</span> <b>{e.label}</b>
              </div>
              <small>
                {fmtTime(e.deletedAt)} · {e.deletedBy}
                {e.counts && ` · ${t('f_found')}: ${e.counts.founds}, ${t('k_extra')}: ${e.counts.extras}, ${t('k_noinv')}: ${e.counts.noInv}`}
                {e.restoredAt && (
                  <>
                    <br />
                    {t('restored_at')}: {fmtTime(e.restoredAt)} · {e.restoredBy}
                  </>
                )}
              </small>
            </div>
            {!e.restoredAt && (
              <button className="btn s sm auto" onClick={() => restore(e)}>
                {t('restore')}
              </button>
            )}
          </div>
        ))}
        {data && !data.length && <div className="it mut">{t('trash_empty')}</div>}
      </div>
    </main>
  );
}
