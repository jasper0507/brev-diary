import type { ConfirmDialogState } from '../useDiaryApp';

type ConfirmDialogProps = {
  dialog: ConfirmDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ dialog, onCancel, onConfirm }: ConfirmDialogProps) {
  if (!dialog) return null;

  return (
    <div className="dialog-backdrop">
      <section role="dialog" aria-label={dialog.title} className="confirm-dialog">
        <h2>{dialog.title}</h2>
        <p>{dialog.message}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button className={dialog.tone === 'danger' ? 'danger-confirm' : ''} type="button" onClick={onConfirm}>
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
