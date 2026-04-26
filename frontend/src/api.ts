export type ApiEnvelope<T> = { data: T; error: null } | { data: null; error: { code: string } };

export type ApiUser = {
  id?: number;
  email: string;
  kdfSalt: string;
};

export type AuthResponse = {
  token?: string;
  user: ApiUser;
};

export type ApiEntry = {
  id: number;
  entryDate: string;
  encryptedPayload: string;
  nonce: string;
  version: number;
  deletedAt?: string | null;
};

export type EntryRequest = {
  entryDate: string;
  encryptedPayload: string;
  nonce: string;
  version?: number;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
let authTokenProvider = () => localStorage.getItem('diary.token');

export function setAuthTokenProvider(provider: () => string | null) {
  authTokenProvider = provider;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authTokenProvider();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || envelope.error) {
    throw new Error(envelope.error?.code ?? 'request_failed');
  }
  return envelope.data;
}

export function authRequest(path: string, email: string, password: string) {
  return apiRequest<AuthResponse>(path, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function listEntries() {
  return apiRequest<ApiEntry[]>('/api/entries');
}

export function createEntry(body: EntryRequest) {
  return apiRequest<ApiEntry>('/api/entries', { method: 'POST', body: JSON.stringify(body) });
}

export function updateEntry(id: number, body: EntryRequest) {
  return apiRequest<ApiEntry>(`/api/entries/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteEntry(id: number) {
  return apiRequest<ApiEntry>(`/api/entries/${id}`, { method: 'DELETE' });
}

export function listTrash() {
  return apiRequest<ApiEntry[]>('/api/trash');
}

export function restoreEntry(id: number) {
  return apiRequest<ApiEntry>(`/api/entries/${id}/restore`, { method: 'POST' });
}

export function permanentlyDeleteEntry(id: number) {
  return apiRequest<{ id: number }>(`/api/trash/${id}`, { method: 'DELETE' });
}
