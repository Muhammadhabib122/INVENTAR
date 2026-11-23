'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/components/AppContext';
import { useCurrent } from '@/lib/current';
import { useSectionData } from '@/lib/sectionData';
import { buildReport, COLS, rowArr } from '@/lib/report';
import { fmtNum, fmtTime, pct } from '@/lib/client';
import { downloadCsv, downloadXlsx, safeName } from '@/lib/export';
import type { MsgKey } from '@/lib/i18n';

export default function Report() {
  const { t, me } = useApp();
  const { sectionId, section } = useCurrent();
  const { items, state } = useSectionData(sectionId);
  const rep = useMemo(() => (items && state && section ? buildReport(items, state, section.buildingName, me.lang) : null), [items, state, section, me.lang]);
  if (!sectionId) return <main />;
  if (!rep || !section) return <main className="card mut">{t('loading')}</main>;
  const s = rep.summary;
  const p = pct(s.found, s.total);
  const head = COLS.map((c) => t(c));
  const fname = safeName(`${section.buildingName} - ${section.name}`);

  function xlsx() {
    const sumRows: (string | number)[][] = [
      [t('building'), section!.buildingName],
      [t('nav_sections'), section!.name],
      [t('file'), section!.originalFileName],
      [t('report_date'), fmtTime(new Date())],
      [],
      ['', t('count'), t('col_sum')],
      [t('total'), s.total, s.totalSum],
      [t('f_found'), s.found, s.foundSum],
      [t('f_missing'), s.missing, s.missingSum],
      [t('k_extra'), s.extras],
      [t('k_other_section'), s.other],
      [t('f_elsewhere'), s.elsewhere],
      [t('k_dup'), s.dups],
      [t('k_noinv'), s.noInv, ''],
      [t('f_delisted'), s.delisted],
    ];
    const roomRows = [
      [t('room_label'), t('status'), t('f_found'), t('col_sum'), t('k_extra'), t('k_dup'), t('k_noinv'), t('done_at'), t('done_by')],
      ...rep!.rooms.map((r) => [r.name, r.status === 'DONE' ? t('room_done_tag') : t('in_progress'), r.found, r.foundSum, r.extras, r.dups, r.noInv, fmtTime(r.doneAt), r.doneBy]),
    ];
    downloadXlsx(fname + '.xlsx', [
      { name: t('nav_report'), rows: [head, ...rep!.rows.map(rowArr)], widths: [18, 40, 8, 18, 22, 14, 22, 20, 28, 22] },
      { name: t('rooms_title'), rows: roomRows, widths: [16, 14, 10, 14, 10, 10, 10, 20, 22] },
      { name: t('total'), rows: sumRows, widths: [26, 14, 18] },
    ]);
  }

  const extras = state!.extras;
  return (
    <main>
      <div className="card">
        <div className="bar">
          <i style={{ width: p + '%' }} />
        </div>
        <div className="stat">
          <span>
            <b>{s.found}</b>
            {t('f_found')}
          </span>
          <span>
            <b>{s.missing}</b>
            {t('f_missing')}
          </span>
          <span>
            <b>{s.extras + s.other}</b>
            {t('k_extra')}
          </span>
          <span>
            <b>{s.total}</b>
            {t('total')}
          </span>
          <span>
            <b>{p}%</b>
            {t('done_pct')}
          </span>
        </div>
        <table className="t">
          <tbody>
            <tr>
              <td>{t('total')}</td>
              <td className="n">{s.total}</td>
              <td className="n">
                {fmtNum(s.totalSum)} {t('sum_currency')}
              </td>
            </tr>
            <tr>
              <td>{t('f_found')}</td>
              <td className="n">{s.found}</td>
              <td className="n">
                {fmtNum(s.foundSum)} {t('sum_currency')}
              </td>
            </tr>
            <tr>
              <td>{t('f_missing')}</td>
              <td className="n">{s.missing}</td>
              <td className="n">
                {fmtNum(s.missingSum)} {t('sum_currency')}
              </td>
            </tr>
            <tr>
              <td>{t('k_extra')}</td>
              <td className="n">{s.extras}</td>
              <td />
            </tr>
            <tr>
              <td>{t('k_other_section')}</td>
              <td className="n">{s.other}</td>
              <td />
            </tr>
            <tr>
              <td>{t('f_elsewhere')}</td>
              <td className="n">{s.elsewhere}</td>
              <td />
            </tr>
            <tr>
              <td>{t('k_dup')}</td>
              <td className="n">{s.dups}</td>
              <td />
            </tr>
            <tr>
              <td>{t('k_noinv')}</td>
              <td className="n">{s.noInv}</td>
              <td className="n">
                {s.noInvQty} {t('pcs')}
              </td>
            </tr>
            {s.delisted > 0 && (
              <tr>
                <td>{t('f_delisted')}</td>
                <td className="n">{s.delisted}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="row">
        <button className="btn" onClick={xlsx}>
          {t('download_xlsx')}
        </button>
        <button className="btn s" onClick={() => downloadCsv(fname + '.csv', head, rep.rows.map(rowArr))}>
          {t('download_csv')}
        </button>
      </div>

      <h3>{t('rooms_title')}</h3>
      <div className="tw">
        <table className="t">
          <thead>
            <tr>
              <th>{t('room_label')}</th>
              <th className="n">{t('f_found')}</th>
              <th className="n">{t('col_sum')}</th>
              <th className="n">{t('k_extra')}</th>
              <th className="n">{t('k_noinv')}</th>
              <th>{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {rep.rooms.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="n">{r.found}</td>
                <td className="n">{fmtNum(r.foundSum)}</td>
                <td className="n">{r.extras}</td>
                <td className="n">{r.noInv}</td>
                <td>
                  <span className={'tag' + (r.status === 'DONE' ? ' ok' : '')}>{r.status === 'DONE' ? t('room_done_tag') : t('in_progress')}</span>
                </td>
              </tr>
            ))}
            {!rep.rooms.length && (
              <tr>
                <td colSpan={6} className="mut">
                  {t('none_yet')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Block title={t('k_extra')} rows={extras.filter((e) => e.kind === 'NOT_IN_DB').map((e) => [e.inv, `${rep.rows.find((r) => r.inv === e.inv && r.kind === 'extra')?.place ?? ''} · ${state!.users[e.userId] || ''} · ${fmtTime(e.at)}`])} t={t} />
      <Block title={t('k_other_section')} rows={extras.filter((e) => e.kind === 'OTHER_SECTION').map((e) => [e.inv, `${e.otherSection} · ${state!.users[e.userId] || ''} · ${fmtTime(e.at)}`])} t={t} />
      <Block title={t('f_elsewhere')} rows={state!.elsewhere.map((e) => [e.inv, t('st_elsewhere_place', { s: `${e.sectionName} (${e.buildingName})`, r: e.room }) + ' · ' + fmtTime(e.at)])} t={t} />
      <Block title={t('k_dup')} rows={rep.rows.filter((r) => r.kind === 'dup').map((r) => [r.inv, `${r.name} · ${r.place} · ${r.who}`])} t={t} />
      <Block title={t('k_noinv')} rows={rep.rows.filter((r) => r.kind === 'noinv').map((r) => [r.name, `${r.status} · ${r.place} · ${r.who}`])} t={t} />
      {(section.importInfo?.conflicts?.length ?? 0) > 0 && (
        <Block title={t('conflicts_title', { n: section.importInfo.conflicts!.length })} rows={section.importInfo.conflicts!.map((c) => [c.inv, c.names.join(' / ')])} t={t} />
      )}
      <p className="h">
        <Link href="/summary">{t('nav_summary')} →</Link>
      </p>
    </main>
  );
}

function Block({ title, rows, t }: { title: string; rows: string[][]; t: (k: MsgKey) => string }) {
  return (
    <details className="card">
      <summary>
        <b>{title}</b> ({rows.length})
      </summary>
      <div className="list" style={{ marginTop: 8, maxHeight: 400, overflow: 'auto' }}>
        {rows.map((r, i) => (
          <div className="it" key={i}>
            <div className="t">
              <div className="n">{r[0]}</div>
              <small>{r[1]}</small>
            </div>
          </div>
        ))}
        {!rows.length && <div className="it mut">{t('none_yet')}</div>}
      </div>
    </details>
  );
}
