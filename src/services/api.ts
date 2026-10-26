export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Fired when the server says the session ended or a subscription is required. */
export const AUTH_EVENT = 'omnipulse:auth-event';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.', 'NETWORK');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any));
    const fallback = res.status === 502 || res.status === 504 || res.status === 503
      ? `The server took too long or had a temporary problem (HTTP ${res.status}). Please try again in a moment.`
      : `Request failed (${res.status})`;
    const err = new ApiError(res.status, data.error || fallback, data.code);
    if (res.status === 401 && data.code === 'UNAUTHENTICATED') window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: 'signed-out' }));
    if (res.status === 402) window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: 'subscription-required' }));
    throw err;
  }
  if ((res.headers.get('content-type') || '').includes('application/json')) return res.json();
  return res as unknown as T;
}

export const api = {
  get: <T>(p: string) => request<T>('GET', p),
  post: <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T>(p: string, b: unknown) => request<T>('PUT', p, b),
};
