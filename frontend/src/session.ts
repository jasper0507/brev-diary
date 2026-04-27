const SESSION_KEY = 'diary.session';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredSession = {
  token: string;
  email: string;
  rawKey: string;
  expiresAt: number;
};

export function createStoredSession(input: Omit<StoredSession, 'expiresAt'>, now = Date.now()): StoredSession {
  return { ...input, expiresAt: now + SESSION_TTL_MS };
}

export function saveSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('diary.token', session.token);
}

export function loadSession(now = Date.now()): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as StoredSession;
    if (!session.token || !session.email || !session.rawKey || session.expiresAt <= now) {
      clearSession();
      return null;
    }
    localStorage.setItem('diary.token', session.token);
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('diary.token');
}
