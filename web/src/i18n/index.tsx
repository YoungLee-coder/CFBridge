import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  type Locale,
} from "@cfbridge/shared";
import { en } from "./en";
import { zhCN } from "./zh-CN";
import {
  getMessage,
  readStoredLocale,
  writeStoredLocale,
  type MessagePath,
  type Messages,
} from "./types";

const catalogs: Record<Locale, Messages> = {
  en,
  "zh-CN": zhCN,
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (path: MessagePath, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLang(locale: Locale) {
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale | null;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? readStoredLocale() ?? DEFAULT_LOCALE,
  );

  useEffect(() => {
    if (initialLocale) {
      setLocaleState(initialLocale);
      writeStoredLocale(initialLocale);
    }
  }, [initialLocale]);

  useEffect(() => {
    applyDocumentLang(locale);
    writeStoredLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (path: MessagePath, vars?: Record<string, string | number>) =>
      getMessage(catalogs[locale], path, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
