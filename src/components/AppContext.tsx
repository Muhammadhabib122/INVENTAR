'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { translate, type MsgKey, type LangCode } from '@/lib/i18n';
import { ApiError } from '@/lib/client';

export type Me = { id: string; username: string; fullName: string; role: 'ADMIN' | 'COMMISSION' | 'VIEWER'; lang: LangCode; buildingIds: string[] };

type DialogBtn = { label: string; value: string; kind?: 'd' | 's' | 'ok' | '' };
type DialogReq = { title: string; text?: ReactNode; buttons: DialogBtn[]; resolve: (v: string | null) => void };

type Ctx = {
  me: Me;
  t: (k: MsgKey, v?: Record<string, string | number>) => string;
  setLang: (l: LangCode) => void;
  toast: (m: string) => void;
  /** ilovaning o'z modal oynasi; tanlangan tugma qiymatini qaytaradi (yopilsa null) */
  ask: (title: string, text: ReactNode | undefined, buttons: DialogBtn[]) => Promise<string | null>;
  confirm: (title: string, text?: ReactNode, okLabel?: string, danger?: boolean) => Promise<boolean>;
  errMsg: (e: unknown) => string;
};

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error('AppContext');
  return c;
};

export function AppProvider({ me: me0, children }: { me: Me; children: ReactNode }) {
  const [me, setMe] = useState(me0);
  const [msg, setMsg] = useState('');
  const [dlg, setDlg] = useState<DialogReq | null>(null);
  const th = useRef<ReturnType<typeof setTimeout>>(undefined);

  const t = useCallback((k: MsgKey, v?: Record<string, string | number>) => translate(me.lang, k, v), [me.lang]);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(th.current);
    th.current = setTimeout(() => setMsg(''), 3000);
  }, []);
  const ask = useCallback(
    (title: string, text: ReactNode | undefined, buttons: DialogBtn[]) => new Promise<string | null>((resolve) => setDlg({ title, text, buttons, resolve })),
    [],
  );
  const confirm = useCallback(
    async (title: string, text?: ReactNode, okLabel?: string, danger = true) =>
      (await ask(title, text, [
        { label: okLabel || translate(me.lang, 'confirm'), value: 'ok', kind: danger ? 'd' : '' },
        { label: translate(me.lang, 'cancel'), value: 'cancel', kind: 's' },
      ])) === 'ok',
    [ask, me.lang],
  );
  const errMsg = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError) {
        if (e.code === 'network') return translate(me.lang, 'err_network');
        if (e.status === 403) return translate(me.lang, 'err_forbidden');
        const key = ('e_' + e.code) as MsgKey;
        const s = translate(me.lang, key, e.data as Record<string, string>);
        if (s !== key) return s;
        return translate(me.lang, 'err_generic', { e: e.code });
      }
      return translate(me.lang, 'err_generic', { e: String((e as Error)?.message || e) });
    },
    [me.lang],
  );
  const setLang = useCallback((l: LangCode) => setMe((m) => ({ ...m, lang: l })), []);

  useEffect(() => {
    document.documentElement.lang = me.lang === 'CYR' ? 'uz-Cyrl' : 'uz';
  }, [me.lang]);

  const v = useMemo(() => ({ me, t, setLang, toast, ask, confirm, errMsg }), [me, t, setLang, toast, ask, confirm, errMsg]);
  const close = (val: string | null) => {
    dlg?.resolve(val);
    setDlg(null);
  };
  return (
    <C.Provider value={v}>
      {children}
      {msg && (
        <div className="toast" role="status" onClick={() => setMsg('')}>
          {msg}
        </div>
      )}
      {dlg && (
        <div className="mbg" onClick={(e) => e.target === e.currentTarget && close(null)}>
          <div className="mdl" role="dialog" aria-modal="true">
            <h3>{dlg.title}</h3>
            {dlg.text && <div>{dlg.text}</div>}
            <div className="acts">
              {dlg.buttons.map((b) => (
                <button key={b.value} className={'btn ' + (b.kind || '')} onClick={() => close(b.value)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </C.Provider>
  );
}
