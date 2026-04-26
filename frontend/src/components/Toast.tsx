type ToastProps = {
  message: string;
  onDismiss: () => void;
};

export function Toast({ message, onDismiss }: ToastProps) {
  if (!message) return null;

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button type="button" aria-label="关闭提示" onClick={onDismiss}>
        关闭
      </button>
    </div>
  );
}
