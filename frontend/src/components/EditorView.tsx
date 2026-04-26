import { ArrowLeft, ImagePlus, Star } from 'lucide-react';
import { moods, type DraftEntry, type Mood } from '../diaryData';
import { formatCompactDate } from '../useDiaryApp';

type EditorViewProps = {
  activeEntry: DraftEntry;
  draftText: string;
  saveState: string;
  showMoodDialog: boolean;
  onBack: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onSelectMood: (mood: Mood) => void;
  onToggleFavorite: () => void;
  onOpenMoodDialog: () => void;
};

export function EditorView({
  activeEntry,
  draftText,
  saveState,
  showMoodDialog,
  onBack,
  onDraftChange,
  onSave,
  onSelectMood,
  onToggleFavorite,
  onOpenMoodDialog
}: EditorViewProps) {
  return (
    <main className="app-shell editor-shell">
      <header className="editor-topbar" aria-label="编辑页顶部">
        <div className="editor-topbar-left">
          <button className="icon-button bare-icon" aria-label="返回" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <span className="editor-date">{formatCompactDate(activeEntry.date)}</span>
        </div>
        <div className="editor-topbar-right">
          <span className="save-state">{saveState}</span>
          <button className="mood-chip mood-chip-top mood-button" type="button" onClick={onOpenMoodDialog}>
            <span className="mood-dot" />
            {activeEntry.mood ?? '选择心情'}
          </button>
          <button
            className={`icon-button bare-icon star-button ${activeEntry.favorite ? 'is-favorite' : ''}`}
            aria-label={activeEntry.favorite ? '取消收藏' : '收藏'}
            onClick={onToggleFavorite}
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
            onChange={(event) => onDraftChange(event.target.value)}
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
          <button className="image-block-button add-image-block" type="button" aria-disabled="true" title="图片上传将在后续版本提供">
            <ImagePlus size={20} />
            <span>添加图片（后续版本）</span>
          </button>
        </div>
        <div className="editor-bottom-actions">
          <button className="save-button" type="button" onClick={onSave}>
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
                <button key={mood} className="mood-choice" onClick={() => onSelectMood(mood)}>
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
