import { useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "../i18n";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
  onCheckboxChange?: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
};

export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = true,
  busy = false,
  checkboxLabel,
  checkboxChecked = false,
  onCheckboxChange,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT();
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId}>{title}</h3>
        <p>{body}</p>
        {checkboxLabel && (
          <label className="label label-inline">
            <input
              type="checkbox"
              checked={checkboxChecked}
              disabled={busy}
              onChange={(e) => onCheckboxChange?.(e.target.checked)}
            />
            {checkboxLabel}
          </label>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "btn btn-danger" : "btn btn-primary"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t("common.processing") : (confirmLabel ?? t("common.confirm"))}
          </button>
        </div>
      </div>
    </div>
  );
}
