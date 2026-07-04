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
  return raw ? JSON.parse(raw) : null;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...options, headers });
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
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function photoUrl(orderId: string, photoId: string) {
  return `${API}/orders/${orderId}/photos/${photoId}/file?token=${getToken()}`;
}
