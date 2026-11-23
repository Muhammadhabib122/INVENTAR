'use client';
export class ApiError extends Error {
  constructor(public status: number, public code: string, public data: Record<string, unknown> = {}) {
    super(code);
  }
}

export async function apiFetch<T = any>(url: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
      headers: opts.form ? undefined : opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network');
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) location.href = '/login';
    throw new ApiError(res.status, data.error || 'server_error', data);
  }
  return data as T;
}

export const fmtNum = (n: number | null | undefined) => Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/,/g, '.');
export const fmtTime = (d: string | number | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function download(name: string, blob: Blob) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(u);
  }, 1500);
}
