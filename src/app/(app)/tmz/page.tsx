'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/AppContext';
import { useFetch } from '@/lib/hooks';
import { useSync, type Op } from '@/lib/sync';
import { fmtNum, fmtTime } from '@/lib/client';
import { downloadCsv, downloadXlsx, safeName } from '@/lib/export';
import { feedback } from '@/lib/qr';
import type { MsgKey } from '@/lib/i18n';

type Entry = { id: string; name: string; unit: string; good: number; bad: number; updatedBy: string; updatedAt: string };
type Room = { id: string; name: string; status: 'IN_PROGRESS' | 'DONE'; doneAt: string | null; doneById: string | null; entries: Entry[] };
type S = { building: { id: string; name: string }; canWork: boolean; users: Record<string, string>; rooms: Room[] };
type B = { id: string; name: string };

const UNITS = ['dona', 'juft', 'kg', 'komplekt', 'metr'];
const DEFAULT_NAMES = ['Matras', 'Yostiq', 'Yostiq jildi', 'Choyshab', "Ko'rpa", "Ko'rpa jildi", 'Adyol', 'Sochiq', 'Karavot', 'Parda', 'Gilam', 'Stul', 'Stol', 'Shkaf', 'Tumba'];

/** TMZ hisobi: inventar raqamsiz, son bo'yicha sanash */
export default function Tmz() {
  const { t, me, toast, confirm } = useApp();
  const { submit, queued, pending, onApplied } = useSync();
  const { data: bs } = useFetch<B[]>('/api/buildings');
  const [bid, setBid] = useState('');
  const [tab, setTab] = useState<'count' | 'report'>('count');
  const [room, setRoom] = useState('');
  const [roomIn, setRoomIn] = useState('');
  const [q, setQ] = useState<Op[]>([]);
  const { data: st, reload } = useFetch<S>(bid ? '/api/tmz?buildingId=' + bid : null, 4000);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('inv_tmz') || '{}');
      if (v.bid) setBid(v.bid);
      if (v.room) (setRoom(v.room), setRoomIn(v.room));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('inv_tmz', JSON.stringify({ bid, room }));
    } catch {}
  }, [bid, room]);
  useEffect(() => {
    queued().then(setQ);
  }, [pending, queued]);
  useEffect(() => onApplied(() => reload()), [onApplied, reload]);

  const cur = st?.rooms.find((r) => r.name === room);
  const locked = cur?.status === 'DONE';
  const canWork = !!st?.canWork && me.role !== 'VIEWER';

  // navbatdagi (hali yuborilmagan) o'zgarishlarni ko'rsatishga qo'shamiz
  const qDelta = useMemo(() => {
    const m = new Map<string, { g: number; b: number }>();
    q.filter((o) => o.type === 'tmz_delta' && o.payload.buildingId === bid).forEach((o) => {
      const k = `${o.payload.room}|${o.payload.name}|${o.payload.unit}`;
      const v = m.get(k) || { g: 0, b: 0 };
      m.set(k, { g: v.g + Number(o.payload.dGood || 0), b: v.b + Number(o.payload.dBad || 0) });
    });
    return m;
  }, [q, bid]);

  const rows = useMemo(() => {
    const list: (Entry & { queued?: boolean })[] = (cur?.entries || []).map((e) => {
      const d = qDelta.get(`${room}|${e.name}|${e.unit}`);
      return d ? { ...e, good: Math.max(0, e.good + d.g), bad: Math.max(0, e.bad + d.b), queued: true } : e;
    });
    qDelta.forEach((d, k) => {
      const [r, name, unit] = k.split('|');
      if (r === room && !list.some((e) => e.name === name && e.unit === unit)) list.push({ id: 'q' + k, name, unit, good: Math.max(0, d.g), bad: Math.max(0, d.b), updatedBy: me.id, updatedAt: '', queued: true });
    });
    return list;
  }, [cur, qDelta, room, me.id]);

  const delta = useCallback(
    async (name: string, unit: string, dGood: number, dBad: number) => {
      if (!room) return toast(t('enter_room_first'));
      if (locked) return toast(t('r_locked_room'));
      const r = await submit('tmz_delta', { buildingId: bid, room, name, unit, dGood, dBad }, 4000);
      if (r.status === 'rejected') toast(t(('e_' + r.error) as MsgKey));
      queued().then(setQ);
    },
    [room, locked, submit, bid, toast, t, queued],
  );

  const [f, setF] = useState({ name: '', unit: 'dona', good: '', bad: '' });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const g = Math.max(0, Number(f.good) || 0),
      b = Math.max(0, Number(f.bad) || 0);
    if (!f.name.trim() || (!g && !b)) return toast(t('tmz_need_count'));
    await delta(f.name.trim(), f.unit, g, b);
    feedback('ok');
    setF({ ...f, name: '', good: '', bad: '' });
  }
  async function del(e: Entry) {
    if (!(await confirm(t('cancel_row_q'), `${e.name}: ${e.good} + ${e.bad} ${e.unit}`, t('delete')))) return;
    const r = await submit('tmz_del', { id: e.id });
    if (r.status === 'rejected') toast(t(('e_' + r.error) as MsgKey));
  }
  async function roomStatus(done: boolean) {
    if (done && !(await confirm(t('room_finish_q', { r: room }), t('tmz_finish_t'), t('room_finish'), false))) return;
    const r = await submit(done ? 'tmz_room_done' : 'tmz_room_reopen', { buildingId: bid, room });
    if (r.status === 'rejected') toast(t(('e_' + r.error) as MsgKey));
    else if (done) toast(t('room_finished', { r: room }));
  }

  const names = useMemo(() => [...new Set([...DEFAULT_NAMES, ...(st?.rooms.flatMap((r) => r.entries.map((e) => e.name)) || [])])].sort(), [st]);

  // hisobot
  const totals = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; good: number; bad: number }>();
    st?.rooms.forEach((r) =>
      r.entries.forEach((e) => {
        const k = e.name + '|' + e.unit;
        const v = m.get(k) || { name: e.name, unit: e.unit, good: 0, bad: 0 };
        v.good += e.good;
        v.bad += e.bad;
        m.set(k, v);
      }),
    );
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [st]);
  const head = [t('building'), t('room_label'), t('tmz_item'), t('tmz_unit'), t('tmz_good'), t('tmz_bad'), t('total'), t('status'), t('done_by'), t('done_at')];
  const detail = () =>
    (st?.rooms || []).flatMap((r) => r.entries.map((e) => [st!.building.name, r.name, e.name, e.unit, e.good, e.bad, e.good + e.bad, r.status === 'DONE' ? t('room_done_tag') : t('in_progress'), st!.users[r.doneById || ''] || '', fmtTime(r.doneAt)]));
  function xlsx() {
    downloadXlsx(safeName(`TMZ - ${st!.building.name}`) + '.xlsx', [
      { name: t('nav_report'), rows: [head, ...detail()], widths: [24, 12, 28, 10, 10, 10, 10, 14, 22, 18] },
      { name: t('total'), rows: [[t('tmz_item'), t('tmz_unit'), t('tmz_good'), t('tmz_bad'), t('total')], ...totals.map((x) => [x.name, x.unit, x.good, x.bad, x.good + x.bad])], widths: [28, 10, 10, 10, 10] },
    ]);
  }

  return (
    <main>
      <h2>{t('nav_tmz')}</h2>
      <p className="h">{t('tmz_h')}</p>
      <select value={bid} onChange={(e) => setBid(e.target.value)} aria-label={t('building')}>
        <option value="">
          {t('building')}: {t('choose')}
        </option>
        {bs?.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {bid && (
        <div className="chips">
          <button className={'chip' + (tab === 'count' ? ' on' : '')} onClick={() => setTab('count')}>
            {t('tmz_count')}
          </button>
          <button className={'chip' + (tab === 'report' ? ' on' : '')} onClick={() => setTab('report')}>
            {t('nav_report')}
          </button>
        </div>
      )}
      {bid && !st && <div className="card mut">{t('loading')}</div>}

      {st && tab === 'count' && (
        <>
          {!canWork && <div className="card wa">{me.role === 'VIEWER' ? t('viewer_no_scan') : t('no_work_access')}</div>}
          <div className="ctx" style={{ margin: '8px 0' }}>
            <div className="t">
              <div className="b">{st.building.name}</div>
              <div className="s">TMZ</div>
            </div>
            <div className="rm">{room ? t('room_short') + ' ' + room : '—'}</div>
          </div>
          <div className="card" style={{ marginTop: 0 }}>
            <b>{t('room_label')}</b>
            <div className="row" style={{ marginBottom: 0 }}>
              <input type="text" list="tmz-rooms" value={roomIn} placeholder={t('room_ph')} onChange={(e) => setRoomIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setRoom(roomIn.trim())} onBlur={() => setRoom(roomIn.replace(/\s+/g, ' ').trim())} />
              <button className="btn auto" onClick={() => setRoom(roomIn.replace(/\s+/g, ' ').trim())}>
                {t('ok')}
              </button>
            </div>
            <datalist id="tmz-rooms">
              {st.rooms.map((r) => (
                <option key={r.id} value={r.name} />
              ))}
            </datalist>
          </div>
          {room && locked && (
            <div className="card er">
              <b>{t('r_locked_room')}</b>
              <br />
              <small>
                {fmtTime(cur?.doneAt)} · {st.users[cur?.doneById || '']}
              </small>
              {canWork && (
                <div className="row">
                  <button className="btn s" onClick={() => roomStatus(false)}>
                    {t('edit')}
                  </button>
                </div>
              )}
            </div>
          )}
          {room && canWork && !locked && (
            <form className="card ac" onSubmit={add}>
              <b>{t('tmz_add')}</b>
              <label className="f">
                <span>{t('tmz_item')}</span>
                <input type="text" list="tmz-names" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
                <datalist id="tmz-names">
                  {names.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
              <div className="row">
                <label className="f" style={{ margin: 0 }}>
                  <span>{t('tmz_unit')}</span>
                  <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {t(('u_' + u) as MsgKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="f" style={{ margin: 0 }}>
                  <span>{t('tmz_good')}</span>
                  <input type="number" inputMode="numeric" min={0} value={f.good} onChange={(e) => setF({ ...f, good: e.target.value })} />
                </label>
                <label className="f" style={{ margin: 0 }}>
                  <span>{t('tmz_bad')}</span>
                  <input type="number" inputMode="numeric" min={0} value={f.bad} onChange={(e) => setF({ ...f, bad: e.target.value })} />
                </label>
              </div>
              <button className="btn w">{t('add')}</button>
            </form>
          )}
          {room && (
            <>
              <h3>
                {t('here_title')} ({rows.length})
              </h3>
              <div className="list">
                {rows.map((e) => (
                  <div className="it wr" key={e.id}>
                    <div className="t">
                      <div className="n">
                        <b>{e.name}</b> <small>({t(('u_' + e.unit) as MsgKey)})</small> {e.queued && <span className="tag no">{t('queued_tag')}</span>}
                      </div>
                      <small>
                        {t('total')}: {e.good + e.bad} · {st.users[e.updatedBy] || ''}
                      </small>
                    </div>
                    <Counter label={t('tmz_good')} v={e.good} cls="ok" disabled={!canWork || locked} onD={(d) => delta(e.name, e.unit, d, 0)} />
                    <Counter label={t('tmz_bad')} v={e.bad} cls="no" disabled={!canWork || locked} onD={(d) => delta(e.name, e.unit, 0, d)} />
                    {canWork && !locked && !e.queued && (
                      <button className="btn s sm auto" onClick={() => del(e)} aria-label={t('delete')}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {!rows.length && <div className="it mut">{t('none_yet')}</div>}
              </div>
              {canWork && !locked && rows.length > 0 && (
                <button className="btn ok w" style={{ marginTop: 12 }} onClick={() => roomStatus(true)}>
                  ✓ {t('room_finish')}
                </button>
              )}
            </>
          )}
        </>
      )}

      {st && tab === 'report' && (
        <>
          <div className="row">
            <button className="btn" onClick={xlsx}>
              {t('download_xlsx')}
            </button>
            <button className="btn s" onClick={() => downloadCsv(safeName(`TMZ - ${st.building.name}`) + '.csv', head, detail())}>
              {t('download_csv')}
            </button>
          </div>
          <h3>{t('total')}</h3>
          <div className="tw">
            <table className="t">
              <thead>
                <tr>
                  <th>{t('tmz_item')}</th>
                  <th>{t('tmz_unit')}</th>
                  <th className="n">{t('tmz_good')}</th>
                  <th className="n">{t('tmz_bad')}</th>
                  <th className="n">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((x) => (
                  <tr key={x.name + x.unit}>
                    <td>{x.name}</td>
                    <td>{t(('u_' + x.unit) as MsgKey)}</td>
                    <td className="n">{fmtNum(x.good)}</td>
                    <td className="n">{fmtNum(x.bad)}</td>
                    <td className="n">
                      <b>{fmtNum(x.good + x.bad)}</b>
                    </td>
                  </tr>
                ))}
                {!totals.length && (
                  <tr>
                    <td colSpan={5} className="mut">
                      {t('none_yet')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <h3>{t('rooms_title')}</h3>
          <div className="list">
            {st.rooms.map((r) => (
              <div className="it" key={r.id}>
                <span className={'dot' + (r.status === 'DONE' ? ' f' : '')} />
                <div className="t">
                  <div className="n">
                    <b>
                      {t('room_short')} {r.name}
                    </b>{' '}
                    · {r.entries.reduce((a, e) => a + e.good + e.bad, 0)} ({r.entries.length} {t('tmz_kinds')})
                  </div>
                  <small>{r.status === 'DONE' ? `${t('room_done_tag')} · ${fmtTime(r.doneAt)} · ${st.users[r.doneById || ''] || ''}` : t('in_progress')}</small>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Counter({ label, v, cls, disabled, onD }: { label: string; v: number; cls: string; disabled: boolean; onD: (d: number) => void }) {
  return (
    <div className="auto" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <small className="mut" style={{ minWidth: 52 }}>
        {label}
      </small>
      <button className="btn s sm" disabled={disabled || v <= 0} onClick={() => onD(-1)} aria-label={'− ' + label} style={{ minWidth: 40 }}>
        −
      </button>
      <span className={'tag ' + cls} style={{ minWidth: 40, textAlign: 'center', fontSize: 16 }}>
        {v}
      </span>
      <button className="btn s sm" disabled={disabled} onClick={() => onD(1)} aria-label={'+ ' + label} style={{ minWidth: 40 }}>
        +
      </button>
    </div>
  );
}
