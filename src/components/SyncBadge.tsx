'use client';
import { useApp } from './AppContext';
import { useSync } from '@/lib/sync';

export function SyncBadge() {
  const { t } = useApp();
  const { pending, online } = useSync();
  if (pending > 0) return <span className="sync no" role="status">{t('sync_pending', { n: pending })}{online ? '' : ' · ' + t('offline')}</span>;
  return <span className="sync ok" role="status">{online ? t('sync_ok') : t('offline')}</span>;
}
