const API = '/api/v1';

export function getToken() {
  return localStorage.getItem('token');
}

export function setAuth(token: string, user: unknown) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    clearAuth();
    return null;
  }
}

function authHeaders(options: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...options, headers: authHeaders(options) });
  if (res.status === 401) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (res.status === 403) {
    const err = await res.json().catch(() => ({ error: 'صلاحيات غير كافية' }));
    throw new Error(err.error || 'صلاحيات غير كافية');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const res = await request(path, options);
  return res.blob();
}

export async function downloadBlob(path: string, filename: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function photoUrl(orderId: string, photoId: string) {
  return `${API}/orders/${orderId}/photos/${photoId}/file`;
}
