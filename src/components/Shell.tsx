'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { SyncBadge } from './SyncBadge';
import { ContextBar } from './ContextBar';

export function Shell({ children }: { children: ReactNode }) {
  const { t, me } = useApp();
  const path = usePathname();
  const items = [
    { href: '/', i: '⌂', l: t('nav_home') },
    ...(me.role !== 'VIEWER' ? [{ href: '/scan', i: '⌗', l: t('nav_scan') }] : []),
    { href: '/list', i: '☰', l: t('nav_list') },
    { href: '/report', i: '▤', l: t('nav_report') },
    { href: '/more', i: '⋯', l: t('nav_more') },
  ];
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  const active = (h: string) => (h === '/' ? path === '/' : path.startsWith(h));
  return (
    <>
      <div className="top np">
        <div className="r1">
          <h1>
            {t('univ')} · {t('app')}
          </h1>
          <SyncBadge />
        </div>
        {CTX.some((x) => path.startsWith(x)) && <ContextBar showRoom={path.startsWith('/scan')} />}
      </div>
      {children}
      <nav className="nav np">
        {items.map((x) => (
          <Link key={x.href} href={x.href} className={active(x.href) || (x.href === '/more' && isMore(path)) ? 'on' : ''}>
            <span className="i" aria-hidden>
              {x.i}
            </span>
            {x.l}
          </Link>
        ))}
      </nav>
    </>
  );
}
const CTX = ['/scan', '/list', '/report', '/labels', '/done'];
const isMore = (p: string) => ['/more', '/sections', '/labels', '/done', '/summary', '/tmz', '/admin', '/profile'].some((x) => p.startsWith(x));
