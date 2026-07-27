import { useRef } from "react";
import type { Locale } from "@cfbridge/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const pending = useRef<Locale | null>(null);

  function change(next: Locale) {
    if (next === locale || pending.current === next) return;
    pending.current = next;
    setLocale(next);
    void api
      .updateLocale(next)
      .catch(() => {
        /* keep optimistic UI; localStorage already updated via setLocale */
      })
      .finally(() => {
        if (pending.current === next) pending.current = null;
      });
  }

  return (
    <div
      className="inline-flex h-7 items-center rounded-md border border-border p-0.5"
      aria-label={t("common.language")}
    >
      <Button
        type="button"
        variant={locale === "en" ? "secondary" : "ghost"}
        size="xs"
        className={cn(
          "min-w-8 px-2 active:scale-100",
          locale === "en" && "pointer-events-none",
        )}
        aria-pressed={locale === "en"}
        onClick={() => change("en")}
      >
        EN
      </Button>
      <Button
        type="button"
        variant={locale === "zh-CN" ? "secondary" : "ghost"}
        size="xs"
        className={cn(
          "min-w-8 px-2 active:scale-100",
          locale === "zh-CN" && "pointer-events-none",
        )}
        aria-pressed={locale === "zh-CN"}
        onClick={() => change("zh-CN")}
      >
        中文
      </Button>
    </div>
  );
}
