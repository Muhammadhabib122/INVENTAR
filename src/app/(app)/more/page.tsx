'use client';
import Link from 'next/link';
import { useApp } from '@/components/AppContext';
import { useSync } from '@/lib/sync';
import { FailedOps } from '@/components/FailedOps';
import type { MsgKey } from '@/lib/i18n';

export default function More() {
  const { t, me, confirm } = useApp();
  const { pending } = useSync();
  const L = (href: string, k: MsgKey) => (
    <Link className="it clk" href={href} key={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="t">{t(k)}</div>
      <span className="mut">›</span>
    </Link>
  );
  const admin = me.role === 'ADMIN';
  async function logout() {
    if (pending > 0 && !(await confirm(t('logout_pending_q', { n: pending }), t('logout_pending_t'), t('logout')))) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    try {
      for (const k of await caches.keys()) await caches.delete(k);
    } catch {}
    location.href = '/login';
  }
  return (
    <main>
      <div className="card">
        <b>{me.fullName}</b>
        <br />
        <small className="mut">
          {me.username} · {t(('role_' + me.role) as MsgKey)}
        </small>
      </div>
      <FailedOps />
      <div className="grp">{t('app')}</div>
      <div className="list">
        {L('/sections', 'nav_sections')}
        {L('/labels', 'nav_labels')}
        {L('/done', 'nav_done')}
        {L('/summary', 'nav_summary')}
        {L('/tmz', 'nav_tmz')}
      </div>
      {admin && (
        <>
          <div className="grp">Admin</div>
          <div className="list">
            {L('/admin/buildings', 'nav_buildings')}
            {L('/admin/users', 'nav_users')}
            {L('/admin/audit', 'nav_audit')}
            {L('/admin/trash', 'nav_trash')}
          </div>
        </>
      )}
      <div className="grp">{t('profile')}</div>
      <div className="list">{L('/profile', 'profile')}</div>
      <div className="row">
        <button className="btn s" onClick={logout}>
          {t('logout')}
        </button>
      </div>
    </main>
  );
}
