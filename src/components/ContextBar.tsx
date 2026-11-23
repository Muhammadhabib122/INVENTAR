'use client';
import Link from 'next/link';
import { useApp } from './AppContext';
import { useCurrent } from '@/lib/current';

/** Qaysi bino, bo'lim va xona ochiqligini doim katta qilib ko'rsatadi */
export function ContextBar({ showRoom = false }: { showRoom?: boolean }) {
  const { t } = useApp();
  const { section, sectionId, room } = useCurrent();
  if (!sectionId)
    return (
      <div className="ctx done">
        <div className="t s">{t('no_section')}</div>
        <Link className="btn sm auto" href="/sections">
          {t('choose_section')}
        </Link>
      </div>
    );
  if (!section)
    return (
      <div className="ctx">
        <div className="t mut">{t('loading')}</div>
      </div>
    );
  return (
    <div className={'ctx' + (section.status === 'DONE' ? ' done' : '')}>
      <div className="t">
        <div className="b">{section.buildingName}</div>
        <div className="s">
          {section.name}
          {section.status === 'DONE' ? ' · ' + t('section_done_tag') : ''}
        </div>
      </div>
      {showRoom && <div className="rm">{room ? t('room_short') + ' ' + room : '—'}</div>}
      <Link className="btn s sm auto" href="/sections">
        {t('change')}
      </Link>
    </div>
  );
}
