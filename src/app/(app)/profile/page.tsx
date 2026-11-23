'use client';
import { useState } from 'react';
import { useApp } from '@/components/AppContext';
import { apiFetch } from '@/lib/client';
import type { LangCode } from '@/lib/i18n';

export default function Profile() {
  const { t, me, setLang, toast, errMsg } = useApp();
  const [o, setO] = useState('');
  const [n, setN] = useState('');
  async function lang(l: LangCode) {
    setLang(l);
    try {
      localStorage.setItem('inv_lang', l);
    } catch {}
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: { lang: l } });
    } catch (e) {
      toast(errMsg(e));
    }
  }
  async function pw(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/me', { method: 'PATCH', body: { oldPassword: o, newPassword: n } });
      setO('');
      setN('');
      toast(t('password_changed'));
    } catch (er) {
      toast(errMsg(er));
    }
  }
  return (
    <main>
      <h2>{t('lang')}</h2>
      <div className="chips">
        <button className={'chip' + (me.lang === 'LAT' ? ' on' : '')} onClick={() => lang('LAT')}>
          Lotin
        </button>
        <button className={'chip' + (me.lang === 'CYR' ? ' on' : '')} onClick={() => lang('CYR')}>
          Кирилл
        </button>
      </div>
      <h2>{t('change_password')}</h2>
      <form className="card" onSubmit={pw}>
        <label className="f">
          <span>{t('old_password')}</span>
          <input type="password" autoComplete="current-password" value={o} onChange={(e) => setO(e.target.value)} required />
        </label>
        <label className="f">
          <span>{t('new_password')}</span>
          <input type="password" autoComplete="new-password" minLength={8} value={n} onChange={(e) => setN(e.target.value)} required />
        </label>
        <button className="btn w">{t('save')}</button>
      </form>
    </main>
  );
}
