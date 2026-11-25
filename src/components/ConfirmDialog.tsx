import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isLoading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h3
            id="confirm-dialog-title"
            className="font-display text-lg font-semibold tracking-tight text-zinc-950"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E11D48]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-2.5 text-sm leading-relaxed text-zinc-600">{description}</p>

        {checkboxLabel && onCheckboxChange && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={checkboxChecked}
              onChange={(e) => onCheckboxChange(e.target.checked)}
              disabled={isLoading}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-[#E11D48]"
            />
            <span>{checkboxLabel}</span>
          </label>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 whitespace-nowrap disabled:opacity-50 ${
              destructive
                ? 'bg-[#E11D48] hover:bg-[#BE123C] focus-visible:outline-[#E11D48]'
                : 'bg-zinc-950 hover:bg-zinc-800 focus-visible:outline-zinc-900'
            }`}
          >
            {isLoading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
