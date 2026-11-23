'use client';
import { useMemo, useState } from 'react';
import { useApp } from '@/components/AppContext';
import { useFetch } from '@/lib/hooks';
import { fmtNum, pct } from '@/lib/client';
import type { SummaryRow } from '@/server/summary';

type B = { id: string; name: string };

/** Yig'ma hisobot: bino bo'yicha yoki butun universitet. Har bir bo'lim alohida qatorda. */
export default function Summary() {
  const { t } = useApp();
  const [bid, setBid] = useState('');
  const { data: bs } = useFetch<B[]>('/api/buildings');
  const { data } = useFetch<SummaryRow[]>('/api/summary' + (bid ? '?buildingId=' + bid : ''), 15000);
  const groups = useMemo(() => {
    const m = new Map<string, SummaryRow[]>();
    (data || []).forEach((r) => m.set(r.buildingName, [...(m.get(r.buildingName) || []), r]));
    return [...m.entries()];
  }, [data]);
  const tot = (a: SummaryRow[]) => a.reduce((s, r) => ({ total: s.total + r.total, found: s.found + r.found, totalSum: s.totalSum + r.totalSum, foundSum: s.foundSum + r.foundSum }), { total: 0, found: 0, totalSum: 0, foundSum: 0 });
  const all = tot(data || []);
  const q = bid ? '&buildingId=' + bid : '';
  return (
    <main className="wide">
      <h2>{t('nav_summary')}</h2>
      <select value={bid} onChange={(e) => setBid(e.target.value)}>
        <option value="">{t('whole_univ')}</option>
        {bs?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <div className="card">
        <div className="bar">
          <i style={{ width: pct(all.found, all.total) + '%' }} />
        </div>
        <div className="stat">
          <span>
            <b>{pct(all.found, all.total)}%</b>
            {t('done_pct')}
          </span>
          <span>
            <b>
              {fmtNum(all.found)} / {fmtNum(all.total)}
            </b>
            {t('f_found')}
          </span>
          <span>
            <b>{fmtNum(all.foundSum)}</b>
            {t('sum_currency')}
          </span>
        </div>
        <p className="h">{t('summary_h')}</p>
      </div>
      <div className="row">
        <a className="btn" href={'/api/summary/export?x=1' + q}>
          {t('summary_xlsx')}
        </a>
        <a className="btn s" href={'/api/summary/export?detail=1' + q}>
          {t('summary_xlsx_detail')}
        </a>
      </div>
      {!data && <div className="card mut">{t('loading')}</div>}
      {groups.map(([b, rows]) => {
        const g = tot(rows);
        return (
          <div key={b}>
            <div className="grp">
              {b} · {pct(g.found, g.total)}%
            </div>
            <div className="tw">
              <table className="t">
                <thead>
                  <tr>
                    <th>{t('section_name')}</th>
                    <th className="n">{t('total')}</th>
                    <th className="n">{t('f_found')}</th>
                    <th className="n">%</th>
                    <th className="n">{t('f_missing')}</th>
                    <th className="n">{t('col_sum')} ({t('f_missing')})</th>
                    <th className="n">{t('k_extra')}</th>
                    <th className="n">{t('k_other_section')}</th>
                    <th className="n">{t('k_dup')}</th>
                    <th className="n">{t('k_noinv')}</th>
                    <th className="n">{t('rooms_title')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.name}
                        {r.status === 'DONE' && <span className="tag no"> {t('section_done_tag')}</span>}
                      </td>
                      <td className="n">{fmtNum(r.total)}</td>
                      <td className="n">{fmtNum(r.found)}</td>
                      <td className="n">{pct(r.found, r.total)}</td>
                      <td className="n">{fmtNum(r.missing)}</td>
                      <td className="n">{fmtNum(r.missingSum)}</td>
                      <td className="n">{r.extrasNotInDb}</td>
                      <td className="n">{r.otherSection}</td>
                      <td className="n">{r.dups}</td>
                      <td className="n">{r.noInvQty}</td>
                      <td className="n">
                        {r.roomsDone}/{r.rooms}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </main>
  );
}
