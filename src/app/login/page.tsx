'use client';
import { useState } from 'react';
import { translate, type LangCode } from '@/lib/i18n';

export default function Login() {
  const [lang, setLang] = useState<LangCode>(() => {
    try {
      return (localStorage.getItem('inv_lang') as LangCode) || 'LAT';
    } catch {
      return 'LAT';
    }
  });
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sw = (l: LangCode) => {
    setLang(l);
    try {
      localStorage.setItem('inv_lang', l);
    } catch {}
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        location.href = '/';
        return;
      }
      setErr(d.error === 'locked' ? t('login_locked') : t('login_bad'));
    } catch {
      setErr(t('err_network'));
    }
    setBusy(false);
  }
  return (
    <div className="login">
      <div className="chips" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className={'chip' + (lang === 'LAT' ? ' on' : '')} style={{ flex: '0 0 auto' }} onClick={() => sw('LAT')}>
          Lotin
        </button>
        <button type="button" className={'chip' + (lang === 'CYR' ? ' on' : '')} style={{ flex: '0 0 auto' }} onClick={() => sw('CYR')}>
          Кирилл
        </button>
      </div>
      <h1>{t('app')}</h1>
      <p className="mut" style={{ marginTop: 0 }}>{t('login_sub')}</p>
      <form className="card" onSubmit={submit}>
        <b>{t('login_title')}</b>
        <label className="f">
          <span>{t('username')}</span>
          <input type="text" name="username" autoComplete="username" autoCapitalize="none" value={u} onChange={(e) => setU(e.target.value)} required />
        </label>
        <label className="f">
          <span>{t('password')}</span>
          <input type="password" name="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required />
        </label>
        {err && <div className="card er" role="alert">{err}</div>}
        <button className="btn w" disabled={busy}>{busy ? t('loading') : t('login_btn')}</button>
      </form>
    </div>
  );
}
