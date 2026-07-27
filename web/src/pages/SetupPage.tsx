import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2Icon } from "lucide-react";
import type { CreateMetaDbResponse, Locale, SetupStatus } from "@cfbridge/shared";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { readStoredLocale } from "../i18n/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function SetupPage({
  initial,
  onReady,
}: {
  initial: SetupStatus;
  onReady: () => void;
}) {
  const { authed, login } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [status, setStatus] = useState(initial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreateMetaDbResponse | null>(null);
  const [pickedLocale, setPickedLocale] = useState<Locale | null>(
    () => readStoredLocale() ?? locale,
  );

  const refresh = useCallback(
    async (createdId?: string | null) => {
      const next = await api.setupStatus(createdId ?? undefined);
      setStatus(next);
      if (next.ready) onReady();
    },
    [onReady],
  );

  useEffect(() => {
    setStatus(initial);
  }, [initial]);

  function chooseLocale(next: Locale) {
    setPickedLocale(next);
    setLocale(next);
    setError(null);
  }

  async function ensureAuthed(): Promise<boolean> {
    if (authed) return true;
    if (!password.trim()) {
      setError(t("setup.loginRequired"));
      return false;
    }
    try {
      await login(password.trim());
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("setup.loginFailed"));
      return false;
    }
  }

  async function createDb() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      if (!pickedLocale) {
        setError(t("setup.pickLanguageFirst"));
        return;
      }
      if (!(await ensureAuthed())) return;
      const res = await api.createMetaDb();
      setCreated(res);
      setMsg(t("setup.createdMsg"));
      await refresh(res.database_id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("setup.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function migrate() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      if (!pickedLocale) {
        setError(t("setup.pickLanguageFirst"));
        return;
      }
      if (!(await ensureAuthed())) return;
      const res = await api.migrate(pickedLocale);
      if (res.locale) setLocale(res.locale);
      setMsg(
        res.applied.length
          ? t("setup.applied", { ids: res.applied.join(", ") })
          : t("setup.alreadyLatest"),
      );
      await refresh(created?.database_id ?? status.created_database_id);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("setup.migrateFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  const step1Done = status.meta_reachable;
  const step2Done = status.ready;
  const snippet =
    created?.bind_snippet ||
    status.bind_snippet ||
    `Cloudflare Dashboard
→ Workers & Pages → cfbridge
→ Settings → Bindings → Add → D1 database

Variable name: META
Database: cfbridge-meta

Save. Then click Recheck (no redeploy needed).`;

  const steps = [
    { id: 1, label: t("setup.chooseLanguage"), done: pickedLocale !== null },
    { id: 2, label: t("setup.step1Title"), done: step1Done },
    { id: 3, label: t("setup.step2Title"), done: step2Done },
  ];

  return (
    <div className="relative flex min-h-svh bg-canvas">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-background p-6 md:flex">
        <div className="mb-8">
          <BrandMark tiled className="mb-3" />
          <div className="text-sm font-medium tracking-tight">
            CF<span className="text-primary">Bridge</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t("setup.title")}</p>
        </div>
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <StepBadge done={s.done}>{s.id}</StepBadge>
              <span className={cn(s.done ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="flex min-w-0 flex-1 items-start justify-center p-6 md:p-10">
        <div className="w-full max-w-xl space-y-8">
          <div>
            <h1 className="text-2xl font-medium tracking-tight md:hidden">
              CF<span className="text-primary">Bridge</span> {t("setup.title")}
            </h1>
            <h1 className="hidden text-2xl font-medium tracking-tight md:block">
              {t("setup.title")}
            </h1>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">
              {t("setup.subtitle")}
            </p>
          </div>

          <section className="space-y-3 rounded-md border border-border bg-background p-5">
            <div className="flex items-center gap-2 md:hidden">
              <StepBadge done={pickedLocale !== null}>1</StepBadge>
              <h2 className="text-sm font-medium">{t("setup.chooseLanguage")}</h2>
            </div>
            <h2 className="hidden text-sm font-medium md:block">{t("setup.chooseLanguage")}</h2>
            <p className="text-xs text-muted-foreground">{t("setup.languageHint")}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={pickedLocale === "en" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => chooseLocale("en")}
              >
                {t("common.english")}
              </Button>
              <Button
                type="button"
                variant={pickedLocale === "zh-CN" ? "default" : "outline"}
                size="sm"
                disabled={busy}
                onClick={() => chooseLocale("zh-CN")}
              >
                {t("common.chinese")}
              </Button>
            </div>
          </section>

          {!authed && (
            <section className="space-y-2 rounded-md border border-border bg-background p-5">
              <Label htmlFor="setup-password">{t("setup.adminPassword")}</Label>
              <Input
                id="setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </section>
          )}

          <section className="space-y-3 rounded-md border border-border bg-background p-5">
            <div className="flex items-center gap-2">
              <StepBadge done={step1Done}>2</StepBadge>
              <h2 className="text-sm font-medium">{t("setup.step1Title")}</h2>
            </div>

            {step1Done ? (
              <StepDoneMessage>{t("setup.step1Ok")}</StepDoneMessage>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {status.meta_bound
                    ? t("setup.step1BoundBad")
                    : t("setup.step1Unbound")}
                </p>

                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !status.has_account_credentials || !pickedLocale}
                  onClick={() => void createDb()}
                >
                  {busy ? t("common.processing") : t("setup.createMetaDb")}
                </Button>

                {!status.has_account_credentials && (
                  <Alert variant="destructive">
                    <AlertDescription>{t("setup.needSecrets")}</AlertDescription>
                  </Alert>
                )}

                <p className="text-xs text-muted-foreground">{t("setup.bindHint")}</p>
                <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                  {snippet}
                </pre>
                {(created?.database_id || status.created_database_id) && (
                  <p className="font-mono text-xs text-muted-foreground">
                    database_id:{" "}
                    {created?.database_id || status.created_database_id}
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-md border border-border bg-background p-5">
            <div className="flex items-center gap-2">
              <StepBadge done={status.data_kv_bound}>+</StepBadge>
              <h2 className="text-sm font-medium">{t("setup.dataKvTitle")}</h2>
            </div>
            {status.data_kv_bound ? (
              <StepDoneMessage>{t("setup.dataKvOk")}</StepDoneMessage>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("setup.dataKvMissing")}
                </p>
                <p className="text-xs text-muted-foreground">{t("setup.dataKvHint")}</p>
                <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                  {`Cloudflare Dashboard
→ Workers & Pages → cfbridge
→ Settings → Bindings → Add → KV namespace

Variable name: DATA_KV
Namespace: cfbridge-data

Save. Then click Recheck (no redeploy needed).`}
                </pre>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-md border border-border bg-background p-5">
            <div className="flex items-center gap-2">
              <StepBadge done={step2Done}>3</StepBadge>
              <h2 className="text-sm font-medium">{t("setup.step2Title")}</h2>
            </div>

            {step2Done ? (
              <StepDoneMessage>
                {t("setup.step2Ok", { version: status.schema_version })}
              </StepDoneMessage>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {t("setup.step2Progress", {
                    current: status.schema_version,
                    latest: status.latest_version,
                  })}
                  {status.pending_migrations.length > 0 && (
                    <>
                      {" "}
                      · {t("setup.pending")}{" "}
                      <code className="font-mono">
                        {status.pending_migrations.join(", ")}
                      </code>
                    </>
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !status.meta_reachable || !pickedLocale}
                  onClick={() => void migrate()}
                >
                  {busy
                    ? t("setup.running")
                    : status.schema_version === 0
                      ? t("setup.initDb")
                      : t("setup.upgradeDb")}
                </Button>
                {!status.meta_reachable && (
                  <p className="text-sm text-muted-foreground">{t("setup.needStep1")}</p>
                )}
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void refresh(created?.database_id ?? status.created_database_id)
              }
            >
              {t("setup.recheck")}
            </Button>
            {status.ready && (
              <Button type="button" size="sm" onClick={onReady}>
                {t("setup.enterConsole")}
              </Button>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {msg && (
            <Alert>
              <AlertDescription>{msg}</AlertDescription>
            </Alert>
          )}
        </div>
      </main>
    </div>
  );
}

function StepBadge({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <Badge
      variant={done ? "default" : "secondary"}
      className="h-6 min-w-6 justify-center rounded-full px-0 text-xs"
    >
      {children}
    </Badge>
  );
}

function StepDoneMessage({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-primary">
      <CheckCircle2Icon className="size-4" />
      {children}
    </p>
  );
}
