'use client';
import { useState } from 'react';
import { useApp } from '@/components/AppContext';
import { apiFetch } from '@/lib/client';
import { useFetch } from '@/lib/hooks';

type B = { id: string; name: string; note: string; sections: number };

export default function Buildings() {
  const { t, me, toast, errMsg, confirm } = useApp();
  const { data, reload } = useFetch<B[]>('/api/buildings');
  const [edit, setEdit] = useState<{ id?: string; name: string; note: string } | null>(null);
  if (me.role !== 'ADMIN') return <main className="card">{t('err_forbidden')}</main>;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    try {
      await apiFetch(edit.id ? '/api/buildings/' + edit.id : '/api/buildings', { method: edit.id ? 'PATCH' : 'POST', body: edit });
      setEdit(null);
      toast(t('saved'));
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }
  async function del(b: B) {
    if (!(await confirm(t('building_del_q', { n: b.name }), t('building_del_t'), t('delete')))) return;
    try {
      await apiFetch('/api/buildings/' + b.id, { method: 'DELETE' });
      toast(t('building_deleted'));
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }
  return (
    <main>
      <h2>{t('buildings')}</h2>
      {edit ? (
        <form className="card ac" onSubmit={save}>
          <label className="f">
            <span>{t('building_name')}</span>
            <input type="text" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus />
          </label>
          <label className="f">
            <span>{t('building_note')}</span>
            <input type="text" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          </label>
          <div className="row">
            <button className="btn">{t('save')}</button>
            <button type="button" className="btn s" onClick={() => setEdit(null)}>
              {t('cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button className="btn w" onClick={() => setEdit({ name: '', note: '' })}>
          + {t('building_new')}
        </button>
      )}
      <div className="list" style={{ marginTop: 10 }}>
        {data?.length === 0 && <div className="it mut">{t('no_buildings')}</div>}
        {data?.map((b) => (
          <div className="it" key={b.id}>
            <div className="t">
              <div className="n">
                <b>{b.name}</b>
              </div>
              <small>
                {t('sections_count', { n: b.sections })}
                {b.note ? ' · ' + b.note : ''}
              </small>
            </div>
            <button className="btn s sm auto" onClick={() => setEdit({ id: b.id, name: b.name, note: b.note })}>
              {t('edit')}
            </button>
            <button className="btn d sm auto" onClick={() => del(b)} aria-label={t('delete')}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}
