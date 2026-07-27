import { useCallback, useEffect, useState } from "react";
import type { CreateMetaDbResponse, Locale, SetupStatus } from "@cfbridge/shared";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { readStoredLocale } from "../i18n/types";

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

  return (
    <div className="login-page">
      <div className="login-card wide stack">
        <div>
          <h1 className="brand-mark">
            CF<span>Bridge</span> {t("setup.title")}
          </h1>
          <p className="subtitle">{t("setup.subtitle")}</p>
        </div>

        <div className="card setup-step">
          <div className="setup-step-header">
            <span className={`step-dot ${pickedLocale ? "done" : "pending"}`}>
              1
            </span>
            <h2>{t("setup.chooseLanguage")}</h2>
          </div>
          <p className="muted tight-b">
            {t("setup.languageHint")}
          </p>
          <div className="lang-picker">
            <button
              type="button"
              className={`btn ${pickedLocale === "en" ? "btn-primary" : ""}`}
              disabled={busy}
              onClick={() => chooseLocale("en")}
            >
              {t("common.english")}
            </button>
            <button
              type="button"
              className={`btn ${pickedLocale === "zh-CN" ? "btn-primary" : ""}`}
              disabled={busy}
              onClick={() => chooseLocale("zh-CN")}
            >
              {t("common.chinese")}
            </button>
          </div>
        </div>

        {!authed && (
          <label className="label">
            {t("setup.adminPassword")}
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
        )}

        <div className="card setup-step">
          <div className="setup-step-header">
            <span className={`step-dot ${step1Done ? "done" : "pending"}`}>2</span>
            <h2>{t("setup.step1Title")}</h2>
          </div>

          {step1Done ? (
            <p className="success tight">
              {t("setup.step1Ok")}
            </p>
          ) : (
            <div className="stack">
              <p className="muted tight">
                {status.meta_bound
                  ? t("setup.step1BoundBad")
                  : t("setup.step1Unbound")}
              </p>

              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !status.has_account_credentials || !pickedLocale}
                onClick={() => void createDb()}
              >
                {busy ? t("common.processing") : t("setup.createMetaDb")}
              </button>

              {!status.has_account_credentials && (
                <div className="alert alert-error">{t("setup.needSecrets")}</div>
              )}

              <p className="muted tight">
                {t("setup.bindHint")}
              </p>
              <pre className="secret-box tight">
                {snippet}
              </pre>
              {(created?.database_id || status.created_database_id) && (
                <p className="mono muted tight">
                  database_id:{" "}
                  {created?.database_id || status.created_database_id}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card setup-step">
          <div className="setup-step-header">
            <span className={`step-dot ${step2Done ? "done" : "pending"}`}>3</span>
            <h2>{t("setup.step2Title")}</h2>
          </div>

          {step2Done ? (
            <p className="success tight">
              {t("setup.step2Ok", { version: status.schema_version })}
            </p>
          ) : (
            <div className="stack">
              <p className="muted tight">
                {t("setup.step2Progress", {
                  current: status.schema_version,
                  latest: status.latest_version,
                })}
                {status.pending_migrations.length > 0 && (
                  <>
                    {" "}
                    · {t("setup.pending")}{" "}
                    <code>{status.pending_migrations.join(", ")}</code>
                  </>
                )}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !status.meta_reachable || !pickedLocale}
                onClick={() => void migrate()}
              >
                {busy
                  ? t("setup.running")
                  : status.schema_version === 0
                    ? t("setup.initDb")
                    : t("setup.upgradeDb")}
              </button>
              {!status.meta_reachable && (
                <p className="muted tight">
                  {t("setup.needStep1")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              void refresh(created?.database_id ?? status.created_database_id)
            }
          >
            {t("setup.recheck")}
          </button>
          {status.ready && (
            <button type="button" className="btn btn-primary" onClick={onReady}>
              {t("setup.enterConsole")}
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {msg && <div className="alert alert-success">{msg}</div>}
      </div>
    </div>
  );
}
