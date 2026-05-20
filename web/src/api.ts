function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '');

  // In produzione su Vercel l'API deve essere same-origin: /api.
  // Se per errore è stata impostata VITE_API_URL=http://localhost:4000/api,
  // il browser prova a chiamare il computer dell'utente e ottiene "Request failed".
  if (import.meta.env.PROD) {
    if (!configured || configured.includes('localhost') || configured.includes('127.0.0.1')) return '/api';
    return configured;
  }

  return configured || 'http://localhost:4000/api';
}

const API = resolveApiBase();
let cachedToken = localStorage.getItem('fairsplit:token') ?? '';

export function setAuthToken(token: string) {
  cachedToken = token;
  localStorage.setItem('fairsplit:token', token);
}

export function clearAuthToken() {
  cachedToken = '';
  localStorage.removeItem('fairsplit:token');
}

export function hasAuthToken() {
  return Boolean(cachedToken);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const url = `${API}${path}`;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(cachedToken ? { authorization: `Bearer ${cachedToken}` } : {}),
        ...(init?.headers ?? {})
      }
    });
  } catch (error) {
    console.error('[api] Network/API offline', { path, url, API, error });
    throw new Error('Impossibile raggiungere l’API. Controlla il deploy Vercel e /api/health.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let payload: any = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    const message = payload.error || payload.message || (text.startsWith('<') ? 'API_RETURNED_HTML_INSTEAD_OF_JSON' : '') || res.statusText || 'REQUEST_FAILED';
    console.error('[api] Request failed', { path, url, status: res.status, message, text: text.slice(0, 500) });
    throw new Error(`${message}__HTTP_${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export async function downloadCsv() {
  const res = await fetch(`${API}/export/expenses.csv`, {
    headers: cachedToken ? { authorization: `Bearer ${cachedToken}` } : {}
  });
  if (!res.ok) throw new Error('EXPORT_FAILED');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fairsplit-expenses.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const fmt = (amount: number, currency = 'EUR') => new Intl.NumberFormat('it-IT', { style: 'currency', currency }).format(amount);
