'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/AppContext';
import { useCurrent } from '@/lib/current';
import { useSectionData, type State } from '@/lib/sectionData';
import { useSync, type Op, type OpResult } from '@/lib/sync';
import { decodeImage, decodeVideo, feedback, loadImage, unlockAudio } from '@/lib/qr';
import { fmtNum, fmtTime } from '@/lib/client';
import type { MsgKey } from '@/lib/i18n';

type Last = { cls: string; title: string; lines: string[] };
const CONDS = ['GOOD', 'FAIR', 'BAD', 'REPAIR'] as const;

export default function Scan() {
  const { t, me, toast, confirm, ask } = useApp();
  const { sectionId, section, room, setRoom } = useCurrent();
  const { submit, queued, pending: pendingOps } = useSync();
  const { state, itemMap, foundMap, roomById, uname } = useSectionData(sectionId);
  const [last, setLast] = useState<Last | null>(null);
  const [man, setMan] = useState('');
  const [roomInput, setRoomInput] = useState(room);
  const [camOn, setCamOn] = useState(false);
  const [noinvOpen, setNoinvOpen] = useState(false);
  const [q, setQ] = useState<Op[]>([]);
  const busy = useRef(false);

  useEffect(() => setRoomInput(room), [room, sectionId]);
  useEffect(() => {
    queued().then(setQ);
  }, [pendingOps, queued]);

  const curRoom = useMemo(() => state?.rooms.find((r) => r.name === room), [state, room]);
  const locked = section?.status === 'DONE' ? 'section' : curRoom?.status === 'DONE' ? 'room' : null;
  const canScan = !!section && section.canWork && !!room && !locked;

  // ---------- natijani ko'rsatish ----------
  const show = useCallback(
    (r: OpResult): 'ok' | 'warn' | 'err' => {
      const inv = String(r.inv ?? '');
      const nm = String(r.name || itemMap.get(inv)?.name || '');
      const L = (cls: string, titleKey: MsgKey, lines: string[], v?: Record<string, string | number>) => setLast({ cls, title: t(titleKey, v), lines: lines.filter(Boolean) });
      switch (r.status) {
        case 'found':
          L('ok', 'r_found', [nm, `${inv} · ${t('room_short')} ${r.room}`, r.delisted ? t('r_delisted_note') : '']);
          return 'ok';
        case 'already_here':
          L('wa', 'r_already_here', [nm, inv, t('r_by', { w: String(r.who), t: fmtTime(r.at as string) })]);
          return 'warn';
        case 'moved':
          L('ok', 'r_moved', [inv, `${r.from} → ${r.room}`]);
          return 'ok';
        case 'dup_saved':
          L('pu', 'r_dup_saved', [inv, `${t('room_short')} ${r.room}`]);
          return 'ok';
        case 'other_saved':
          L('pu', 'r_other_saved', [inv]);
          return 'ok';
        case 'extra_saved':
          L('no', 'r_extra_saved', [inv]);
          return 'ok';
        case 'extra_already':
          L('wa', 'r_extra_already', [inv, `${t('room_short')} ${r.extraRoom} · ${r.who}`]);
          return 'warn';
        case 'cancelled':
          L('', 'r_cancelled', [inv]);
          return 'warn';
        case 'locked':
          L('er', r.lock === 'section' ? 'r_locked_section' : 'r_locked_room', [inv, t('r_locked_saved')]);
          return 'err';
        case 'queued':
          L('', 'r_queued', [nm || inv, inv]);
          return 'warn';
        case 'rejected':
          L('er', 'r_rejected', [inv, t(('e_' + r.error) as MsgKey)]);
          return 'err';
        case 'already_resolved':
          L('', 'r_already_resolved', []);
          return 'warn';
        default:
          L('', 'r_saved', [inv]);
          return 'ok';
      }
    },
    [itemMap, t],
  );

  // ---------- qaror talab qiladigan holatlar ----------
  const decide = useCallback(
    async (r: OpResult | { status: string; pendingId: string; inv: string; [k: string]: unknown }) => {
      const inv = String(r.inv);
      let choice: string | null = null;
      let extra: Record<string, unknown> = {};
      if (r.status === 'other_room' || r.status === 'OTHER_ROOM') {
        feedback('warn');
        choice = await ask(
          t('d_other_room_t'),
          <>
            <p>
              <b>{inv}</b> {String(r.name || itemMap.get(inv)?.name || '')}
            </p>
            <p>{t('d_other_room', { room: String(r.foundRoom), who: String(r.foundBy), t: fmtTime(r.foundAt as string) })}</p>
          </>,
          [
            { label: t('d_move'), value: 'move', kind: '' },
            { label: t('d_dup'), value: 'dup', kind: 's' },
            { label: t('cancel'), value: 'cancel', kind: 's' },
          ],
        );
      } else if (r.status === 'other_section' || r.status === 'OTHER_SECTION') {
        feedback('warn');
        const secs = (r.sections || []) as { sectionId: string; sectionName: string; buildingName: string; mol: string; itemName: string }[];
        choice = await ask(
          t('d_other_section_t'),
          <>
            <p>
              <b>{inv}</b>
            </p>
            {secs.map((s) => (
              <div className="card wa" key={s.sectionId}>
                {t('d_other_section', { s: s.sectionName, b: s.buildingName, m: s.mol || '—' })}
                <br />
                <small>{s.itemName}</small>
              </div>
            ))}
            <p className="h">{t('d_other_section_h')}</p>
          </>,
          [
            { label: t('d_confirm_other'), value: 'confirm', kind: '' },
            { label: t('cancel'), value: 'cancel', kind: 's' },
          ],
        );
        extra = { otherSectionId: secs[0]?.sectionId };
      } else if (r.status === 'not_in_db' || r.status === 'NOT_IN_DB') {
        feedback('err');
        choice = await ask(t('d_not_in_db_t'), <p><b>{inv}</b><br />{t('d_not_in_db')}</p>, [
          { label: t('d_confirm_extra'), value: 'confirm', kind: '' },
          { label: t('cancel'), value: 'cancel', kind: 's' },
        ]);
      } else if (r.status === 'LOCKED') {
        choice = await ask(t('r_locked_room'), <p><b>{inv}</b><br />{t('d_locked')}</p>, [
          { label: t('d_retry'), value: 'retry', kind: '' },
          { label: t('d_discard'), value: 'cancel', kind: 'd' },
          { label: t('close'), value: 'later', kind: 's' },
        ]);
        if (choice === 'later') choice = null;
      }
      if (!choice) {
        setLast({ cls: 'wa', title: t('r_pending_left'), lines: [inv] });
        return;
      }
      const res = await submit('resolve', { pendingId: r.pendingId, choice, ...extra });
      const k = show(res);
      feedback(k);
    },
    [ask, itemMap, show, submit, t],
  );

  // ---------- skanerlash ----------
  const mark = useCallback(
    async (code: string, method: string) => {
      const inv = code.replace(/[\s\u0000-\u001f]+/g, '');
      if (!inv) return;
      unlockAudio();
      if (!section) return;
      if (!section.canWork) return toast(t('err_forbidden'));
      if (!room) {
        toast(t('enter_room_first'));
        document.getElementById('room')?.focus();
        return;
      }
      if (locked) {
        feedback('err');
        setLast({ cls: 'er', title: t(locked === 'section' ? 'r_locked_section' : 'r_locked_room'), lines: [t('locked_hint')] });
        return;
      }
      // tez javob: shu xonada allaqachon topilgan (mahalliy ma'lumot bo'yicha) — serverga yubormaymiz
      const f = foundMap.get(inv);
      if (f && roomById.get(f.roomId)?.name === room) {
        feedback('warn');
        setLast({ cls: 'wa', title: t('r_already_here'), lines: [itemMap.get(inv)?.name || '', inv, t('r_by', { w: uname(f.userId), t: fmtTime(f.at) })] });
        return;
      }
      if (busy.current) return;
      busy.current = true;
      try {
        const res = await submit('scan', { sectionId, room, inv, at: Date.now(), method });
        if (['other_room', 'other_section', 'not_in_db'].includes(res.status)) {
          busy.current = false;
          await decide(res);
          return;
        }
        const k = show(res);
        feedback(res.status === 'queued' ? (itemMap.has(inv) ? 'ok' : 'warn') : k);
      } finally {
        busy.current = false;
      }
    },
    [section, room, locked, foundMap, roomById, itemMap, uname, submit, sectionId, decide, show, toast, t],
  );

  // ---------- kamera ----------
  const vid = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const lastCode = useRef({ c: '', t: 0 });
  const markRef = useRef(mark);
  markRef.current = mark;
  const stopCam = useCallback(() => {
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null;
    setCamOn(false);
  }, []);
  useEffect(() => stopCam, [stopCam]);
  useEffect(() => {
    if (!camOn) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stop) return;
      const v = vid.current;
      if (v) {
        const c = await decodeVideo(v);
        if (c) {
          const n = Date.now();
          if (c !== lastCode.current.c || n - lastCode.current.t > 2500) {
            lastCode.current = { c, t: n };
            await markRef.current(c, 'camera');
          }
        }
      }
      timer = setTimeout(loop, 120);
    };
    loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [camOn]);
  async function startCam() {
    unlockAudio();
    if (camOn) return stopCam();
    if (!canScan) return toast(!room ? t('enter_room_first') : t('locked_hint'));
    if (!navigator.mediaDevices?.getUserMedia) return toast(t('cam_unsupported'));
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      stream.current = s;
      setCamOn(true);
      setTimeout(() => {
        if (vid.current) {
          vid.current.srcObject = s;
          vid.current.play().catch(() => {});
        }
      }, 0);
    } catch {
      toast(t('cam_failed'));
    }
  }

  // ---------- rasm ----------
  const snapRef = useRef<HTMLInputElement>(null);
  async function onSnap(f: File) {
    toast(t('reading'));
    try {
      const im = await loadImage(f);
      const c = await decodeImage(im);
      if (c) await mark(c, 'photo');
      else {
        feedback('err');
        toast(t('qr_not_found'));
      }
    } catch {
      toast(t('img_failed'));
    }
  }

  function applyRoom() {
    const r = roomInput.replace(/\s+/g, ' ').trim();
    setRoom(r);
    if (r) toast(t('room_set', { r }));
  }

  // ---------- shu xonadagi yozuvlar ----------
  const here = useMemo(() => {
    if (!state || !curRoom) return [];
    const rid = curRoom.id;
    type Row = { key: string; kind: 'found' | 'extra' | 'dup' | 'noinv'; id: string; at: string; title: string; sub: string; cls: string };
    const rows: Row[] = [];
    state.founds.filter((f) => f.roomId === rid).forEach((f) => rows.push({ key: 'f' + f.id, kind: 'found', id: f.id, at: f.at, title: itemMap.get(f.inv)?.name || f.inv, sub: `${f.inv} · ${fmtNum(itemMap.get(f.inv)?.sum)} ${t('sum_currency')} · ${uname(f.userId)}`, cls: 'f' }));
    state.extras.filter((e) => e.roomId === rid).forEach((e) => rows.push({ key: 'e' + e.id, kind: 'extra', id: e.id, at: e.at, title: e.inv, sub: (e.kind === 'OTHER_SECTION' ? t('k_other_section') : t('k_extra')) + ' · ' + uname(e.userId), cls: '' }));
    state.dups.filter((d) => d.roomId === rid).forEach((d) => rows.push({ key: 'd' + d.id, kind: 'dup', id: d.id, at: d.at, title: `${d.inv} · ${itemMap.get(d.inv)?.name || ''}`, sub: t('k_dup') + ' · ' + uname(d.userId), cls: '' }));
    state.noInv.filter((n) => n.roomId === rid).forEach((n) => rows.push({ key: 'n' + n.id, kind: 'noinv', id: n.id, at: n.at, title: `${n.name} × ${n.qty}`, sub: `${t('k_noinv')} · ${t(('cond_' + n.condition) as MsgKey)}${n.note ? ' · ' + n.note : ''} · ${uname(n.userId)}`, cls: 'x' }));
    return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [state, curRoom, itemMap, uname, t]);
  const queuedHere = q.filter((o) => (o.type === 'scan' || o.type === 'noinv') && o.payload.sectionId === sectionId && o.payload.room === room);
  const myPending = (state?.pending || []).filter((p) => p.userId === me.id || me.role === 'ADMIN');

  async function cancelRow(r: { kind: string; id: string; title: string }) {
    if (!(await confirm(t('cancel_row_q'), r.title, t('cancel_row')))) return;
    const res = await submit('cancel', { sectionId, kind: r.kind, id: r.id });
    if (res.status === 'rejected') toast(t(('e_' + res.error) as MsgKey));
    else if (res.status === 'queued') toast(t('r_queued'));
  }

  async function finishRoom() {
    if (!room) return;
    if (!(await confirm(t('room_finish_q', { r: room }), t('room_finish_t', { n: here.length }), t('room_finish'), false))) return;
    stopCam();
    const r = await submit('room_done', { sectionId, room });
    if (r.status === 'rejected') toast(t(('e_' + r.error) as MsgKey));
    else {
      toast(t('room_finished', { r: room }));
      setLast(null);
    }
  }
  async function reopenRoom() {
    const r = await submit('room_reopen', { sectionId, room });
    if (r.status === 'rejected') toast(t(('e_' + r.error) as MsgKey));
  }

  if (me.role === 'VIEWER')
    return (
      <main>
        <div className="card">{t('viewer_no_scan')}</div>
      </main>
    );

  const roomNames = state?.rooms.map((r) => r.name) || [];
  const roomFound = curRoom ? state!.founds.filter((f) => f.roomId === curRoom.id).length : 0;

  return (
    <main>
      {section && !section.canWork && <div className="card er">{t('no_work_access')}</div>}
      {section && section.canWork && (
        <>
          <div className="card" style={{ marginTop: 0 }}>
            <label htmlFor="room">
              <b>{t('room_label')}</b>
            </label>
            <div className="row" style={{ marginBottom: 4 }}>
              <input
                id="room"
                type="text"
                list="rooms"
                placeholder={t('room_ph')}
                value={roomInput}
                autoComplete="off"
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyRoom()}
                onBlur={applyRoom}
              />
              <button className="btn auto" onClick={applyRoom}>
                {t('ok')}
              </button>
            </div>
            <datalist id="rooms">
              {roomNames.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <small className="mut">{room ? t('room_hint_set', { n: roomFound }) : t('room_hint')}</small>
          </div>

          {locked && (
            <div className="card er">
              <b>{t(locked === 'section' ? 'r_locked_section' : 'r_locked_room')}</b>
              <br />
              {locked === 'room' && curRoom && (
                <small>
                  {fmtTime(curRoom.doneAt)} · {uname(curRoom.doneById)}
                </small>
              )}
              {locked === 'room' && (
                <div className="row">
                  <button className="btn s" onClick={reopenRoom}>
                    {t('edit')}
                  </button>
                </div>
              )}
            </div>
          )}

          {!locked && (
            <>
              <button className={'btn w' + (canScan ? '' : ' s')} onClick={startCam}>
                {camOn ? t('cam_off') : t('cam_on')}
              </button>
              {camOn && (
                <div className="cam">
                  <video ref={vid} playsInline muted autoPlay />
                </div>
              )}
              <button className="btn s w" style={{ marginTop: 8 }} onClick={() => (canScan ? snapRef.current?.click() : toast(t('enter_room_first')))}>
                {t('snap_scan')}
              </button>
              <input
                ref={snapRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hide"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) onSnap(f);
                }}
              />
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  mark(man, 'manual');
                  setMan('');
                }}
              >
                <input type="text" inputMode="numeric" placeholder={t('manual_ph')} value={man} onChange={(e) => setMan(e.target.value)} aria-label={t('manual_ph')} />
                <button className="btn s auto" disabled={!canScan}>
                  {t('mark')}
                </button>
              </form>
            </>
          )}

          {last && (
            <div className={'card res ' + last.cls} role="status" aria-live="polite">
              <b>{last.title}</b>
              {last.lines.map((l, i) => (
                <div key={i} className={i ? 'sm' : ''}>
                  {l}
                </div>
              ))}
            </div>
          )}

          {myPending.length > 0 && (
            <div className="card wa">
              <b>{t('pending_title', { n: myPending.length })}</b>
              <p className="h">{t('pending_h')}</p>
              <div className="list">
                {myPending.map((p) => (
                  <div className="it" key={p.id}>
                    <div className="t">
                      <div className="n">
                        <b>{p.inv}</b> · {t(('pr_' + p.reason) as MsgKey)}
                      </div>
                      <small>
                        {t('room_short')} {roomById.get(p.roomId)?.name} · {fmtTime(p.at)} · {uname(p.userId)}
                      </small>
                    </div>
                    <button className="btn sm auto" onClick={() => decide({ ...(p.info as object), status: p.reason, pendingId: p.id, inv: p.inv, foundRoom: p.info.foundRoom, foundBy: p.info.foundBy, foundAt: p.info.foundAt, sections: p.info.sections })}>
                      {t('decide')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!locked && room && (
            <>
              <button className="btn s w" style={{ marginTop: 10 }} onClick={() => setNoinvOpen((x) => !x)}>
                + {t('noinv_add')}
              </button>
              {noinvOpen && <NoInvForm state={state} sectionId={sectionId} room={room} onDone={() => setNoinvOpen(false)} />}
            </>
          )}

          {room && (
            <>
              <h3>
                {t('here_title')} ({here.length + queuedHere.length})
              </h3>
              <div className="list">
                {queuedHere.map((o) => (
                  <div className="it" key={o.id}>
                    <span className="dot" style={{ borderStyle: 'dashed' }} />
                    <div className="t">
                      <div className="n">{o.type === 'noinv' ? `${o.payload.name} × ${o.payload.qty}` : itemMap.get(String(o.payload.inv))?.name || String(o.payload.inv)}</div>
                      <small>
                        {String(o.payload.inv || '')} · {t('queued_tag')}
                      </small>
                    </div>
                  </div>
                ))}
                {here.map((r) => (
                  <div className="it" key={r.key}>
                    <span className={'dot ' + r.cls} />
                    <div className="t">
                      <div className="n">{r.title}</div>
                      <small>
                        {r.sub} · {fmtTime(r.at)}
                      </small>
                    </div>
                    {!locked && (
                      <button className="btn s sm auto" onClick={() => cancelRow(r)} aria-label={t('cancel_row')}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {!here.length && !queuedHere.length && <div className="it mut">{t('none_yet')}</div>}
              </div>
              {!locked && (
                <button className="btn ok w" style={{ marginTop: 12 }} onClick={finishRoom}>
                  ✓ {t('room_finish')}
                </button>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

function NoInvForm({ state, sectionId, room, onDone }: { state: State | null; sectionId: string; room: string; onDone: () => void }) {
    const { t, toast } = useApp();
    const { submit } = useSync();
    const [f, setF] = useState({ name: '', qty: '1', condition: 'GOOD', note: '' });
    const names = useMemo(() => [...new Set((state?.noInv || []).map((n) => n.name))].sort(), [state]);
    async function save(e: React.FormEvent) {
      e.preventDefault();
      if (!f.name.trim()) return;
      const r = await submit('noinv', { sectionId, room, name: f.name, qty: Number(f.qty) || 1, condition: f.condition, note: f.note, at: Date.now() });
      if (r.status === 'rejected') toast(t(('e_' + r.error) as MsgKey));
      else {
        feedback('ok');
        toast(r.status === 'queued' ? t('r_queued') : t('noinv_saved', { n: f.name }));
        onDone();
      }
    }
    return (
      <form className="card ac" onSubmit={save}>
        <label className="f">
          <span>{t('name')}</span>
          <input type="text" list="noinv-names" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoFocus />
          <datalist id="noinv-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <div className="row">
          <label className="f" style={{ margin: 0 }}>
            <span>{t('qty')}</span>
            <input type="number" inputMode="numeric" min={1} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          </label>
          <label className="f" style={{ margin: 0 }}>
            <span>{t('status')}</span>
            <select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>
              {CONDS.map((c) => (
                <option key={c} value={c}>
                  {t(('cond_' + c) as MsgKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="f">
          <span>{t('note')}</span>
          <input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <div className="row">
          <button className="btn">{t('save')}</button>
          <button type="button" className="btn s" onClick={onDone}>
            {t('cancel')}
          </button>
        </div>
      </form>
    );
  }
