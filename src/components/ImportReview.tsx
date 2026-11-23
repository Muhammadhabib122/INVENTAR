'use client';
import { useState } from 'react';
import { useApp } from './AppContext';
import { apiFetch, fmtNum } from '@/lib/client';

export type Analysis = {
  draftId: string;
  fileName: string;
  suggestedName: string;
  stats: { items: number; dup: number; conflicts: number; skippedTotals: number; sheets: number };
  conflicts: { inv: string; names: string[] }[];
  sameFile: { sectionId: string; name: string; buildingName: string; originalFileName: string; reason: 'name' | 'overlap' | 'both'; overlap: number }[];
  cross: { sectionId: string; sectionName: string; buildingName: string; count: number; sample: { inv: string; name: string; mol: string }[] }[];
  crossTotal: number;
};
type Diff = {
  addedCount: number;
  delistedCount: number;
  relistedCount: number;
  changedCount: number;
  unchanged: number;
  added: { inv: string; name: string }[];
  delisted: { inv: string; name: string }[];
  relisted: { inv: string; name: string }[];
  changed: { inv: string; before: Record<string, unknown>; after: Record<string, unknown> }[];
};

/** Excel yuklashdan keyingi ko'rib chiqish: hech narsa foydalanuvchi tanlamaguncha bazaga yozilmaydi */
export function ImportReview({ a, onDone }: { a: Analysis; onDone: (sectionId: string | null, msg?: string) => void }) {
  const { t, toast, errMsg } = useApp();
  const [name, setName] = useState(a.suggestedName);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(a.sameFile[0]?.sectionId || '');
  const [diff, setDiff] = useState<Diff | null>(null);
  const resultMsg = () => t('import_result', { n: a.stats.items, m: a.stats.dup, k: a.stats.conflicts });

  async function createNew() {
    setBusy(true);
    try {
      const r = await apiFetch<{ sectionId: string }>('/api/import/commit', { body: { draftId: a.draftId, mode: 'new', name } });
      onDone(r.sectionId, resultMsg());
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  }
  async function previewUpdate() {
    setBusy(true);
    try {
      setDiff(await apiFetch<Diff>('/api/import/preview-update', { body: { draftId: a.draftId, sectionId: target } }));
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }
  async function doUpdate() {
    setBusy(true);
    try {
      const r = await apiFetch<{ sectionId: string; added: number; delisted: number; relisted: number; changed: number }>('/api/import/commit', {
        body: { draftId: a.draftId, mode: 'update', sectionId: target },
      });
      onDone(r.sectionId, t('update_result', { a: r.added, d: r.delisted, c: r.changed }));
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  }

  if (diff) {
    const tg = a.sameFile.find((s) => s.sectionId === target);
    return (
      <>
        <h2>{t('update_preview')}</h2>
        <div className="card ac">
          <b>{tg?.name}</b>
          <br />
          <small className="mut">
            {tg?.buildingName} · {a.fileName}
          </small>
        </div>
        <div className="card">
          <div>{t('diff_added', { n: diff.addedCount })}</div>
          <div>{t('diff_delisted', { n: diff.delistedCount })}</div>
          <div>{t('diff_relisted', { n: diff.relistedCount })}</div>
          <div>{t('diff_changed', { n: diff.changedCount })}</div>
          <div className="mut">{t('diff_unchanged', { n: diff.unchanged })}</div>
          <p className="h">{t('update_keeps_scans')}</p>
        </div>
        <DiffList title={t('diff_added_l')} items={diff.added.map((x) => `${x.inv} · ${x.name}`)} more={diff.addedCount} />
        <DiffList title={t('diff_delisted_l')} items={diff.delisted.map((x) => `${x.inv} · ${x.name}`)} more={diff.delistedCount} />
        <DiffList title={t('diff_relisted_l')} items={diff.relisted.map((x) => `${x.inv} · ${x.name}`)} more={diff.relistedCount} />
        <DiffList
          title={t('diff_changed_l')}
          items={diff.changed.map((c) => `${c.inv}: ` + Object.keys(c.after).map((k) => `${String(c.before[k])} → ${String(c.after[k])}`).join('; '))}
          more={diff.changedCount}
        />
        <div className="row">
          <button className="btn" disabled={busy} onClick={doUpdate}>
            {t('update_confirm')}
          </button>
          <button className="btn s" disabled={busy} onClick={() => setDiff(null)}>
            {t('back')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h2>{t('import_review')}</h2>
      <div className="card">
        <b>{a.fileName}</b>
        <div className="res" style={{ marginTop: 6 }}>
          {t('import_found', { n: a.stats.items, m: a.stats.dup, k: a.stats.conflicts })}
        </div>
        {a.stats.skippedTotals > 0 && <small className="mut">{t('import_totals', { n: a.stats.skippedTotals })}</small>}
        <label className="f">
          <span>{t('section_name')}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      {a.conflicts.length > 0 && (
        <details className="card wa">
          <summary>
            <b>{t('conflicts_title', { n: a.conflicts.length })}</b>
          </summary>
          <p className="h">{t('conflicts_h')}</p>
          <div className="list">
            {a.conflicts.map((c) => (
              <div className="it" key={c.inv}>
                <div className="t">
                  <b>{c.inv}</b>
                  <br />
                  <small>{c.names.join(' / ')}</small>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {a.crossTotal > 0 && (
        <details className="card wa" open={a.sameFile.length === 0}>
          <summary>
            <b>{t('cross_title', { n: a.crossTotal })}</b>
          </summary>
          <p className="h">{t('cross_h')}</p>
          {a.cross.map((c) => (
            <div key={c.sectionId} style={{ marginBottom: 8 }}>
              <b>{c.sectionName}</b> <small className="mut">({c.buildingName}) · {fmtNum(c.count)} {t('pcs')}</small>
              <div className="list" style={{ maxHeight: 200, overflow: 'auto' }}>
                {c.sample.map((x) => (
                  <div className="it" key={x.inv}>
                    <small>
                      <b>{x.inv}</b> · {x.name} · {x.mol}
                    </small>
                  </div>
                ))}
                {c.count > c.sample.length && <div className="it mut sm">… +{c.count - c.sample.length}</div>}
              </div>
            </div>
          ))}
        </details>
      )}

      {a.sameFile.length > 0 ? (
        <div className="card er">
          <b>{t('same_file_title')}</b>
          {a.sameFile.map((s) => (
            <label key={s.sectionId} className="it clk" style={{ background: 'transparent' }}>
              <input type="radio" name="tg" checked={target === s.sectionId} onChange={() => setTarget(s.sectionId)} />
              <div className="t">
                <b>{s.name}</b> <small>({s.buildingName})</small>
                <br />
                <small>
                  {s.reason !== 'overlap' && t('same_name')}
                  {s.reason === 'both' && ' · '}
                  {s.reason !== 'name' && t('same_overlap', { p: Math.round(s.overlap * 100) })}
                </small>
              </div>
            </label>
          ))}
          <div className="acts" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <button className="btn" disabled={busy} onClick={createNew}>
              {t('as_new_section')}
            </button>
            <button className="btn s" disabled={busy || !target} onClick={previewUpdate}>
              {t('update_existing')}
            </button>
            <button className="btn s" disabled={busy} onClick={() => onDone(null)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="btn" disabled={busy} onClick={createNew}>
            {busy ? t('saving') : t('create_section')}
          </button>
          <button className="btn s" disabled={busy} onClick={() => onDone(null)}>
            {t('cancel')}
          </button>
        </div>
      )}
    </>
  );
}

function DiffList({ title, items, more }: { title: string; items: string[]; more: number }) {
  if (!more) return null;
  return (
    <details className="card">
      <summary>
        {title} ({more})
      </summary>
      <div className="list" style={{ maxHeight: 260, overflow: 'auto' }}>
        {items.map((s, i) => (
          <div className="it sm" key={i}>
            {s}
          </div>
        ))}
        {more > items.length && <div className="it mut sm">… +{more - items.length}</div>}
      </div>
    </details>
  );
}
