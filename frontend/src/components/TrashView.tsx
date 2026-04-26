import { ArrowLeft } from 'lucide-react';
import type { LoadState } from '../useDiaryApp';
import { formatDate } from '../useDiaryApp';
import type { Entry } from '../diaryData';

type TrashViewProps = {
  entries: Entry[];
  state: LoadState;
  onBack: () => void;
  onRestore: (entry: Entry) => void;
  onPermanentDelete: (entry: Entry) => void;
};

export function TrashView({ entries, state, onBack, onRestore, onPermanentDelete }: TrashViewProps) {
  return (
    <main className="app-shell">
      <header className="home-topbar">
        <button className="icon-button bare-icon" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <h1>回收站</h1>
      </header>
      {state === 'loading' && <div className="status-message">加载中</div>}
      {state === 'failed' && <div className="status-message">加载失败，请稍后重试</div>}
      {state === 'idle' && entries.length === 0 && <div className="status-message">回收站为空，删除的日记会暂存在这里</div>}
      {state === 'idle' && entries.length > 0 && (
        <section className="trash-list" aria-label="回收站列表">
          {entries.map((entry) => (
            <article key={entry.id} className="trash-row">
              <div>
                <strong>{formatDate(entry.date)}</strong>
                <span>{entry.mood}</span>
              </div>
              <div className="trash-actions">
                <button type="button" onClick={() => onRestore(entry)}>
                  恢复
                </button>
                <button type="button" onClick={() => onPermanentDelete(entry)}>
                  永久删除
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
