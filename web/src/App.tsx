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

function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, authed } = useAuth();
  const { t } = useI18n();
  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
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
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [localeReady, setLocaleReady] = useState(false);

  const loadSetup = useCallback(async () => {
    try {
      const status = await api.setupStatus();
      setSetup(status);
      setSetupError(null);
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
      setSetupError(
        e instanceof Error ? e.message : tRef.current("app.setupStatusFailed"),
      );
    } finally {
      setLocaleReady(true);
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

  if (!setup || !localeReady) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        {t("app.checkingSetup")}
      </div>
    );
  }

  if (!setup.ready) {
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
