'use client';
// Eski ilovadan olingan CSV'ni tanlangan bo'limga ko'chirish. Avval nima qo'shilishi ko'rsatiladi.
import { useState } from 'react';
import { useApp } from './AppContext';
import { apiFetch } from '@/lib/client';
import type { CsvPreview } from '@/server/legacyCsv';

export function CsvImport({ section, onDone }: { section: { id: string; name: string; buildingName?: string }; onDone: () => void }) {
  const { t, toast, errMsg } = useApp();
  const [pv, setPv] = useState<CsvPreview | null>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File) {
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    try {
      setPv(await apiFetch<CsvPreview>(`/api/sections/${section.id}/csv`, { form: fd }));
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }
  async function commit() {
    if (!pv) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ found: number; extras: number; dups: number; noinv: number; rooms: number }>(`/api/sections/${section.id}/csv/commit`, { body: { draftId: pv.draftId } });
      toast(t('csv_done', { f: r.found, e: r.extras, d: r.dups, n: r.noinv, r: r.rooms }));
      onDone();
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  }
  return (
    <>
      <h2>{t('csv_import_btn')}</h2>
      <div className="card ac">
        <small className="mut">{t('csv_target')}</small>
        <br />
        <b>{section.name}</b> {section.buildingName && <small>({section.buildingName})</small>}
        <p className="h">{t('csv_h')}</p>
        {!pv && (
          <label className="btn w">
            {busy ? t('loading') : t('csv_choose')}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hide"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) pick(f);
              }}
            />
          </label>
        )}
      </div>
      {pv && (
        <>
          <div className="card">
            <b>{pv.fileName}</b>
            {!pv.headerOk && <div className="card wa">{t('csv_no_header')}</div>}
            <table className="t" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>{t('csv_c_found')}</td>
                  <td className="n">
                    <b>{pv.counts.found}</b>
                  </td>
                </tr>
                <tr>
                  <td>{t('csv_c_extra')}</td>
                  <td className="n">{pv.counts.extra}</td>
                </tr>
                <tr>
                  <td>{t('k_dup')}</td>
                  <td className="n">{pv.counts.dup}</td>
                </tr>
                <tr>
                  <td>{t('k_noinv')}</td>
                  <td className="n">{pv.counts.noinv}</td>
                </tr>
                <tr>
                  <td>{t('csv_c_rooms')}</td>
                  <td className="n">{pv.counts.rooms}</td>
                </tr>
                <tr className="mut">
                  <td>{t('csv_c_missing')}</td>
                  <td className="n">{pv.counts.missing}</td>
                </tr>
                <tr className="mut">
                  <td>{t('csv_c_skip')}</td>
                  <td className="n">{pv.counts.foundSkip}</td>
                </tr>
                {pv.counts.unknown > 0 && (
                  <tr>
                    <td>{t('csv_c_unknown')}</td>
                    <td className="n">{pv.counts.unknown}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {pv.badTimes > 0 && <div className="card wa">{t('csv_bad_times', { n: pv.badTimes })}</div>}
            {pv.counts.foundNotInSection > 0 && <div className="card wa">{t('csv_not_in_section', { n: pv.counts.foundNotInSection })}</div>}
            <small className="mut">
              {t('rooms_title')}: {pv.rooms.join(', ')}
            </small>
          </div>
          {[
            ['csv_s_not_in_section', pv.samples.foundNotInSection],
            ['csv_c_skip', pv.samples.foundSkip],
            ['csv_c_unknown', pv.samples.unknown],
          ].map(([k, list]) =>
            (list as string[]).length ? (
              <details className="card" key={k as string}>
                <summary>
                  {t(k as 'csv_c_skip')} ({(list as string[]).length})
                </summary>
                <div className="list" style={{ maxHeight: 240, overflow: 'auto' }}>
                  {(list as string[]).map((x, i) => (
                    <div className="it sm" key={i}>
                      {x}
                    </div>
                  ))}
                </div>
              </details>
            ) : null,
          )}
          <div className="row">
            <button className="btn" disabled={busy} onClick={commit}>
              {t('csv_confirm')}
            </button>
            <button className="btn s" disabled={busy} onClick={onDone}>
              {t('cancel')}
            </button>
          </div>
        </>
      )}
      {!pv && (
        <button className="btn s w" onClick={onDone}>
          {t('back')}
        </button>
      )}
    </>
  );
}
