import { useEffect, useRef } from 'react';
import { btnPrimaryCls, btnSecondaryCls } from './styles';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  destructive,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="إغلاق"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl space-y-4">
        <div>
          <h3 id="confirm-dialog-title" className="text-sm font-semibold text-zinc-100">
            {title}
          </h3>
          <p className="mt-2 text-sm text-zinc-400">{message}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} className={btnSecondaryCls}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              destructive
                ? 'px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500'
                : btnPrimaryCls
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
