'use client';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/AppContext';
import { apiFetch, fmtTime } from '@/lib/client';
import type { MsgKey } from '@/lib/i18n';

type A = { id: string; at: string; userName: string; action: string; entity: string; sectionName: string; details: Record<string, unknown> };

/** Amallar jurnali: kim, qachon, nima qilgani */
export default function Audit() {
  const { t, me, toast, errMsg } = useApp();
  const [list, setList] = useState<A[]>([]);
  const [q, setQ] = useState('');
  const [more, setMore] = useState(true);
  async function load(reset: boolean) {
    try {
      const before = !reset && list.length ? '&before=' + encodeURIComponent(list[list.length - 1].at) : '';
      const r = await apiFetch<A[]>('/api/audit?q=' + encodeURIComponent(q) + before);
      setList(reset ? r : [...list, ...r]);
      setMore(r.length === 100);
    } catch (e) {
      toast(errMsg(e));
    }
  }
  useEffect(() => {
    const tm = setTimeout(() => load(true), 300);
    return () => clearTimeout(tm);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (me.role !== 'ADMIN') return <main className="card">{t('err_forbidden')}</main>;
  const label = (a: string) => {
    const k = ('a_' + a) as MsgKey;
    const s = t(k);
    return s === k ? a : s;
  };
  const det = (d: Record<string, unknown>) =>
    Object.entries(d || {})
      .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')
      .slice(0, 240);
  return (
    <main>
      <h2>{t('nav_audit')}</h2>
      <input type="search" placeholder={t('audit_search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="list" style={{ marginTop: 10 }}>
        {list.map((a) => (
          <div className="it" key={a.id}>
            <div className="t">
              <div className="n">
                <b>{label(a.action)}</b> {a.sectionName && <small>· {a.sectionName}</small>}
              </div>
              <small>
                {fmtTime(a.at)} · {a.userName || '—'}
                {det(a.details) && (
                  <>
                    <br />
                    {det(a.details)}
                  </>
                )}
              </small>
            </div>
          </div>
        ))}
        {!list.length && <div className="it mut">{t('nothing')}</div>}
      </div>
      {more && list.length > 0 && (
        <button className="btn s w" style={{ marginTop: 10 }} onClick={() => load(false)}>
          {t('more')}
        </button>
      )}
    </main>
  );
}
