'use client';
import { useMemo, useState } from 'react';
import { useApp } from '@/components/AppContext';
import { useCurrent } from '@/lib/current';
import { useSectionData } from '@/lib/sectionData';
import { useSync } from '@/lib/sync';
import { buildReport, type ReportRow } from '@/lib/report';
import { fmtNum } from '@/lib/client';
import type { MsgKey } from '@/lib/i18n';

const PER = 50;
const FILTERS: { k: string; l: MsgKey; kinds?: ReportRow['kind'][] }[] = [
  { k: 'all', l: 'all' },
  { k: 'found', l: 'f_found', kinds: ['found'] },
  { k: 'missing', l: 'f_missing', kinds: ['missing', 'elsewhere'] },
  { k: 'extra', l: 'k_extra', kinds: ['extra'] },
  { k: 'other', l: 'k_other_section', kinds: ['other'] },
  { k: 'elsewhere', l: 'f_elsewhere', kinds: ['elsewhere'] },
  { k: 'dup', l: 'k_dup', kinds: ['dup'] },
  { k: 'noinv', l: 'k_noinv', kinds: ['noinv'] },
  { k: 'delisted', l: 'f_delisted', kinds: ['delisted'] },
];

export default function List() {
  const { t, me, toast, confirm } = useApp();
  const { sectionId, section, room } = useCurrent();
  const { items, state } = useSectionData(sectionId);
  const { submit } = useSync();
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [page, setPage] = useState(0);

  const rep = useMemo(() => (items && state && section ? buildReport(items, state, section.buildingName, me.lang) : null), [items, state, section, me.lang]);
  const rows = useMemo(() => {
    if (!rep) return [];
    const fl = FILTERS.find((x) => x.k === f);
    const qq = q.toLowerCase().trim();
    return rep.rows.filter((r) => (!fl?.kinds || fl.kinds.includes(r.kind)) && (!qq || (r.inv + ' ' + r.name + ' ' + r.place + ' ' + r.mol + ' ' + r.dept).toLowerCase().includes(qq)));
  }, [rep, f, q]);
  const pages = Math.max(1, Math.ceil(rows.length / PER));
  const pg = Math.min(page, pages - 1);

  async function tap(r: ReportRow) {
    if (!section?.canWork || section.status === 'DONE' || (r.kind !== 'found' && r.kind !== 'missing' && r.kind !== 'elsewhere')) return;
    if (r.kind === 'found') {
      if (!(await confirm(t('unmark_q'), `${r.inv} · ${r.name}`, t('unmark')))) return;
      const res = await submit('unfound', { sectionId, inv: r.inv });
      if (res.status === 'rejected') toast(t(('e_' + res.error) as MsgKey));
      return;
    }
    if (!room) return toast(t('list_need_room'));
    if (!(await confirm(t('mark_q', { r: room }), `${r.inv} · ${r.name}`, t('mark'), false))) return;
    const res = await submit('scan', { sectionId, room, inv: r.inv, at: Date.now(), method: 'manual' });
    if (res.status === 'found') toast(t('r_found'));
    else if (res.status === 'queued') toast(t('r_queued'));
    else if (res.status === 'rejected') toast(t(('e_' + res.error) as MsgKey));
    else if (res.status === 'other_room') toast(t('list_other_room'));
    else if (res.status === 'locked') toast(t('r_locked_room'));
  }

  if (!sectionId) return <main />;
  return (
    <main>
      <input type="search" placeholder={t('list_search')} value={q} onChange={(e) => (setQ(e.target.value), setPage(0))} />
      <div className="chips">
        {FILTERS.map((x) => (
          <button key={x.k} className={'chip' + (f === x.k ? ' on' : '')} onClick={() => (setF(x.k), setPage(0))}>
            {t(x.l)}
          </button>
        ))}
      </div>
      {!rep && <div className="card mut">{t('loading')}</div>}
      {rep && (
        <>
          <small className="mut">{t('list_count', { n: rows.length })}</small>
          <div className="list" style={{ marginTop: 6 }}>
            {rows.slice(pg * PER, (pg + 1) * PER).map((r, i) => (
              <div className="it clk" key={r.kind + r.inv + i} onClick={() => tap(r)}>
                <span className={'dot' + (r.kind === 'found' ? ' f' : r.kind === 'noinv' || r.kind === 'delisted' ? ' x' : '')} />
                <div className="t">
                  <div className="n">{r.name || r.inv}</div>
                  <small>
                    {r.inv}
                    {r.sum !== '' ? ` · ${fmtNum(r.sum)} ${t('sum_currency')}` : ''} · {r.status}
                    {r.place ? (
                      <>
                        <br />
                        {r.place} · {r.who}
                      </>
                    ) : null}
                  </small>
                </div>
              </div>
            ))}
            {!rows.length && <div className="it mut">{t('nothing')}</div>}
          </div>
          {pages > 1 && (
            <div className="row">
              <button className="btn s" disabled={pg === 0} onClick={() => setPage(pg - 1)}>
                {t('prev')}
              </button>
              <span className="auto" style={{ alignSelf: 'center', minWidth: 70, textAlign: 'center' }}>
                {t('page_of', { a: pg + 1, b: pages })}
              </span>
              <button className="btn s" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>
                {t('next')}
              </button>
            </div>
          )}
          {section?.canWork && <p className="h">{t('list_tap_h')}</p>}
        </>
      )}
    </main>
  );
}
