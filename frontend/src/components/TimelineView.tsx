import { Plus, Settings, Star } from 'lucide-react';
import type { AppMode, LoadState } from '../useDiaryApp';
import { formatDate } from '../useDiaryApp';
import type { Entry } from '../diaryData';
import type { StoredSession } from '../session';

type TimelineViewProps = {
  mode: AppMode;
  session?: StoredSession;
  visibleEntries: Entry[];
  filter: 'all' | 'favorite';
  loadState: LoadState;
  showSettings: boolean;
  onFilterChange: (filter: 'all' | 'favorite') => void;
  onToggleSettings: () => void;
  onChangePassword: () => void;
  onOpenTrash: () => void;
  onLogout: () => void;
  onOpenToday: () => void;
  onOpenEntry: (entry: Entry) => void;
  onLongPressStart: (entry: Entry) => void;
  onLongPressEnd: () => void;
  onRequestDelete: (entry: Entry) => void;
};

export function TimelineView({
  mode,
  session,
  visibleEntries,
  filter,
  loadState,
  showSettings,
  onFilterChange,
  onToggleSettings,
  onChangePassword,
  onOpenTrash,
  onLogout,
  onOpenToday,
  onOpenEntry,
  onLongPressStart,
  onLongPressEnd,
  onRequestDelete
}: TimelineViewProps) {
  return (
    <main className="app-shell">
      <header className="home-topbar">
        <h1>我的日记</h1>
        <div className="topbar-actions">
          <div className="segmented" aria-label="日记筛选">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => onFilterChange('all')}>
              全部
            </button>
            <button className={filter === 'favorite' ? 'active' : ''} onClick={() => onFilterChange('favorite')}>
              收藏
            </button>
          </div>
          <button className="icon-button settings-button" aria-label="设置" onClick={onToggleSettings}>
            <Settings size={18} />
          </button>
          {showSettings && (
            <div className="settings-menu">
              {session && <p>{session.email}</p>}
              {mode === 'preview' && <p>本地预览模式</p>}
              {mode === 'preview' && (
                <button type="button" onClick={onLogout}>
                  返回登录
                </button>
              )}
              {mode === 'real' && (
                <button type="button" onClick={onChangePassword}>
                  修改密码
                </button>
              )}
              {mode === 'real' && (
                <button type="button" onClick={onOpenTrash}>
                  回收站
                </button>
              )}
              {mode === 'real' && (
                <button type="button" onClick={onLogout}>
                  退出登录
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="timeline-wrap" aria-label="日记时间线">
        <div className="timeline-line" />
        {loadState === 'loading' && <div className="status-message">加载中</div>}
        {loadState === 'failed' && <div className="status-message">加载失败，请稍后重试</div>}
        {loadState === 'idle' && visibleEntries.length > 0 && <p className="timeline-hint">长按日期可删除</p>}
        {loadState === 'idle' && visibleEntries.length === 0 ? (
          <div className="empty-timeline">{filter === 'favorite' ? '还没有收藏的日记，先去点亮一颗星吧' : '还没有日记，点右下角开始写第一篇'}</div>
        ) : (
          loadState === 'idle' &&
          visibleEntries.map((entry, index) => (
            <button
              key={entry.id}
              className={`timeline-row ${index % 2 === 0 ? 'date-left' : 'mood-left'}`}
              aria-label={`打开 ${formatDate(entry.date)}`}
              onClick={() => onOpenEntry(entry)}
              onContextMenu={(event) => {
                event.preventDefault();
                onRequestDelete(entry);
              }}
              onPointerDown={() => onLongPressStart(entry)}
              onPointerUp={onLongPressEnd}
              onPointerLeave={onLongPressEnd}
              onPointerCancel={onLongPressEnd}
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

      <button className="fab" aria-label="写今日日记" onClick={onOpenToday}>
        <Plus size={30} />
      </button>
    </main>
  );
}
