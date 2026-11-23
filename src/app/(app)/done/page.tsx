'use client';
import { useApp } from '@/components/AppContext';
import { useCurrent } from '@/lib/current';
import { useSectionData } from '@/lib/sectionData';
import { useSync } from '@/lib/sync';
import { fmtTime } from '@/lib/client';
import { useRouter } from 'next/navigation';
import type { MsgKey } from '@/lib/i18n';

/** Bajarilgan (yakunlangan) xonalar */
export default function Done() {
  const { t, toast } = useApp();
  const router = useRouter();
  const { sectionId, section, setRoom } = useCurrent();
  const { state, uname } = useSectionData(sectionId, { items: false });
  const { submit } = useSync();
  if (!sectionId) return <main />;
  if (!state) return <main className="card mut">{t('loading')}</main>;
  const done = state.rooms.filter((r) => r.status === 'DONE').sort((a, b) => ((a.doneAt || '') < (b.doneAt || '') ? 1 : -1));
  const open = state.rooms.filter((r) => r.status !== 'DONE');
  const cnt = (rid: string) => state.founds.filter((f) => f.roomId === rid).length + state.extras.filter((f) => f.roomId === rid).length + state.noInv.filter((f) => f.roomId === rid).length;

  async function reopen(name: string) {
    const r = await submit('room_reopen', { sectionId, room: name });
    if (r.status === 'rejected') return toast(t(('e_' + r.error) as MsgKey));
    setRoom(name);
    router.push('/scan');
  }
  return (
    <main>
      <h2>
        {t('nav_done')} ({done.length})
      </h2>
      <div className="list">
        {done.map((r) => (
          <div className="it" key={r.id}>
            <span className="dot f" />
            <div className="t">
              <div className="n">
                <b>
                  {t('room_short')} {r.name}
                </b>{' '}
                · {t('records_n', { n: cnt(r.id) })}
              </div>
              <small>
                {fmtTime(r.doneAt)} · {uname(r.doneById)}
              </small>
            </div>
            {section?.canWork && section.status !== 'DONE' && (
              <button className="btn s sm auto" onClick={() => reopen(r.name)}>
                {t('edit')}
              </button>
            )}
          </div>
        ))}
        {!done.length && <div className="it mut">{t('none_yet')}</div>}
      </div>
      {open.length > 0 && (
        <>
          <h3>
            {t('in_progress')} ({open.length})
          </h3>
          <div className="list">
            {open.map((r) => (
              <div className="it" key={r.id}>
                <span className="dot" />
                <div className="t">
                  {t('room_short')} {r.name} · {t('records_n', { n: cnt(r.id) })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
