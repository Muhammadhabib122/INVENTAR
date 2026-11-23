'use client';
import { useState } from 'react';
import { useApp } from '@/components/AppContext';
import { apiFetch } from '@/lib/client';
import { useFetch } from '@/lib/hooks';
import type { MsgKey } from '@/lib/i18n';

type U = { id: string; username: string; fullName: string; role: string; active: boolean; buildingIds: string[] };
type B = { id: string; name: string };
type Form = { id?: string; username: string; fullName: string; role: string; password: string; buildingIds: string[] };

export default function Users() {
  const { t, me, toast, errMsg, confirm } = useApp();
  const { data, reload } = useFetch<U[]>('/api/users');
  const { data: bs } = useFetch<B[]>('/api/buildings');
  const [f, setF] = useState<Form | null>(null);
  if (me.role !== 'ADMIN') return <main className="card">{t('err_forbidden')}</main>;
  const bname = (id: string) => bs?.find((b) => b.id === id)?.name || '?';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    try {
      if (f.id) await apiFetch('/api/users/' + f.id, { method: 'PATCH', body: { fullName: f.fullName, role: f.role, buildingIds: f.buildingIds, password: f.password || undefined } });
      else await apiFetch('/api/users', { body: f });
      setF(null);
      toast(t('saved'));
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }
  async function toggle(u: U) {
    try {
      await apiFetch('/api/users/' + u.id, { method: 'PATCH', body: { active: !u.active } });
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }
  async function del(u: U) {
    if (!(await confirm(t('user_del_q', { n: u.fullName }), t('user_del_t'), t('delete')))) return;
    try {
      await apiFetch('/api/users/' + u.id, { method: 'DELETE' });
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }
  return (
    <main>
      <h2>{t('users')}</h2>
      {f ? (
        <form className="card ac" onSubmit={save}>
          <label className="f">
            <span>{t('username')}</span>
            <input type="text" value={f.username} disabled={!!f.id} autoCapitalize="none" pattern="[a-zA-Z0-9._\-]{3,60}" onChange={(e) => setF({ ...f, username: e.target.value })} required />
            <small className="mut">{t('username_h')}</small>
          </label>
          <label className="f">
            <span>{t('full_name')}</span>
            <input type="text" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required />
          </label>
          <label className="f">
            <span>{t('role')}</span>
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {['COMMISSION', 'VIEWER', 'ADMIN'].map((r) => (
                <option key={r} value={r}>
                  {t(('role_' + r) as MsgKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            <span>{f.id ? t('user_reset_pw') : t('password')}</span>
            <input type="text" value={f.password} minLength={8} autoComplete="off" onChange={(e) => setF({ ...f, password: e.target.value })} required={!f.id} />
          </label>
          {f.role !== 'ADMIN' && (
            <div className="f">
              <span className="mut sm">{t('user_buildings')}</span>
              <div className="list" style={{ maxHeight: 260, overflow: 'auto' }}>
                {bs?.map((b) => (
                  <label className="it clk" key={b.id}>
                    <input
                      type="checkbox"
                      checked={f.buildingIds.includes(b.id)}
                      onChange={(e) => setF({ ...f, buildingIds: e.target.checked ? [...f.buildingIds, b.id] : f.buildingIds.filter((x) => x !== b.id) })}
                    />
                    <div className="t">{b.name}</div>
                  </label>
                ))}
              </div>
              <small className="mut">{t('user_buildings_h')}</small>
            </div>
          )}
          <div className="row">
            <button className="btn">{t('save')}</button>
            <button type="button" className="btn s" onClick={() => setF(null)}>
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn w" onClick={() => setF({ username: '', fullName: '', role: 'COMMISSION', password: '', buildingIds: [] })}>
          + {t('user_new')}
        </button>
      )}
      <div className="list" style={{ marginTop: 10 }}>
        {data?.map((u) => (
          <div className="it wr" key={u.id}>
            <div className="t">
              <div className="n">
                <b>{u.fullName}</b> {!u.active && <span className="tag no">{t('user_blocked')}</span>}
              </div>
              <small>
                {u.username} · {t(('role_' + u.role) as MsgKey)}
                {u.role !== 'ADMIN' && (u.buildingIds.length ? ' · ' + u.buildingIds.map(bname).join(', ') : u.role === 'VIEWER' ? ' · ' + t('all_buildings') : '')}
              </small>
            </div>
            <button className="btn s sm auto" onClick={() => setF({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, password: '', buildingIds: u.buildingIds })}>
              {t('edit')}
            </button>
            {u.id !== me.id && (
              <>
                <button className="btn s sm auto" onClick={() => toggle(u)}>
                  {u.active ? t('user_block') : t('user_unblock')}
                </button>
                <button className="btn d sm auto" onClick={() => del(u)} aria-label={t('delete')}>
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
