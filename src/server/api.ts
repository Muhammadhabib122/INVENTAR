import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { HttpError } from './errors';

type Handler<C> = (req: Request, ctx: C) => Promise<unknown>;

/** API route o'rami: xatolarni JSON ko'rinishida qaytaradi */
export function api<C = { params: Promise<Record<string, string>> }>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const r = await fn(req, ctx);
      if (r instanceof Response) return r;
      return NextResponse.json(r ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.code, ...e.extra }, { status: e.status });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025')
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      console.error(e);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export function clientIp(req: Request) {
  const h = req.headers;
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'local').trim();
}

export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
