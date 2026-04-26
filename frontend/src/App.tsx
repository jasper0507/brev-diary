import { AuthView } from './components/AuthView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorView } from './components/EditorView';
import { TimelineView } from './components/TimelineView';
import { Toast } from './components/Toast';
import { TrashView } from './components/TrashView';
import { useDiaryApp } from './useDiaryApp';

type AppProps = {
  initialPreview?: boolean;
};

export default function App({ initialPreview = false }: AppProps) {
  const diary = useDiaryApp(initialPreview);

  if (diary.mode === 'auth') {
    return (
      <>
        <AuthView onAuthenticated={diary.enterRealDiary} onPreview={diary.enterPreview} />
        <Toast message={diary.notice} onDismiss={diary.dismissNotice} />
      </>
    );
  }

  if (diary.trashOpen) {
    return (
      <>
        <TrashView
          entries={diary.trashEntries}
          state={diary.trashState}
          onBack={diary.closeTrash}
          onRestore={diary.restoreTrashEntry}
          onPermanentDelete={diary.requestPermanentDeleteTrashEntry}
        />
        <ConfirmDialog dialog={diary.confirmDialog} onCancel={diary.cancelCurrentDialog} onConfirm={diary.confirmCurrentDialog} />
        <Toast message={diary.notice} onDismiss={diary.dismissNotice} />
      </>
    );
  }

  if (diary.activeEntry) {
    return (
      <>
        <EditorView
          activeEntry={diary.activeEntry}
          draftText={diary.draftText}
          saveState={diary.saveState}
          showMoodDialog={diary.showMoodDialog}
          onBack={diary.closeEditor}
          onDraftChange={diary.updateDraft}
          onSave={() => diary.saveDraft()}
          onSelectMood={diary.selectMood}
          onToggleFavorite={diary.toggleFavorite}
          onOpenMoodDialog={() => diary.setShowMoodDialog(true)}
        />
        <Toast message={diary.notice} onDismiss={diary.dismissNotice} />
      </>
    );
  }

  return (
    <>
      <TimelineView
        mode={diary.mode}
        session={diary.sessionState?.session}
        visibleEntries={diary.visibleEntries}
        filter={diary.filter}
        loadState={diary.loadState}
        showSettings={diary.showSettings}
        onFilterChange={diary.setFilter}
        onToggleSettings={diary.toggleSettings}
        onOpenTrash={diary.openTrash}
        onLogout={diary.logout}
        onOpenToday={diary.openToday}
        onOpenEntry={diary.openTimelineEntry}
        onLongPressStart={diary.startTimelineLongPress}
        onLongPressEnd={diary.clearLongPress}
        onRequestDelete={diary.requestDeleteTimelineEntry}
      />
      <ConfirmDialog dialog={diary.confirmDialog} onCancel={diary.cancelCurrentDialog} onConfirm={diary.confirmCurrentDialog} />
      <Toast message={diary.notice} onDismiss={diary.dismissNotice} />
    </>
  );
}
