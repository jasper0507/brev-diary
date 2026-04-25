import { ArrowLeft, ImagePlus, Plus, Settings, Star } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type Mood = '开心' | '平静' | '疲惫' | '焦虑' | '难过' | '愤怒' | '思考' | '愉快' | '感恩';

type Entry = {
  id: string;
  date: string;
  weekday: string;
  mood: Mood;
  favorite: boolean;
  text: string;
  images: string[];
  savedAt: string;
};

type DraftEntry = Omit<Entry, 'mood'> & { mood?: Mood };

const moods: Mood[] = ['开心', '平静', '疲惫', '焦虑', '难过', '愤怒', '思考', '愉快', '感恩'];

const initialEntries: Entry[] = [
  {
    id: '2026-05-20',
    date: '2026-05-20',
    weekday: '周二',
    mood: '平静',
    favorite: true,
    text: '整理房间的一天。翻到很多以前的笔记和信件，有些回忆突然很清晰。',
    images: ['misty-mountains', 'window-light'],
    savedAt: '已保存'
  },
  {
    id: '2026-05-19',
    date: '2026-05-19',
    weekday: '周一',
    mood: '思考',
    favorite: false,
    text: '窗外一直在下雨，点了热拿铁，想清楚了几件拖了很久的事。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-18',
    date: '2026-05-18',
    weekday: '周日',
    mood: '愉快',
    favorite: false,
    text: '很久没有和老朋友见面了，聊了很多过去的事。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-17',
    date: '2026-05-17',
    weekday: '周六',
    mood: '平静',
    favorite: false,
    text: '傍晚散步回来，身体很累，但心里慢慢安静下来。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-16',
    date: '2026-05-16',
    weekday: '周五',
    mood: '感恩',
    favorite: true,
    text: '有人很认真地听我说完一整段话。',
    images: [],
    savedAt: '已保存'
  },
  {
    id: '2026-05-15',
    date: '2026-05-15',
    weekday: '周四',
    mood: '思考',
    favorite: false,
    text: '今天想先把事情写下来，再决定它们应该放在哪里。',
    images: [],
    savedAt: '已保存'
  }
];

type AppProps = {
  initialPreview?: boolean;
};

export default function App({ initialPreview = false }: AppProps) {
  const [authenticated, setAuthenticated] = useState(initialPreview || Boolean(localStorage.getItem('diary.token')));
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [filter, setFilter] = useState<'all' | 'favorite'>('all');
  const [activeEntry, setActiveEntry] = useState<DraftEntry | null>(null);
  const [draftText, setDraftText] = useState('');
  const [showMoodDialog, setShowMoodDialog] = useState(false);
  const [saveState, setSaveState] = useState('已保存');
  const [saveAfterMood, setSaveAfterMood] = useState(false);
  const autoSaveTimer = useRef<number | undefined>(undefined);

  const visibleEntries = useMemo(() => {
    const filtered = filter === 'favorite' ? entries.filter((entry) => entry.favorite) : entries;
    return [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, filter]);

  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        window.clearTimeout(autoSaveTimer.current);
      }
    };
  }, []);

  function openEntry(entry: Entry) {
    clearAutoSave();
    setActiveEntry(entry);
    setDraftText(entry.text);
    setSaveState(entry.savedAt);
    setShowMoodDialog(false);
    setSaveAfterMood(false);
  }

  function openToday() {
    clearAutoSave();
    const today = '2026-05-21';
    const existing = entries.find((entry) => entry.date === today);
    if (existing) {
      openEntry(existing);
      return;
    }
    const next: DraftEntry = {
      id: today,
      date: today,
      weekday: '周三',
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
      persistDraft(target, value);
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

    persistDraft(target, draftText);
    setSaveAfterMood(false);
  }

  function persistDraft(target: DraftEntry, text: string) {
    if (!target.mood) return;
    const saved: Entry = { ...target, mood: target.mood, text, savedAt: '已保存' };
    setEntries((current) => {
      const exists = current.some((entry) => entry.id === saved.id);
      return exists ? current.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...current];
    });
    setActiveEntry(saved);
    setSaveState('已保存');
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
  }

  if (!authenticated) {
    return <AuthView onAuthenticated={() => setAuthenticated(true)} onPreview={() => setAuthenticated(true)} />;
  }

  if (activeEntry) {
    return (
      <main className="app-shell editor-shell">
        <header className="editor-topbar" aria-label="编辑页顶部">
          <div className="editor-topbar-left">
            <button className="icon-button bare-icon" aria-label="返回" onClick={() => setActiveEntry(null)}>
              <ArrowLeft size={18} />
            </button>
            <span className="editor-date">{formatCompactDate(activeEntry.date)}</span>
          </div>
          <div className="editor-topbar-right">
            <span className="save-state">{saveState}</span>
            <button className="mood-chip mood-chip-top mood-button" type="button" onClick={() => setShowMoodDialog(true)}>
              <span className="mood-dot" />
              {activeEntry.mood ?? '选择心情'}
            </button>
            <button
              className={`icon-button bare-icon star-button ${activeEntry.favorite ? 'is-favorite' : ''}`}
              aria-label={activeEntry.favorite ? '取消收藏' : '收藏'}
              onClick={toggleFavorite}
            >
              <Star size={19} fill={activeEntry.favorite ? 'currentColor' : 'none'} />
            </button>
          </div>
        </header>

        <section className="writing-surface" aria-label="无边界纸面编辑区">
          <div className="paper-flow">
            <textarea
              className="paper-textarea"
              aria-label="日记正文"
              value={draftText}
              onChange={(event) => updateDraft(event.target.value)}
              placeholder="写下今天发生的事..."
            />
          </div>
          {activeEntry.images.map((image, index) => (
            <div
              key={image}
              className={`paper-image-block ${index % 2 === 0 ? 'landscape-mist' : 'window-shadow'}`}
              role="img"
              aria-label={`日记图片 ${index + 1}`}
            />
          ))}
          <div className="image-block-row">
            <button className="image-block-button add-image-block" type="button">
              <ImagePlus size={20} />
              <span>添加图片</span>
            </button>
          </div>
          <div className="editor-bottom-actions">
            <button className="save-button" type="button" onClick={() => saveDraft()}>
              保存
            </button>
          </div>
        </section>

        {showMoodDialog && (
          <div className="dialog-backdrop">
            <section role="dialog" aria-label="选择心情" className="mood-dialog">
              <h2>保存前选择今天的心情</h2>
              <div className="mood-grid">
                {moods.map((mood) => (
                  <button key={mood} className="mood-choice" onClick={() => selectMood(mood)}>
                    {mood}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="home-topbar">
        <h1>我的日记</h1>
        <div className="topbar-actions">
          <div className="segmented" aria-label="日记筛选">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              全部
            </button>
            <button className={filter === 'favorite' ? 'active' : ''} onClick={() => setFilter('favorite')}>
              收藏
            </button>
          </div>
          <button className="icon-button settings-button" aria-label="设置">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <section className="timeline-wrap" aria-label="日记时间线">
        <div className="timeline-line" />
        {visibleEntries.length === 0 ? (
          <div className="empty-timeline">还没有收藏的日记</div>
        ) : (
          visibleEntries.map((entry, index) => (
            <button
              key={entry.id}
              className={`timeline-row ${index % 2 === 0 ? 'date-left' : 'mood-left'}`}
              aria-label={`打开 ${formatDate(entry.date)}`}
              onClick={() => openEntry(entry)}
            >
              <span className="timeline-dot" />
              <span className="date-group">
                <span className="date-text">{formatDate(entry.date)}</span>
                <span className="weekday-text">{entry.weekday}</span>
              </span>
              <span className="mood-chip">
                <span className="mood-dot" />
                {entry.mood}
                {entry.favorite && <Star className="inline-star" size={13} fill="currentColor" aria-hidden="true" />}
              </span>
            </button>
          ))
        )}
      </section>

      <button className="fab" aria-label="写今日日记" onClick={openToday}>
        <Plus size={30} />
      </button>
    </main>
  );
}

function AuthView({ onAuthenticated, onPreview }: { onAuthenticated: () => void; onPreview: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const auth = mode === 'register' ? await authRequest('/api/auth/register', email, password) : await authRequest('/api/auth/login', email, password);
      const token = auth.token ?? (await authRequest('/api/auth/login', email, password)).token;
      if (!token) {
        throw new Error('missing_token');
      }
      localStorage.setItem('diary.token', token);
      if (auth.user?.kdfSalt) {
        localStorage.setItem('diary.kdfSalt', auth.user.kdfSalt);
      }
      onAuthenticated();
    } catch {
      setError('账号或密码有误');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="登录注册">
        <p className="auth-kicker">PRIVATE DIARY</p>
        <h1>进入我的日记</h1>
        <div className="auth-tabs" aria-label="认证方式">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>
            登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => setMode('register')}>
            注册
          </button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            密码
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>
            {mode === 'login' ? '进入日记' : '创建账号'}
          </button>
        </form>
        <button className="preview-button" type="button" onClick={onPreview}>
          本地预览
        </button>
      </section>
    </main>
  );
}

async function authRequest(path: string, email: string, password: string): Promise<{ token?: string; user?: { email: string; kdfSalt: string } }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const envelope = await response.json();
  if (!response.ok || envelope.error) {
    throw new Error(envelope.error?.code ?? 'auth_failed');
  }
  return envelope.data;
}

function formatDate(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${month}月${day}日`;
}

function formatCompactDate(date: string) {
  const [, month, day] = date.split('-').map(Number);
  return `${month}.${day}`;
}
