'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import { useFetch } from '@/lib/hooks';
import { useCurrent } from '@/lib/current';
import { fmtNum, pct } from '@/lib/client';
import type { SectionRow } from './sections/page';

type D = { sections: SectionRow[]; people: { id: string; name: string; found: number; other: number; today: number }[] };

/** Bosh sahifa: har bir bino va bo'lim bo'yicha bajarilish foizi, kim qancha skanerlagani */
export default function Home() {
  const { t, me } = useApp();
  const router = useRouter();
  const { sectionId, setSection } = useCurrent();
  const { data } = useFetch<D>('/api/dashboard', 10000);
  const groups = useMemo(() => {
    const m = new Map<string, SectionRow[]>();
    (data?.sections || []).forEach((s) => m.set(s.buildingName, [...(m.get(s.buildingName) || []), s]));
    return [...m.entries()];
  }, [data]);
  const all = (data?.sections || []).reduce((a, s) => ({ t: a.t + s.total, f: a.f + s.found }), { t: 0, f: 0 });
  const cur = data?.sections.find((s) => s.id === sectionId);
  return (
    <main>
      <h2>
        {t('hello')}, {me.fullName}
      </h2>
      {cur && (
        <div className="card ok">
          <small className="mut">{t('open_now')}</small>
          <br />
          <b>{cur.name}</b> <small>({cur.buildingName})</small>
          <div className="bar" style={{ marginTop: 6 }}>
            <i style={{ width: pct(cur.found, cur.total) + '%' }} />
          </div>
          <small>{t('found_of', { a: cur.found, b: cur.total, p: pct(cur.found, cur.total) })}</small>
          <div className="row" style={{ marginBottom: 0 }}>
            {me.role !== 'VIEWER' && (
              <Link className="btn" href="/scan">
                {t('nav_scan')}
              </Link>
            )}
            <Link className="btn s" href="/report">
              {t('nav_report')}
            </Link>
          </div>
        </div>
      )}
      {!sectionId && (
        <div className="card wa">
          {t('no_section')}
          <div className="row" style={{ marginBottom: 0 }}>
            <Link className="btn" href="/sections">
              {t('choose_section')}
            </Link>
          </div>
        </div>
      )}
      <div className="card">
        <b>{t('whole_univ')}</b>
        <div className="bar" style={{ marginTop: 6 }}>
          <i style={{ width: pct(all.f, all.t) + '%' }} />
        </div>
        <div className="stat">
          <span>
            <b>{pct(all.f, all.t)}%</b>
            {t('done_pct')}
          </span>
          <span>
            <b>{fmtNum(all.f)}</b>
            {t('f_found')}
          </span>
          <span>
            <b>{fmtNum(all.t)}</b>
            {t('total')}
          </span>
          <span>
            <b>{data?.sections.length ?? '…'}</b>
            {t('nav_sections')}
          </span>
        </div>
      </div>

      {groups.map(([b, list]) => {
        const g = list.reduce((a, s) => ({ t: a.t + s.total, f: a.f + s.found }), { t: 0, f: 0 });
        return (
          <div key={b}>
            <div className="grp">
              {b} · {pct(g.f, g.t)}%
            </div>
            <div className="list">
              {list.map((s) => (
                <div
                  className="it clk"
                  key={s.id}
                  onClick={() => {
                    setSection(s.id);
                    router.push('/report');
                  }}
                >
                  <div className="t">
                    <div className="n">
                      {s.name} {s.status === 'DONE' && <span className="tag no">{t('section_done_tag')}</span>}
                    </div>
                    <div className="bar" style={{ height: 6, margin: '4px 0' }}>
                      <i style={{ width: pct(s.found, s.total) + '%' }} />
                    </div>
                    <small>{t('found_of', { a: s.found, b: s.total, p: pct(s.found, s.total) })}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!!data?.people.length && (
        <>
          <h3>{t('who_scanned')}</h3>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>{t('full_name')}</th>
                  <th className="n">{t('f_found')}</th>
                  <th className="n">{t('today')}</th>
                  <th className="n">{t('other_records')}</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="n">{fmtNum(p.found)}</td>
                    <td className="n">{fmtNum(p.today)}</td>
                    <td className="n">{fmtNum(p.other)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
