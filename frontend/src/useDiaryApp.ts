import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createEntry,
  deleteEntry as deleteEntryRequest,
  listEntries,
  listTrash,
  permanentlyDeleteEntry,
  restoreEntry,
  setAuthTokenProvider,
  updateEntry
} from './api';
import { importDiaryKey } from './crypto';
import { todayDateString, todayWeekday } from './date';
import { apiEntryToEntry, entryToApiRequest, type DraftEntry, type Entry, type Mood } from './diaryData';
import { initialEntries } from './sampleData';
import { clearSession, loadSession, type StoredSession } from './session';

export type AppMode = 'auth' | 'preview' | 'real';
export type LoadState = 'idle' | 'loading' | 'failed';
export type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'default';
};

type SessionState = { session: StoredSession; key: CryptoKey | unknown };

export function useDiaryApp(initialPreview = false) {
  const [mode, setMode] = useState<AppMode>(initialPreview ? 'preview' : 'auth');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [entries, setEntries] = useState<Entry[]>(initialPreview ? initialEntries : []);
  const [filter, setFilter] = useState<'all' | 'favorite'>('all');
  const [activeEntry, setActiveEntry] = useState<DraftEntry | null>(null);
  const [draftText, setDraftText] = useState('');
  const [showMoodDialog, setShowMoodDialog] = useState(false);
  const [saveState, setSaveState] = useState('已保存');
  const [saveAfterMood, setSaveAfterMood] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashEntries, setTrashEntries] = useState<Entry[]>([]);
  const [trashState, setTrashState] = useState<LoadState>('idle');
  const [notice, setNotice] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const autoSaveTimer = useRef<number | undefined>(undefined);
  const longPressTimer = useRef<number | undefined>(undefined);
  const suppressTimelineClick = useRef(false);
  const confirmAction = useRef<(() => void | Promise<void>) | null>(null);

  const visibleEntries = useMemo(() => {
    const filtered = filter === 'favorite' ? entries.filter((entry) => entry.favorite) : entries;
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, filter]);

  useEffect(() => {
    setAuthTokenProvider(() => sessionState?.session.token ?? null);
  }, [sessionState]);

  useEffect(() => {
    if (initialPreview) return;
    const stored = loadSession();
    if (!stored) return;

    importDiaryKey(stored.rawKey)
      .then((key) => {
        setAuthTokenProvider(() => stored.token);
        setSessionState({ session: stored, key });
        setMode('real');
        return loadRealEntries(key);
      })
      .catch(() => {
        clearSession();
        setMode('auth');
      });
  }, [initialPreview]);

  useEffect(() => {
    return () => {
      clearAutoSave();
      clearLongPress();
    };
  }, []);

  function showNotice(message: string) {
    setNotice(message);
  }

  function dismissNotice() {
    setNotice('');
  }

  async function loadRealEntries(key: CryptoKey | unknown) {
    setLoadState('loading');
    try {
      const apiEntries = await listEntries();
      const decoded = await Promise.all(apiEntries.map((entry) => apiEntryToEntry(key, entry)));
      setEntries(decoded);
      setLoadState('idle');
    } catch (error) {
      if (error instanceof Error && ['missing_token', 'invalid_token', 'invalid_user'].includes(error.message)) {
        logout();
        return;
      }
      setLoadState('failed');
      showNotice('加载失败，请稍后重试');
    }
  }

  function enterPreview() {
    clearAutoSave();
    setAuthMode('login');
    setAuthEmail('');
    setEntries(initialEntries);
    setMode('preview');
    setLoadState('idle');
  }

  function enterRealDiary(session: StoredSession, key: CryptoKey | unknown) {
    setAuthTokenProvider(() => session.token);
    setAuthMode('login');
    setAuthEmail('');
    setSessionState({ session, key });
    setMode('real');
    void loadRealEntries(key);
  }

  function openEntry(entry: Entry) {
    clearAutoSave();
    setActiveEntry(entry);
    setDraftText(entry.text);
    setSaveState(entry.savedAt);
    setShowMoodDialog(false);
    setSaveAfterMood(false);
  }

  function closeEditor() {
    clearAutoSave();
    setActiveEntry(null);
    setShowMoodDialog(false);
    setSaveAfterMood(false);
  }

  function openToday() {
    clearAutoSave();
    const today = todayDateString();
    const existing = entries.find((entry) => entry.date === today);
    if (existing) {
      openEntry(existing);
      return;
    }
    const next: DraftEntry = {
      id: today,
      date: today,
      weekday: todayWeekday(today),
      favorite: false,
      text: '',
      images: [],
      savedAt: '未保存'
    };
    setActiveEntry(next);
    setDraftText('');
    setSaveState('未保存');
  }

  function updateDraft(value: string) {
    setDraftText(value);
    setSaveState('保存中');
    clearAutoSave();
    const target = activeEntry;
    autoSaveTimer.current = window.setTimeout(() => {
      if (!target?.mood) {
        setSaveState('未保存');
        return;
      }
      void persistDraft(target, value);
    }, 800);
  }

  function saveDraft(entryOverride?: DraftEntry) {
    const target = entryOverride ?? activeEntry;
    if (!target) return;
    if (!target.mood) {
      setSaveAfterMood(true);
      setShowMoodDialog(true);
      return;
    }

    void persistDraft(target, draftText);
    setSaveAfterMood(false);
  }

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
      const message = error instanceof Error && error.message === 'version_conflict' ? '版本冲突，请返回后重新打开这篇日记' : '保存失败，草稿已保留';
      setSaveState(error instanceof Error && error.message === 'version_conflict' ? '版本冲突' : '保存失败');
      showNotice(message);
    }
  }

  function clearAutoSave() {
    if (autoSaveTimer.current) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = undefined;
    }
  }

  function selectMood(mood: Mood) {
    if (!activeEntry) return;
    const next = { ...activeEntry, mood };
    setActiveEntry(next);
    setShowMoodDialog(false);
    if (saveAfterMood) {
      saveDraft(next);
    }
  }

  function toggleFavorite() {
    if (!activeEntry) return;
    const next = { ...activeEntry, favorite: !activeEntry.favorite };
    setActiveEntry(next);
    setEntries((current) => current.map((entry) => (entry.id === next.id ? { ...entry, favorite: next.favorite } : entry)));
    if (next.mood) {
      void persistDraft(next, draftText);
    }
  }

  function requestDeleteTimelineEntry(entry: Entry) {
    askForConfirmation(
      {
        title: '删除日记',
        message: `确定删除 ${formatDate(entry.date)} 的日记吗？删除后可在回收站恢复。`,
        confirmLabel: '删除',
        tone: 'danger'
      },
      async () => {
        try {
          if (mode === 'real' && entry.apiId) {
            await deleteEntryRequest(entry.apiId);
          }
          setEntries((current) => current.filter((item) => item.id !== entry.id));
          if (activeEntry?.id === entry.id) {
            setActiveEntry(null);
          }
        } catch {
          showNotice('删除失败，请稍后重试');
        }
      }
    );
  }

  function startTimelineLongPress(entry: Entry) {
    clearLongPress();
    suppressTimelineClick.current = false;
    longPressTimer.current = window.setTimeout(() => {
      suppressTimelineClick.current = true;
      requestDeleteTimelineEntry(entry);
    }, 650);
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  }

  function openTimelineEntry(entry: Entry) {
    clearLongPress();
    if (suppressTimelineClick.current) {
      suppressTimelineClick.current = false;
      return;
    }
    openEntry(entry);
  }

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
      showNotice('回收站加载失败');
    }
  }

  async function restoreTrashEntry(entry: Entry) {
    if (!sessionState || !entry.apiId) return;
    try {
      const restored = await restoreEntry(entry.apiId);
      const decoded = await apiEntryToEntry(sessionState.key, restored);
      setTrashEntries((current) => current.filter((item) => item.id !== entry.id));
      setEntries((current) => upsertEntry(current, decoded));
      showNotice('日记已恢复');
    } catch {
      showNotice('恢复失败，请稍后重试');
    }
  }

  function requestPermanentDeleteTrashEntry(entry: Entry) {
    if (!entry.apiId) return;
    askForConfirmation(
      {
        title: '永久删除',
        message: '永久删除后无法恢复，确定删除这篇日记吗？',
        confirmLabel: '永久删除',
        tone: 'danger'
      },
      async () => {
        if (!entry.apiId) return;
        try {
          await permanentlyDeleteEntry(entry.apiId);
          setTrashEntries((current) => current.filter((item) => item.id !== entry.id));
          showNotice('日记已永久删除');
        } catch {
          showNotice('永久删除失败，请稍后重试');
        }
      }
    );
  }

  function askForConfirmation(dialog: ConfirmDialogState, action: () => void | Promise<void>) {
    confirmAction.current = action;
    setConfirmDialog(dialog);
  }

  async function confirmCurrentDialog() {
    const action = confirmAction.current;
    confirmAction.current = null;
    setConfirmDialog(null);
    await action?.();
  }

  function cancelCurrentDialog() {
    confirmAction.current = null;
    setConfirmDialog(null);
  }

  function closeTrash() {
    setTrashOpen(false);
  }

  function toggleSettings() {
    setShowSettings((value) => !value);
  }

  function logout() {
    resetToAuth('login', '');
  }

  function changePassword() {
    if (!sessionState) return;
    resetToAuth('forgot', sessionState.session.email);
  }

  function resetToAuth(nextAuthMode: 'login' | 'register' | 'forgot', nextEmail: string) {
    clearAutoSave();
    clearSession();
    setAuthTokenProvider(() => null);
    setSessionState(null);
    setEntries([]);
    setActiveEntry(null);
    setShowSettings(false);
    setTrashOpen(false);
    setTrashEntries([]);
    setLoadState('idle');
    setAuthMode(nextAuthMode);
    setAuthEmail(nextEmail);
    setMode('auth');
  }

  return {
    mode,
    sessionState,
    entries,
    visibleEntries,
    filter,
    setFilter,
    activeEntry,
    draftText,
    showMoodDialog,
    setShowMoodDialog,
    saveState,
    loadState,
    showSettings,
    trashOpen,
    trashEntries,
    trashState,
    notice,
    confirmDialog,
    enterPreview,
    enterRealDiary,
    closeEditor,
    openToday,
    updateDraft,
    saveDraft,
    selectMood,
    toggleFavorite,
    startTimelineLongPress,
    clearLongPress,
    openTimelineEntry,
    requestDeleteTimelineEntry,
    openTrash,
    closeTrash,
    restoreTrashEntry,
    requestPermanentDeleteTrashEntry,
    logout,
    toggleSettings,
    dismissNotice,
    confirmCurrentDialog,
    cancelCurrentDialog,
    authMode,
    authEmail,
    changePassword
  };
}

function upsertEntry(current: Entry[], saved: Entry) {
  const exists = current.some((entry) => entry.id === saved.id);
  return exists ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...current];
}

export function formatDate(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${month}月${day}日`;
}

export function formatCompactDate(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${month}.${day}`;
}
