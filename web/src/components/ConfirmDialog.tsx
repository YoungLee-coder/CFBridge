import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import { useEffect, useId, useRef, type ReactNode } from "react";

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
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <AlertDialogContent aria-labelledby={titleId}>
        <AlertDialogHeader>
          <AlertDialogTitle id={titleId}>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        {checkboxLabel && (
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox
              checked={checkboxChecked}
              disabled={busy}
              onCheckedChange={(v) => onCheckboxChange?.(v === true)}
            />
            {checkboxLabel}
          </Label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={onCancel}>
            {t("common.cancel")}
          </AlertDialogCancel>
          <Button
            ref={confirmRef}
            type="button"
            variant={danger ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? t("common.processing") : (confirmLabel ?? t("common.confirm"))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
