export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message || code);
  }
}
export const forbidden = (m = 'forbidden') => new HttpError(403, m);
export const notFound = (m = 'not_found') => new HttpError(404, m);
export const bad = (m = 'bad_request', extra?: Record<string, unknown>) => new HttpError(400, m, m, extra);
