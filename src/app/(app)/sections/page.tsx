'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { apiFetch, fmtTime, pct } from '@/lib/client';
import { useFetch } from '@/lib/hooks';
import { useCurrent } from '@/lib/current';
import { ImportReview, type Analysis } from '@/components/ImportReview';
import { CsvImport } from '@/components/CsvImport';

export type SectionRow = {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  originalFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  status: 'ACTIVE' | 'DONE';
  total: number;
  found: number;
  extras: number;
  rooms: number;
  roomsDone: number;
};
type B = { id: string; name: string };

export default function Sections() {
  const { t, me, toast, errMsg, confirm, ask } = useApp();
  const router = useRouter();
  const { sectionId, setSection } = useCurrent();
  const { data, reload } = useFetch<SectionRow[]>('/api/sections', 15000);
  const { data: bs } = useFetch<B[]>('/api/buildings');
  const [bid, setBid] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [csvFor, setCsvFor] = useState<SectionRow | null>(null);
  const [q, setQ] = useState('');
  const admin = me.role === 'ADMIN';

  const groups = useMemo(() => {
    const m = new Map<string, { name: string; list: SectionRow[] }>();
    (bs || []).forEach((b) => m.set(b.id, { name: b.name, list: [] }));
    (data || [])
      .filter((s) => !q || (s.name + ' ' + s.buildingName + ' ' + s.originalFileName).toLowerCase().includes(q.toLowerCase()))
      .forEach((s) => {
        if (!m.has(s.buildingId)) m.set(s.buildingId, { name: s.buildingName, list: [] });
        m.get(s.buildingId)!.list.push(s);
      });
    return [...m.entries()].filter(([, g]) => g.list.length || (!q && admin));
  }, [data, bs, q, admin]);

  async function upload(f: File) {
    if (!bid) {
      toast(t('choose_building_first'));
      return;
    }
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    fd.append('buildingId', bid);
    try {
      setAnalysis(await apiFetch<Analysis>('/api/import', { form: fd }));
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }

  function open(s: SectionRow) {
    setSection(s.id);
    toast(t('section_opened', { n: s.name }));
    router.push(me.role === 'VIEWER' ? '/report' : '/scan');
  }

  async function actions(s: SectionRow) {
    const v = await ask(s.name, <small className="mut">{s.buildingName} · {s.originalFileName}</small>, [
      { label: t('rename'), value: 'rename', kind: 's' },
      { label: s.status === 'DONE' ? t('section_reopen') : t('section_finish'), value: 'status', kind: 's' },
      { label: t('download_original'), value: 'file', kind: 's' },
      { label: t('csv_import_btn'), value: 'csv', kind: 's' },
      { label: t('section_clear'), value: 'clear', kind: 'd' },
      { label: t('section_delete'), value: 'delete', kind: 'd' },
      { label: t('cancel'), value: 'x', kind: 's' },
    ]);
    try {
      if (v === 'rename') setRenaming({ id: s.id, name: s.name });
      else if (v === 'file') location.href = `/api/sections/${s.id}/file`;
      else if (v === 'csv') setCsvFor(s);
      else if (v === 'status') {
        const done = s.status !== 'DONE';
        if (done && !(await confirm(t('section_finish_q', { n: s.name }), t('section_finish_t'), t('section_finish'), false))) return;
        await apiFetch('/api/sections/' + s.id, { method: 'PATCH', body: { status: done ? 'DONE' : 'ACTIVE' } });
        reload();
      } else if (v === 'clear') {
        if (!(await confirm(t('section_clear_q', { n: s.name }), t('section_clear_t'), t('section_clear')))) return;
        await apiFetch(`/api/sections/${s.id}/clear`, { method: 'POST' });
        toast(t('section_cleared'));
        reload();
      } else if (v === 'delete') {
        if (!(await confirm(t('section_delete_q', { n: s.name }), t('section_delete_t'), t('section_delete')))) return;
        await apiFetch('/api/sections/' + s.id, { method: 'DELETE' });
        if (s.id === sectionId) setSection('');
        toast(t('section_deleted'));
        reload();
      }
    } catch (e) {
      toast(errMsg(e));
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    try {
      await apiFetch('/api/sections/' + renaming.id, { method: 'PATCH', body: { name: renaming.name } });
      setRenaming(null);
      reload();
    } catch (er) {
      toast(errMsg(er));
    }
  }

  if (analysis)
    return (
      <main>
        <ImportReview
          a={analysis}
          onDone={(sid, msg) => {
            setAnalysis(null);
            reload();
            if (sid) {
              setSection(sid);
              toast(msg || t('saved'));
            }
          }}
        />
      </main>
    );
  if (csvFor)
    return (
      <main>
        <CsvImport section={csvFor} onDone={() => (setCsvFor(null), reload())} />
      </main>
    );

  return (
    <main>
      <h2>{t('nav_sections')}</h2>
      {admin && (
        <div className="card ac">
          <b>{t('upload_title')}</b>
          <p className="h">{t('upload_h')}</p>
          <select value={bid} onChange={(e) => setBid(e.target.value)} aria-label={t('building')}>
            <option value="">{t('building')}: {t('choose')}</option>
            {bs?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <label className={'btn w' + (busy || !bid ? ' s' : '')} style={{ marginTop: 8 }}>
            {busy ? t('loading') : t('choose_excel')}
            <input
              type="file"
              accept=".xlsx,.xlsm,.xls,.ods,.csv"
              className="hide"
              disabled={busy}
              onClick={(e) => {
                if (!bid) {
                  e.preventDefault();
                  toast(t('choose_building_first'));
                }
              }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) upload(f);
              }}
            />
          </label>
        </div>
      )}
      <input type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 6 }} />
      {data && !data.length && <div className="card mut">{t('no_sections')}</div>}
      {groups.map(([gid, g]) => (
        <div key={gid}>
          <div className="grp">{g.name}</div>
          {!g.list.length && <div className="card mut sm">{t('no_sections_b')}</div>}
          {g.list.map((s) => {
            const p = pct(s.found, s.total);
            const cur = s.id === sectionId;
            return (
              <div key={s.id} className={'card' + (cur ? ' ok' : '')}>
                {renaming?.id === s.id ? (
                  <form onSubmit={saveName} className="row" style={{ margin: 0 }}>
                    <input type="text" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} autoFocus />
                    <button className="btn auto">{t('save')}</button>
                    <button type="button" className="btn s auto" onClick={() => setRenaming(null)}>
                      ✕
                    </button>
                  </form>
                ) : (
                  <b>{s.name}</b>
                )}{' '}
                <span className={'tag' + (s.status === 'DONE' ? ' no' : ' ac')}>{s.status === 'DONE' ? t('section_done_tag') : t('in_progress')}</span>
                {cur && <span className="tag ok"> {t('open_now')}</span>}
                <div className="bar" style={{ marginTop: 8 }}>
                  <i style={{ width: p + '%' }} />
                </div>
                <small className="mut">
                  {t('found_of', { a: s.found, b: s.total, p })} · {t('extras_n', { n: s.extras })} · {t('rooms_n', { a: s.roomsDone, b: s.rooms })}
                  <br />
                  {s.originalFileName} · {fmtTime(s.uploadedAt)} · {s.uploadedBy}
                </small>
                <div className="row" style={{ marginBottom: 0 }}>
                  {!cur && (
                    <button className="btn sm" onClick={() => open(s)}>
                      {t('open')}
                    </button>
                  )}
                  {cur && (
                    <button className="btn s sm" onClick={() => router.push(me.role === 'VIEWER' ? '/report' : '/scan')}>
                      {me.role === 'VIEWER' ? t('nav_report') : t('nav_scan')} →
                    </button>
                  )}
                  {admin && (
                    <button className="btn s sm" onClick={() => actions(s)}>
                      {t('actions')} ⋯
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </main>
  );
}
