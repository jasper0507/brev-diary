export type ApiEnvelope<T> = { data: T; error: null } | { data: null; error: { code: string } };

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('diary.token');
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
