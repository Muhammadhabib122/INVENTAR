'use client';
import { useApp } from '@/components/AppContext';
export default function Home() {
  const { t, me } = useApp();
  return (
    <main>
      <h2>{t('nav_home')}</h2>
      <div className="card">{me.fullName}</div>
    </main>
  );
}
