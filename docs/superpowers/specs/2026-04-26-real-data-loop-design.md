# Real Data Loop Design

## Context

The project is a private diary MVP with a React frontend and Go backend. The backend already supports authentication, encrypted diary entry CRUD, soft delete, trash listing, restore, and permanent delete. The frontend currently has a polished local preview experience, login/register UI, an unused API helper, and browser-side crypto helpers, but the main diary flow still uses in-memory sample data.

This phase turns the app into a real logged-in diary experience while preserving the local preview mode.

## Goals

- After login or registration, users can read, create, edit, favorite, delete, restore, and permanently delete real diary entries through the backend API.
- Diary content remains encrypted in the browser before it is sent to the backend.
- A user stays signed in for 7 days on the same browser and same device.
- Local preview remains available and does not call backend APIs.
- The implementation follows the existing frontend layout and backend API shape.

## Non-Goals

- Cross-device session sync.
- Server-side access to plaintext diary data.
- Rich attachment upload to object storage.
- Automatic merge for concurrent edits.
- Full settings screen beyond account display, logout, and trash access.

## Session Model

The frontend stores a 7-day browser-local session after successful login or registration:

```ts
type StoredSession = {
  token: string;
  email: string;
  rawKey: string;
  expiresAt: number;
};
```

`token` authenticates API requests. `rawKey` is the browser-local AES key material exported from the `diaryKey` returned by login or registration, so entries can still be decrypted after refreshes. `expiresAt` limits the session to 7 days. On app startup, the frontend loads this session only if it exists and has not expired. Expired or invalid sessions are cleared and the user returns to login.

This design prioritizes user experience: anyone with access to the same browser profile during the 7-day window can open the diary. Logout clears `token`, `rawKey`, and expiry data immediately.

The backend auth responses expose `diaryKey` rather than the legacy `kdfSalt` terminology, so the design stays aligned with the current API shape.

## Encryption Model

The backend continues to store only encrypted payloads:

```ts
type ApiEntry = {
  id: number;
  entryDate: string;
  encryptedPayload: string;
  nonce: string;
  version: number;
};
```

The frontend encrypts and decrypts this UI payload:

```ts
type DiaryPayload = {
  mood: Mood;
  favorite: boolean;
  text: string;
  images: string[];
  savedAt?: string;
};
```

The plaintext payload is never sent to the backend. Dates, encrypted payloads, nonces, and versions are the only values persisted server-side for entries.

## Frontend Data Flow

On authenticated startup, the app requests `/api/entries`, decrypts every entry using the local session key, and maps each API record into the current UI entry model. Decryption failures are treated as session/key mismatch and prompt the user to log in again.

When saving:

- If an entry has no backend ID, the frontend encrypts `DiaryPayload` and calls `POST /api/entries`.
- If an entry has a backend ID, the frontend encrypts `DiaryPayload` and calls `PUT /api/entries/:id` with the current `version`.
- The server response becomes the source of truth for `id`, `entryDate`, and `version`.
- Draft text is not discarded on save failure.

Favorites, mood changes, and text changes update the same encrypted payload. The existing "choose mood before save" behavior remains.

## UI Behavior

The login/register screen remains the initial unauthenticated route. Successful login or registration establishes the 7-day session and opens the real diary. The local preview button continues to enter sample-data mode without backend API calls.

The home screen shows a loading state while entries load. It keeps the existing "all/favorite" filter, computed from decrypted payloads. The settings button opens a simple account menu with the current email, a trash entry point, and logout.

The editor uses the real system date for "today" instead of the current hard-coded date. Auto-save remains enabled. If save fails, the UI shows a failure state and keeps the current draft.

The trash view calls `/api/trash`, decrypts deleted entries, and supports restore and permanent delete. Permanent delete requires an in-app confirmation before calling the API.

## Error Handling

- `401`, missing token, expired local session, or invalid local session clears stored session and returns to login.
- Version conflicts show a clear message that the entry was updated elsewhere and should be reopened.
- Decryption failures show a re-login prompt and do not log plaintext or ciphertext.
- Network or server errors show a save/load failure state without overwriting local draft content.

## Testing

Frontend tests should cover session persistence, login/register session creation, loading real entries, save create/update branching, mood-required save behavior, preview mode isolation, and expired-session handling.

Backend tests already cover core auth and entry ownership. Add or adjust backend tests only if route behavior changes during implementation.

## Implementation Notes

The current `frontend/src/crypto.ts` supports deriving keys and encrypting/decrypting JSON. It needs helpers to export/import the session key for local storage. The current `frontend/src/api.ts` should become the common authenticated request layer. The current `frontend/src/App.tsx` can be split if needed, but the first implementation should avoid broad refactors unrelated to the data loop.

The repository directory is not currently a Git repository, so this spec cannot be committed unless Git is initialized or the project is moved into a repository.
