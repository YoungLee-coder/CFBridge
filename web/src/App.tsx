import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, Route, Routes } from "react-router-dom";
import type { Locale, SetupStatus } from "@cfbridge/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import { useI18n } from "./i18n";
import LoginPage from "./pages/LoginPage";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectPage from "./pages/ProjectPage";
import SetupPage from "./pages/SetupPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, authed } = useAuth();
  const { t } = useI18n();
  if (!ready) return <div className="main muted">{t("common.loading")}</div>;
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function change(next: Locale) {
    if (next === locale || busy) return;
    setBusy(true);
    try {
      await api.updateLocale(next);
      setLocale(next);
    } catch {
      // Still switch UI even if persist fails (e.g. offline).
      setLocale(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lang-switch" aria-label={t("common.language")}>
      <button
        type="button"
        className={locale === "en" ? "active" : ""}
        disabled={busy}
        onClick={() => void change("en")}
      >
        EN
      </button>
      <button
        type="button"
        className={locale === "zh-CN" ? "active" : ""}
        disabled={busy}
        onClick={() => void change("zh-CN")}
      >
        中文
      </button>
    </div>
  );
}

function Shell() {
  const { logout } = useAuth();
  const { t } = useI18n();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand" end>
          CF<span>Bridge</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/" end>
            {t("app.projects")}
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <button type="button" className="btn btn-sm" onClick={() => void logout()}>
            {t("app.logout")}
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  const { t, setLocale } = useI18n();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [localeReady, setLocaleReady] = useState(false);

  const loadSetup = useCallback(async () => {
    try {
      const status = await api.setupStatus();
      setSetup(status);
      setSetupError(null);
      if (status.ready) {
        try {
          const settings = await api.getSettings();
          if (settings.locale) setLocale(settings.locale);
        } catch {
          /* keep local preference */
        }
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Unable to fetch setup status");
    } finally {
      setLocaleReady(true);
    }
  }, [setLocale]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  if (setupError) {
    return (
      <div className="login-page">
        <div className="login-card stack">
          <h1 className="brand-mark">
            CF<span>Bridge</span>
          </h1>
          <div className="alert alert-error">{setupError}</div>
          <button type="button" className="btn" onClick={() => void loadSetup()}>
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!setup || !localeReady) {
    return <div className="login-page muted">{t("app.checkingSetup")}</div>;
  }

  if (!setup.ready) {
    return <SetupPage initial={setup} onReady={() => void loadSetup()} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
