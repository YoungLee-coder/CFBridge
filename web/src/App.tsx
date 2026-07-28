import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { SetupStatus } from "@cfbridge/shared";
import { api } from "./api";
import { useAuth } from "./auth";
import { DashboardLayout } from "./components/layouts/dashboard-layout";
import {
  ProjectLayout,
  ProjectTabRedirect,
} from "./components/layouts/project-layout";
import { LoginSkeleton } from "./components/login-skeleton";
import { ThemeToggle } from "./components/theme-toggle";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { useI18n } from "./i18n";
import LoginPage from "./pages/LoginPage";
import DocsPage from "./pages/DocsPage";
import ProjectsPage from "./pages/ProjectsPage";
import OverviewPage from "./pages/project/OverviewPage";
import KeysPage from "./pages/project/KeysPage";
import KvPage from "./pages/project/KvPage";
import D1Page from "./pages/project/D1Page";
import SetupPage from "./pages/SetupPage";

const SETUP_READY_KEY = "cfbridge_setup_ready";

/** Optimistic stub so a prior ready instance can render routes before /setup/status returns. */
const READY_STUB: SetupStatus = {
  ready: true,
  meta_bound: true,
  meta_reachable: true,
  data_kv_bound: true,
  schema_version: 0,
  latest_version: 0,
  pending_migrations: [],
  needs_migration: false,
  worker_name: "",
  has_account_credentials: false,
  bind_snippet: null,
  created_database_id: null,
  data_kv_bind_snippet: null,
  created_namespace_id: null,
};

function readCachedSetupReady(): boolean {
  try {
    return localStorage.getItem(SETUP_READY_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCachedSetupReady(ready: boolean) {
  try {
    if (ready) localStorage.setItem(SETUP_READY_KEY, "1");
    else localStorage.removeItem(SETUP_READY_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, authed } = useAuth();
  const { t } = useI18n();
  if (!ready) {
    return (
      <div className="animate-skeleton-in flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { t, setLocale } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const settingsHydrated = useRef(false);
  const cachedReadyRef = useRef(readCachedSetupReady());
  const [setup, setSetup] = useState<SetupStatus | null>(() =>
    cachedReadyRef.current ? READY_STUB : null,
  );
  const [setupError, setSetupError] = useState<string | null>(null);
  /** False only on cold start (no ready cache) until the first setupStatus settles. */
  const [bootstrapped, setBootstrapped] = useState(cachedReadyRef.current);

  const loadSetup = useCallback(async () => {
    try {
      const status = await api.setupStatus();
      setSetup(status);
      setSetupError(null);
      writeCachedSetupReady(status.ready);
      cachedReadyRef.current = status.ready;
      if (status.ready && !settingsHydrated.current) {
        settingsHydrated.current = true;
        try {
          const settings = await api.getSettings();
          if (settings.locale) setLocale(settings.locale);
        } catch {
          /* keep local preference */
        }
      }
    } catch (e) {
      // Keep an optimistic ready shell if we already knew this instance was set up.
      if (!cachedReadyRef.current) {
        setSetupError(
          e instanceof Error ? e.message : tRef.current("app.setupStatusFailed"),
        );
      }
    } finally {
      setBootstrapped(true);
    }
  }, [setLocale]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  if (setupError) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-canvas p-6">
        <Card className="w-full max-w-md shadow-none">
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <CardTitle className="text-xl font-medium tracking-tight">
              CF<span className="text-primary">Bridge</span>
            </CardTitle>
            <ThemeToggle />
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{setupError}</AlertDescription>
            </Alert>
            <Button type="button" onClick={() => void loadSetup()}>
              {t("common.retry")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cold start only: no prior ready cache. Prefer login-shaped shell when unauthenticated.
  if (!bootstrapped && !setup?.ready) {
    return <LoginSkeleton label={t("app.checkingSetup")} />;
  }

  if (setup && !setup.ready) {
    return <SetupPage initial={setup} onReady={() => void loadSetup()} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route index element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectLayout />}>
          <Route index element={<ProjectTabRedirect />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="keys" element={<KeysPage />} />
          <Route path="kv" element={<KvPage />} />
          <Route path="d1" element={<D1Page />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
