# Real Data Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the diary frontend to the existing backend APIs with browser-side encryption and a 7-day same-browser session.

**Architecture:** Add focused frontend modules for session persistence, API types, diary encryption mapping, and date helpers, then wire `App.tsx` to use them while preserving preview mode. The backend API shape stays unchanged unless tests reveal a route bug.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Web Crypto AES-GCM/PBKDF2, Go/Gin/GORM backend.

---

## File Structure

- Modify: `frontend/src/crypto.ts`
  - Add export/import helpers for AES-GCM keys stored as base64 raw key material.
- Create: `frontend/src/session.ts`
  - Own all 7-day browser-local session persistence and validation.
- Modify: `frontend/src/api.ts`
  - Add typed API models and authenticated request helpers.
- Create: `frontend/src/diaryData.ts`
  - Own conversion between backend encrypted entries and UI diary entries.
- Create: `frontend/src/date.ts`
  - Own actual system-date formatting for new entries.
- Modify: `frontend/src/App.tsx`
  - Replace authenticated fake-data flow with real API loading/saving/trash flow while keeping preview mode.
- Modify: `frontend/src/styles.css`
  - Add small styles for loading, error, account menu, and trash view.
- Modify: `frontend/src/App.test.tsx`
  - Update existing tests and add coverage for 7-day sessions, expired sessions, logout, and trash.
- Modify: `.gitignore`
  - Ignore `.superpowers/` generated brainstorming files.

The project is not currently a Git repository. Commit steps are included for future use after Git is initialized; skip them in the current directory.

---

## Task 1: Crypto Key Export And Import

**Files:**
- Modify: `frontend/src/crypto.ts`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write the failing crypto/session mock surface test**

Update the crypto mock in `frontend/src/App.test.tsx` so future tests can assert that session key material is exported and imported:

```ts
vi.mock('./crypto', () => ({
  deriveDiaryKey: vi.fn(async () => 'test-key'),
  exportDiaryKey: vi.fn(async () => 'raw-test-key'),
  importDiaryKey: vi.fn(async () => 'test-key'),
  encryptJSON: vi.fn(async (_key: unknown, value: unknown) => ({
    encryptedPayload: JSON.stringify(value),
    nonce: 'test-nonce'
  })),
  decryptJSON: vi.fn(async (_key: unknown, payload: { encryptedPayload: string }) => JSON.parse(payload.encryptedPayload))
}));
```

- [ ] **Step 2: Run the frontend tests and verify the mock type fails**

Run:

```bash
cd frontend
npm test -- --runInBand
```

Expected: tests fail because `exportDiaryKey` and `importDiaryKey` are not exported by `frontend/src/crypto.ts` once the implementation imports them.

- [ ] **Step 3: Implement key export/import helpers**

Add these exports to `frontend/src/crypto.ts`:

```ts
export async function exportDiaryKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importDiaryKey(rawKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(rawKey), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
```

Change `deriveDiaryKey` so derived keys are extractable:

```ts
return crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt: encoder.encode(salt),
    iterations: 210000,
    hash: 'SHA-256'
  },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt']
);
```

- [ ] **Step 4: Run focused frontend tests**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: tests compile, even if later real-data tests still fail before app wiring is complete.

- [ ] **Step 5: Commit when Git exists**

Run after Git is initialized:

```bash
git add frontend/src/crypto.ts frontend/src/App.test.tsx
git commit -m "feat: export diary encryption keys"
```

---

## Task 2: Browser-Local Session Module

**Files:**
- Create: `frontend/src/session.ts`
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add tests for persisted and expired 7-day sessions**

Add these tests to `frontend/src/App.test.tsx`:

```ts
it('restores a valid 7-day local session and loads diary entries without login', async () => {
  localStorage.setItem('diary.session', JSON.stringify({
    token: 'token-123',
    email: 'me@example.com',
    kdfSalt: 'salt',
    rawKey: 'raw-test-key',
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  }));
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], error: null })
  } as Response);

  render(<App />);

  expect(await screen.findByRole('heading', { name: '我的日记' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '进入我的日记' })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/entries', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer token-123' })
  }));
});

it('clears an expired local session and returns to login', () => {
  localStorage.setItem('diary.session', JSON.stringify({
    token: 'token-123',
    email: 'me@example.com',
    kdfSalt: 'salt',
    rawKey: 'raw-test-key',
    expiresAt: Date.now() - 1
  }));

  render(<App />);

  expect(screen.getByRole('heading', { name: '进入我的日记' })).toBeInTheDocument();
  expect(localStorage.getItem('diary.session')).toBeNull();
});
```

- [ ] **Step 2: Run tests and verify session behavior fails**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: the new tests fail because no `diary.session` loader exists.

- [ ] **Step 3: Implement `frontend/src/session.ts`**

Create `frontend/src/session.ts`:

```ts
const SESSION_KEY = 'diary.session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type StoredSession = {
  token: string;
  email: string;
  kdfSalt: string;
  rawKey: string;
  expiresAt: number;
};

export function createStoredSession(input: Omit<StoredSession, 'expiresAt'>, now = Date.now()): StoredSession {
  return { ...input, expiresAt: now + SESSION_TTL_MS };
}

export function saveSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('diary.token', session.token);
  localStorage.setItem('diary.kdfSalt', session.kdfSalt);
}

export function loadSession(now = Date.now()): StoredSession | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as StoredSession;
    if (!session.token || !session.email || !session.kdfSalt || !session.rawKey || session.expiresAt <= now) {
      clearSession();
      return null;
    }
    localStorage.setItem('diary.token', session.token);
    localStorage.setItem('diary.kdfSalt', session.kdfSalt);
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('diary.token');
  localStorage.removeItem('diary.kdfSalt');
}
```

- [ ] **Step 4: Wire session loading enough for tests**

In `frontend/src/App.tsx`, replace the initial auth boolean with a mode that reads `loadSession()` on startup. Import:

```ts
import { clearSession, createStoredSession, loadSession, saveSession, type StoredSession } from './session';
import { deriveDiaryKey, exportDiaryKey, importDiaryKey } from './crypto';
```

Use a state shape:

```ts
type AppMode = 'auth' | 'preview' | 'real';
type SessionState = { session: StoredSession; key: CryptoKey | unknown };
```

On login/register success, derive the key, export it, and save:

```ts
const key = await deriveDiaryKey(password, auth.user.kdfSalt);
const rawKey = await exportDiaryKey(key as CryptoKey);
const session = createStoredSession({ token, email: auth.user.email, kdfSalt: auth.user.kdfSalt, rawKey });
saveSession(session);
onAuthenticated(session, key);
```

On app startup, load and import:

```ts
useEffect(() => {
  const stored = loadSession();
  if (!stored || initialPreview) return;
  importDiaryKey(stored.rawKey)
    .then((key) => {
      setSessionState({ session: stored, key });
      setMode('real');
    })
    .catch(() => {
      clearSession();
      setMode('auth');
    });
}, [initialPreview]);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: valid-session and expired-session tests pass once data loading is implemented in Task 4.

- [ ] **Step 6: Commit when Git exists**

```bash
git add frontend/src/session.ts frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: persist seven day diary sessions"
```

---

## Task 3: Typed API And Diary Mapping

**Files:**
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/diaryData.ts`
- Create: `frontend/src/date.ts`
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add tests for API payload mapping**

Keep the existing `loads encrypted diary entries from the API after login` and `encrypts and saves a new diary entry through the API after login` tests. Add one assertion to the save test:

```ts
expect(JSON.parse(body.encryptedPayload)).toEqual(expect.objectContaining({
  mood: '平静',
  favorite: false,
  text: '今天接入真实后端',
  images: []
}));
```

- [ ] **Step 2: Run focused tests and verify mapping fails**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: tests fail because the app still uses local in-memory entries for authenticated mode.

- [ ] **Step 3: Add typed API helpers**

Replace `frontend/src/api.ts` with:

```ts
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
  deletedAt?: string;
};

export type EntryRequest = {
  entryDate: string;
  encryptedPayload: string;
  nonce: string;
  version?: number;
};

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
```

- [ ] **Step 4: Add diary mapping module**

Create `frontend/src/diaryData.ts`:

```ts
import type { ApiEntry, EntryRequest } from './api';
import { decryptJSON, encryptJSON, type EncryptedPayload } from './crypto';

export type Mood = '开心' | '平静' | '疲惫' | '焦虑' | '难过' | '愤怒' | '思考' | '愉快' | '感恩';

export type DiaryPayload = {
  mood: Mood;
  favorite: boolean;
  text: string;
  images: string[];
  savedAt?: string;
};

export type Entry = {
  id: string;
  apiId?: number;
  version?: number;
  date: string;
  weekday: string;
  mood: Mood;
  favorite: boolean;
  text: string;
  images: string[];
  savedAt: string;
};

export type DraftEntry = Omit<Entry, 'mood'> & { mood?: Mood };

export const moods: Mood[] = ['开心', '平静', '疲惫', '焦虑', '难过', '愤怒', '思考', '愉快', '感恩'];

export async function apiEntryToEntry(key: CryptoKey | unknown, apiEntry: ApiEntry): Promise<Entry> {
  const payload = await decryptJSON<DiaryPayload>(key as CryptoKey, {
    encryptedPayload: apiEntry.encryptedPayload,
    nonce: apiEntry.nonce
  });
  return {
    id: String(apiEntry.id),
    apiId: apiEntry.id,
    version: apiEntry.version,
    date: apiEntry.entryDate,
    weekday: formatWeekday(apiEntry.entryDate),
    mood: payload.mood,
    favorite: payload.favorite,
    text: payload.text,
    images: payload.images,
    savedAt: payload.savedAt ?? '已保存'
  };
}

export async function entryToApiRequest(key: CryptoKey | unknown, entry: DraftEntry, text: string): Promise<EntryRequest> {
  if (!entry.mood) throw new Error('missing_mood');
  const encrypted: EncryptedPayload = await encryptJSON(key as CryptoKey, {
    mood: entry.mood,
    favorite: entry.favorite,
    text,
    images: entry.images,
    savedAt: '已保存'
  } satisfies DiaryPayload);
  return {
    entryDate: entry.date,
    encryptedPayload: encrypted.encryptedPayload,
    nonce: encrypted.nonce,
    ...(entry.version ? { version: entry.version } : {})
  };
}

export function formatWeekday(date: string) {
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${date}T00:00:00`));
}
```

- [ ] **Step 5: Add date helper**

Create `frontend/src/date.ts`:

```ts
import { formatWeekday } from './diaryData';

export function todayDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayWeekday(dateString = todayDateString()) {
  return formatWeekday(dateString);
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: mapping module compiles; app tests still fail until Task 4 wires app state.

- [ ] **Step 7: Commit when Git exists**

```bash
git add frontend/src/api.ts frontend/src/diaryData.ts frontend/src/date.ts frontend/src/App.test.tsx
git commit -m "feat: add diary api mapping"
```

---

## Task 4: Wire Real Entry Load, Save, Delete, And Logout

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add behavior tests for logout and delete**

Add these tests to `frontend/src/App.test.tsx`:

```ts
it('logs out and clears the persisted session', async () => {
  const user = userEvent.setup();
  localStorage.setItem('diary.session', JSON.stringify({
    token: 'token-123',
    email: 'me@example.com',
    kdfSalt: 'salt',
    rawKey: 'raw-test-key',
    expiresAt: Date.now() + 100000
  }));
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: [], error: null })
  } as Response);

  render(<App />);

  await screen.findByRole('heading', { name: '我的日记' });
  await user.click(screen.getByRole('button', { name: '设置' }));
  await user.click(screen.getByRole('button', { name: '退出登录' }));

  expect(localStorage.getItem('diary.session')).toBeNull();
  expect(screen.getByRole('heading', { name: '进入我的日记' })).toBeInTheDocument();
});

it('soft deletes a real entry and removes it from the timeline', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input.toString();
    if (path === '/api/auth/login') {
      return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', kdfSalt: 'salt' } }, error: null }) } as Response;
    }
    if (path === '/api/entries' && !init?.method) {
      return { ok: true, json: async () => ({ data: [{ id: 42, entryDate: '2026-04-26', encryptedPayload: JSON.stringify({ mood: '感恩', favorite: false, text: '可删除日记', images: [] }), nonce: 'test-nonce', version: 1 }], error: null }) } as Response;
    }
    if (path === '/api/entries/42' && init?.method === 'DELETE') {
      return { ok: true, json: async () => ({ data: { id: 42, entryDate: '2026-04-26', encryptedPayload: '{}', nonce: 'n', version: 1 }, error: null }) } as Response;
    }
    throw new Error(`unexpected fetch ${path}`);
  });

  render(<App />);
  await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
  await user.type(screen.getByLabelText('密码'), 'secret123');
  await user.click(screen.getByRole('button', { name: '进入日记' }));
  await user.click(await screen.findByRole('button', { name: /打开 4月26日/ }));
  await user.click(screen.getByRole('button', { name: '删除' }));

  expect(fetchMock).toHaveBeenCalledWith('/api/entries/42', expect.objectContaining({ method: 'DELETE' }));
  expect(screen.queryByText('4月26日')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify real behavior fails**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: tests fail because settings logout and real delete are not implemented.

- [ ] **Step 3: Wire app mode and load state**

In `frontend/src/App.tsx`, import modules from Tasks 2 and 3:

```ts
import {
  authRequest,
  createEntry,
  deleteEntry as deleteEntryRequest,
  listEntries,
  updateEntry
} from './api';
import { todayDateString, todayWeekday } from './date';
import { apiEntryToEntry, entryToApiRequest, moods, type DraftEntry, type Entry } from './diaryData';
import { clearSession, createStoredSession, loadSession, saveSession, type StoredSession } from './session';
import { deriveDiaryKey, exportDiaryKey, importDiaryKey } from './crypto';
```

Use these states near the top of `App`:

```ts
const [mode, setMode] = useState<AppMode>(initialPreview ? 'preview' : 'auth');
const [sessionState, setSessionState] = useState<SessionState | null>(null);
const [entries, setEntries] = useState<Entry[]>(initialPreview ? initialEntries : []);
const [loadState, setLoadState] = useState<'idle' | 'loading' | 'failed'>('idle');
const [showSettings, setShowSettings] = useState(false);
```

Add this loader:

```ts
async function loadRealEntries(key: CryptoKey | unknown) {
  setLoadState('loading');
  try {
    const apiEntries = await listEntries();
    const decoded = await Promise.all(apiEntries.map((entry) => apiEntryToEntry(key, entry)));
    setEntries(decoded);
    setLoadState('idle');
  } catch (error) {
    if (error instanceof Error && ['missing_token', 'invalid_token', 'invalid_user'].includes(error.message)) {
      clearSession();
      setSessionState(null);
      setMode('auth');
      return;
    }
    setLoadState('failed');
  }
}
```

Add startup restore:

```ts
useEffect(() => {
  if (initialPreview) return;
  const stored = loadSession();
  if (!stored) return;
  importDiaryKey(stored.rawKey)
    .then((key) => {
      setSessionState({ session: stored, key });
      setMode('real');
      return loadRealEntries(key);
    })
    .catch(() => {
      clearSession();
      setMode('auth');
    });
}, [initialPreview]);
```

- [ ] **Step 4: Wire authenticated login/register callback**

Change `AuthView` props to:

```ts
function AuthView({
  onAuthenticated,
  onPreview
}: {
  onAuthenticated: (session: StoredSession, key: CryptoKey | unknown) => void;
  onPreview: () => void;
}) {
```

In `submit`, use shared `authRequest`, derive/export key, save session, and call `onAuthenticated`:

```ts
const auth = mode === 'register' ? await authRequest('/api/auth/register', email, password) : await authRequest('/api/auth/login', email, password);
const token = auth.token ?? (await authRequest('/api/auth/login', email, password)).token;
if (!token) throw new Error('missing_token');
const key = await deriveDiaryKey(password, auth.user.kdfSalt);
const rawKey = await exportDiaryKey(key as CryptoKey);
const session = createStoredSession({ token, email: auth.user.email, kdfSalt: auth.user.kdfSalt, rawKey });
saveSession(session);
onAuthenticated(session, key);
```

In the auth render branch:

```tsx
return (
  <AuthView
    onAuthenticated={(session, key) => {
      setSessionState({ session, key });
      setMode('real');
      void loadRealEntries(key);
    }}
    onPreview={() => {
      setEntries(initialEntries);
      setMode('preview');
    }}
  />
);
```

- [ ] **Step 5: Wire save and delete**

Update `persistDraft` to branch by mode:

```ts
async function persistDraft(target: DraftEntry, text: string) {
  if (!target.mood) return;
  if (mode === 'preview' || !sessionState) {
    const saved: Entry = { ...target, mood: target.mood, text, savedAt: '已保存' };
    setEntries((current) => upsertEntry(current, saved));
    setActiveEntry(saved);
    setSaveState('已保存');
    return;
  }
  try {
    const request = await entryToApiRequest(sessionState.key, target, text);
    const apiEntry = target.apiId ? await updateEntry(target.apiId, request) : await createEntry(request);
    const saved = await apiEntryToEntry(sessionState.key, apiEntry);
    setEntries((current) => upsertEntry(current, saved));
    setActiveEntry(saved);
    setSaveState('已保存');
  } catch (error) {
    setSaveState(error instanceof Error && error.message === 'version_conflict' ? '版本冲突' : '保存失败');
  }
}
```

Add helper:

```ts
function upsertEntry(current: Entry[], saved: Entry) {
  const exists = current.some((entry) => entry.id === saved.id);
  return exists ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...current];
}
```

Add a delete action in editor topbar or bottom actions:

```tsx
<button className="danger-text-button" type="button" onClick={deleteActiveEntry}>
  删除
</button>
```

Implement:

```ts
async function deleteActiveEntry() {
  if (!activeEntry) return;
  if (mode === 'real' && activeEntry.apiId) {
    await deleteEntryRequest(activeEntry.apiId);
  }
  setEntries((current) => current.filter((entry) => entry.id !== activeEntry.id));
  setActiveEntry(null);
}
```

- [ ] **Step 6: Wire real date**

Replace hard-coded today in `openToday`:

```ts
const today = todayDateString();
```

Use `todayWeekday(today)` for new draft weekday:

```ts
weekday: todayWeekday(today),
```

- [ ] **Step 7: Wire settings menu and logout**

Add settings menu under the settings button:

```tsx
<button className="icon-button settings-button" aria-label="设置" onClick={() => setShowSettings((value) => !value)}>
  <Settings size={18} />
</button>
{showSettings && (
  <div className="settings-menu">
    {sessionState && <p>{sessionState.session.email}</p>}
    {mode === 'real' && <button type="button" onClick={() => setTrashOpen(true)}>回收站</button>}
    {mode === 'real' && <button type="button" onClick={logout}>退出登录</button>}
  </div>
)}
```

Implement logout:

```ts
function logout() {
  clearSession();
  setSessionState(null);
  setEntries([]);
  setActiveEntry(null);
  setShowSettings(false);
  setMode('auth');
}
```

- [ ] **Step 8: Add CSS for state/menu/delete**

Add to `frontend/src/styles.css`:

```css
.status-message {
  margin: 80px auto 0;
  width: fit-content;
  color: #8d8478;
}

.settings-menu {
  position: absolute;
  top: 88px;
  right: clamp(24px, 5vw, 68px);
  min-width: 180px;
  border: 1px solid rgba(101, 88, 68, 0.14);
  border-radius: 8px;
  background: #fffaf1;
  box-shadow: 0 14px 34px rgba(77, 59, 35, 0.12);
  padding: 10px;
  z-index: 5;
}

.settings-menu p {
  margin: 4px 8px 10px;
  color: #746b5e;
  font-size: 13px;
}

.settings-menu button,
.danger-text-button {
  width: 100%;
  min-height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5f5447;
  text-align: left;
  padding: 0 8px;
}

.settings-menu button:hover,
.danger-text-button:hover {
  background: rgba(101, 88, 68, 0.08);
}

.danger-text-button {
  width: auto;
  color: #a24732;
}
```

- [ ] **Step 9: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: login, load, save, logout, preview, editor, and delete tests pass.

- [ ] **Step 10: Commit when Git exists**

```bash
git add frontend/src/App.tsx frontend/src/styles.css frontend/src/App.test.tsx
git commit -m "feat: connect diary ui to backend entries"
```

---

## Task 5: Trash View, Restore, And Permanent Delete

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add trash behavior tests**

Add this test to `frontend/src/App.test.tsx`:

```ts
it('opens trash, restores entries, and confirms permanent delete', async () => {
  const user = userEvent.setup();
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = input.toString();
    if (path === '/api/auth/login') {
      return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', kdfSalt: 'salt' } }, error: null }) } as Response;
    }
    if (path === '/api/entries' && !init?.method) {
      return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
    }
    if (path === '/api/trash' && !init?.method) {
      return { ok: true, json: async () => ({ data: [{ id: 50, entryDate: '2026-04-20', encryptedPayload: JSON.stringify({ mood: '思考', favorite: false, text: '回收站日记', images: [] }), nonce: 'test-nonce', version: 2, deletedAt: '2026-04-21T00:00:00Z' }], error: null }) } as Response;
    }
    if (path === '/api/entries/50/restore' && init?.method === 'POST') {
      return { ok: true, json: async () => ({ data: { id: 50, entryDate: '2026-04-20', encryptedPayload: JSON.stringify({ mood: '思考', favorite: false, text: '回收站日记', images: [] }), nonce: 'test-nonce', version: 2 }, error: null }) } as Response;
    }
    if (path === '/api/trash/50' && init?.method === 'DELETE') {
      return { ok: true, json: async () => ({ data: { id: 50 }, error: null }) } as Response;
    }
    throw new Error(`unexpected fetch ${path}`);
  });

  render(<App />);
  await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
  await user.type(screen.getByLabelText('密码'), 'secret123');
  await user.click(screen.getByRole('button', { name: '进入日记' }));
  await screen.findByText('还没有日记');
  await user.click(screen.getByRole('button', { name: '设置' }));
  await user.click(screen.getByRole('button', { name: '回收站' }));

  expect(await screen.findByText('4月20日')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '恢复' }));
  expect(fetchMock).toHaveBeenCalledWith('/api/entries/50/restore', expect.objectContaining({ method: 'POST' }));

  await user.click(screen.getByRole('button', { name: '设置' }));
  await user.click(screen.getByRole('button', { name: '回收站' }));
  await screen.findByText('4月20日');
  await user.click(screen.getByRole('button', { name: '永久删除' }));

  expect(confirmSpy).toHaveBeenCalledWith('永久删除后无法恢复，确定删除这篇日记吗？');
  expect(fetchMock).toHaveBeenCalledWith('/api/trash/50', expect.objectContaining({ method: 'DELETE' }));
});
```

- [ ] **Step 2: Run tests and verify trash behavior fails**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: trash test fails because trash UI is not implemented.

- [ ] **Step 3: Add trash state and loader**

In `frontend/src/App.tsx`, import:

```ts
import { listTrash, permanentlyDeleteEntry, restoreEntry } from './api';
```

Add state:

```ts
const [trashOpen, setTrashOpen] = useState(false);
const [trashEntries, setTrashEntries] = useState<Entry[]>([]);
const [trashState, setTrashState] = useState<'idle' | 'loading' | 'failed'>('idle');
```

Add loader:

```ts
async function openTrash() {
  if (!sessionState) return;
  setShowSettings(false);
  setTrashOpen(true);
  setTrashState('loading');
  try {
    const apiEntries = await listTrash();
    const decoded = await Promise.all(apiEntries.map((entry) => apiEntryToEntry(sessionState.key, entry)));
    setTrashEntries(decoded);
    setTrashState('idle');
  } catch {
    setTrashState('failed');
  }
}
```

- [ ] **Step 4: Add restore and permanent delete handlers**

Add:

```ts
async function restoreTrashEntry(entry: Entry) {
  if (!sessionState || !entry.apiId) return;
  const restored = await restoreEntry(entry.apiId);
  const decoded = await apiEntryToEntry(sessionState.key, restored);
  setTrashEntries((current) => current.filter((item) => item.id !== entry.id));
  setEntries((current) => upsertEntry(current, decoded));
}

async function permanentlyDeleteTrashEntry(entry: Entry) {
  if (!entry.apiId) return;
  if (!window.confirm('永久删除后无法恢复，确定删除这篇日记吗？')) return;
  await permanentlyDeleteEntry(entry.apiId);
  setTrashEntries((current) => current.filter((item) => item.id !== entry.id));
}
```

- [ ] **Step 5: Render trash view**

Before the home timeline return branch, add:

```tsx
if (trashOpen) {
  return (
    <main className="app-shell">
      <header className="home-topbar">
        <h1>回收站</h1>
        <button className="icon-button bare-icon" aria-label="返回" onClick={() => setTrashOpen(false)}>
          <ArrowLeft size={18} />
        </button>
      </header>
      {trashState === 'loading' && <div className="status-message">加载中</div>}
      {trashState === 'failed' && <div className="status-message">加载失败</div>}
      {trashState === 'idle' && trashEntries.length === 0 && <div className="status-message">回收站为空</div>}
      {trashState === 'idle' && trashEntries.length > 0 && (
        <section className="trash-list" aria-label="回收站列表">
          {trashEntries.map((entry) => (
            <article key={entry.id} className="trash-row">
              <div>
                <strong>{formatDate(entry.date)}</strong>
                <span>{entry.mood}</span>
              </div>
              <div className="trash-actions">
                <button type="button" onClick={() => restoreTrashEntry(entry)}>恢复</button>
                <button type="button" onClick={() => permanentlyDeleteTrashEntry(entry)}>永久删除</button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
```

Change the settings menu trash button to `onClick={openTrash}`.

- [ ] **Step 6: Add trash CSS**

Add to `frontend/src/styles.css`:

```css
.trash-list {
  max-width: 720px;
  margin: 48px auto 0;
  display: grid;
  gap: 12px;
}

.trash-row {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  border-bottom: 1px solid rgba(101, 88, 68, 0.1);
  padding: 14px 0;
}

.trash-row strong {
  display: block;
  color: #3f3a32;
  font-weight: 560;
}

.trash-row span {
  display: block;
  margin-top: 4px;
  color: #8d8478;
  font-size: 13px;
}

.trash-actions {
  display: flex;
  gap: 8px;
}

.trash-actions button {
  min-height: 34px;
  border: 1px solid rgba(101, 88, 68, 0.14);
  border-radius: 999px;
  background: rgba(255, 253, 247, 0.8);
  color: #5f5447;
  padding: 0 12px;
}
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: trash tests pass with existing real-data tests.

- [ ] **Step 8: Commit when Git exists**

```bash
git add frontend/src/App.tsx frontend/src/styles.css frontend/src/App.test.tsx
git commit -m "feat: add diary trash workflow"
```

---

## Task 6: Error States, Preview Isolation, And Full Verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `.gitignore`
- Verify: `backend/internal/app/router_test.go`

- [ ] **Step 1: Add error and preview isolation tests**

Add these tests to `frontend/src/App.test.tsx`:

```ts
it('keeps local preview isolated from backend APIs', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  render(<App />);

  await user.click(screen.getByRole('button', { name: '本地预览' }));

  expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('shows a load failure without leaving the authenticated shell', async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const path = input.toString();
    if (path === '/api/auth/login') {
      return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', kdfSalt: 'salt' } }, error: null }) } as Response;
    }
    if (path === '/api/entries') {
      return { ok: false, json: async () => ({ data: null, error: { code: 'server_error' } }) } as Response;
    }
    throw new Error(`unexpected fetch ${path}`);
  });

  render(<App />);
  await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
  await user.type(screen.getByLabelText('密码'), 'secret123');
  await user.click(screen.getByRole('button', { name: '进入日记' }));

  expect(await screen.findByText('加载失败')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify failures**

Run:

```bash
cd frontend
npm test -- src/App.test.tsx
```

Expected: any remaining failure points identify missing load-state or preview isolation behavior.

- [ ] **Step 3: Render load and empty states**

In the home timeline section of `frontend/src/App.tsx`, render:

```tsx
{loadState === 'loading' && <div className="status-message">加载中</div>}
{loadState === 'failed' && <div className="status-message">加载失败</div>}
{loadState === 'idle' && visibleEntries.length === 0 ? (
  <div className="empty-timeline">{filter === 'favorite' ? '还没有收藏的日记' : '还没有日记'}</div>
) : (
  loadState === 'idle' && visibleEntries.map(...)
)}
```

- [ ] **Step 4: Ignore generated Superpowers files**

Add this line to `.gitignore`:

```gitignore
.superpowers/
```

- [ ] **Step 5: Run all frontend tests**

Run:

```bash
cd frontend
npm test
```

Expected: all frontend tests pass.

- [ ] **Step 6: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: TypeScript build and Vite production build pass.

- [ ] **Step 7: Run backend tests**

Run:

```bash
cd backend
go test ./...
```

Expected: backend tests pass without route regressions.

- [ ] **Step 8: Commit when Git exists**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx .gitignore
git commit -m "test: cover real diary session states"
```

---

## Self-Review

- Spec coverage: The plan covers 7-day same-browser sessions, browser-side encryption, API-backed create/read/update/delete, preview isolation, trash restore/permanent delete, logout clearing session state, load/save errors, expired sessions, and verification commands.
- Placeholder scan: Each task includes concrete file paths, test code, implementation snippets, and verification commands.
- Type consistency: `StoredSession`, `ApiEntry`, `DiaryPayload`, `Entry`, `DraftEntry`, `Mood`, `entryToApiRequest`, `apiEntryToEntry`, `todayDateString`, and `todayWeekday` are defined before later tasks use them.
- Scope check: This is one cohesive real-data loop plan. Attachment upload, cross-device sessions, and server-side plaintext access remain out of scope.
