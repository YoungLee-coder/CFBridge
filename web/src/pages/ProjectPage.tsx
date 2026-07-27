import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApiKeyPublic, Project, ProjectResource } from "@cfbridge/shared";
import { api, ApiClientError } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import { useT } from "../i18n";
import type { MessagePath } from "../i18n/types";

type Tab = "overview" | "keys" | "kv" | "d1";

const BROWSER_KEY = (ref: string) => `cfbridge_browser_key_${ref}`;

export default function ProjectPage() {
  const { id = "" } = useParams();
  const t = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProject(id);
      setProject(res.project);
      setResources(res.resources);
      const keyRes = await api.listKeys(res.project.id);
      setKeys(keyRes.keys);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="skeleton-list" aria-busy="true">
        <div className="skeleton-row">
          <div className="skeleton-line w-40" />
          <div className="skeleton-line w-60" />
        </div>
        <div className="skeleton-row">
          <div className="skeleton-line w-60" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="stack">
        <div className="alert alert-error">{error || t("project.notFound")}</div>
        <Link to="/">{t("common.back")}</Link>
      </div>
    );
  }

  const tabs: Array<[Tab, MessagePath]> = [
    ["overview", "project.tabOverview"],
    ["keys", "project.tabKeys"],
    ["kv", "project.tabRedis"],
    ["d1", "project.tabD1"],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">{t("app.projects")}</Link>
            {" / "}
            {project.name}
          </p>
          <h1 className="page-title">{project.name}</h1>
          <p>{t("project.refBase", { ref: project.ref })}</p>
        </div>
      </div>

      {error && <div className="alert alert-error mb">{error}</div>}

      <div className="tabs">
        {tabs.map(([idTab, labelKey]) => (
          <button
            key={idTab}
            type="button"
            className={tab === idTab ? "active" : ""}
            onClick={() => setTab(idTab)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          project={project}
          resources={resources}
          onChanged={load}
          setError={setError}
        />
      )}
      {tab === "keys" && (
        <KeysTab
          project={project}
          keys={keys}
          onChanged={load}
          setError={setError}
        />
      )}
      {tab === "kv" && <KvTab project={project} />}
      {tab === "d1" && <D1Tab project={project} />}
    </div>
  );
}

function OverviewTab({
  project,
  resources,
  onChanged,
  setError,
}: {
  project: Project;
  resources: ProjectResource[];
  onChanged: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const [kind, setKind] = useState<"kv" | "d1">("kv");
  const [mode, setMode] = useState<"create" | "attach">("create");
  const [name, setName] = useState("");
  const [cfId, setCfId] = useState("");
  const [busy, setBusy] = useState(false);
  const [anonReadonly, setAnonReadonly] = useState(project.anon_readonly);
  const [detachTarget, setDetachTarget] = useState<ProjectResource | null>(null);
  const [deleteCf, setDeleteCf] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProjectCf, setDeleteProjectCf] = useState(false);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(project.id, { anon_readonly: anonReadonly });
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("common.failedUpdate"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function addResource(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        await api.createResource(project.id, { kind, name: name.trim() });
      } else {
        await api.attachResource(project.id, {
          kind,
          cf_id: cfId.trim(),
          name: name.trim() || undefined,
        });
      }
      setName("");
      setCfId("");
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("project.resourceFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDetach() {
    if (!detachTarget) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteResource(project.id, detachTarget.id, deleteCf);
      setDetachTarget(null);
      setDeleteCf(false);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("common.failedDelete"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteProject() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteProject(project.id, deleteProjectCf);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("common.failedDelete"),
      );
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>{t("project.settings")}</h2>
        <form className="row" onSubmit={(e) => void saveSettings(e)}>
          <label className="label label-inline">
            <input
              type="checkbox"
              checked={anonReadonly}
              onChange={(e) => setAnonReadonly(e.target.checked)}
            />
            {t("project.anonReadonly")}
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {t("common.save")}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>{t("project.resources")}</h2>
        {resources.length === 0 ? (
          <p className="empty">{t("project.resourcesEmpty")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("project.colKind")}</th>
                <th>{t("project.colName")}</th>
                <th>{t("project.colCfId")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge badge-info">{r.kind}</span>
                  </td>
                  <td>{r.name}</td>
                  <td>
                    <code>{r.cf_id}</code>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setDeleteCf(false);
                        setDetachTarget(r);
                      }}
                    >
                      {t("common.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form className="stack mt-1" onSubmit={(e) => void addResource(e)}>
          <div className="row">
            <label className="label">
              {t("project.kind")}
              <select
                className="select"
                value={kind}
                onChange={(e) => setKind(e.target.value as "kv" | "d1")}
              >
                <option value="kv">KV</option>
                <option value="d1">D1</option>
              </select>
            </label>
            <label className="label">
              {t("project.mode")}
              <select
                className="select"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "create" | "attach")
                }
              >
                <option value="create">{t("project.modeCreate")}</option>
                <option value="attach">{t("project.modeAttach")}</option>
              </select>
            </label>
            <label className="label">
              {t("common.name")}
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${project.ref}-${kind}`}
                required={mode === "create"}
              />
            </label>
            {mode === "attach" && (
              <label className="label">
                {t("project.cfId")}
                <input
                  className="input mono"
                  value={cfId}
                  onChange={(e) => setCfId(e.target.value)}
                  required
                />
              </label>
            )}
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {mode === "create"
                ? t("project.createResource")
                : t("project.attachResource")}
            </button>
          </div>
        </form>
      </div>

      <div className="card card-danger">
        <h2>{t("project.dangerZone")}</h2>
        <p className="muted card-hint">
          {t("project.dangerZoneHint")}
        </p>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            setDeleteProjectCf(false);
            setDeleteOpen(true);
          }}
        >
          {t("project.deleteProject")}
        </button>
      </div>

      <ConfirmDialog
        open={detachTarget !== null}
        title={t("project.detachTitle")}
        body={
          detachTarget
            ? t("project.detachBody", {
                kind: detachTarget.kind,
                name: detachTarget.name,
              })
            : ""
        }
        confirmLabel={t("common.remove")}
        busy={busy}
        checkboxLabel={t("project.alsoDeleteCf")}
        checkboxChecked={deleteCf}
        onCheckboxChange={setDeleteCf}
        onCancel={() => {
          if (!busy) {
            setDetachTarget(null);
            setDeleteCf(false);
          }
        }}
        onConfirm={() => void confirmDetach()}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={t("project.deleteProjectTitle")}
        body={t("project.deleteProjectBody", { ref: project.ref })}
        confirmLabel={t("project.deleteProject")}
        busy={busy}
        checkboxLabel={t("project.alsoDeleteCf")}
        checkboxChecked={deleteProjectCf}
        onCheckboxChange={setDeleteProjectCf}
        onCancel={() => {
          if (!busy) {
            setDeleteOpen(false);
            setDeleteProjectCf(false);
          }
        }}
        onConfirm={() => void confirmDeleteProject()}
      />
    </div>
  );
}

function KeysTab({
  project,
  keys,
  onChanged,
  setError,
}: {
  project: Project;
  keys: ApiKeyPublic[];
  onChanged: () => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const [name, setName] = useState("default");
  const [role, setRole] = useState<"anon" | "service_role">("service_role");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  async function createKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFreshKey(null);
    setCopied(false);
    try {
      const res = await api.createKey(project.id, {
        name: name.trim(),
        role,
      });
      setFreshKey(res.key);
      localStorage.setItem(BROWSER_KEY(project.ref), res.key);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("common.failedCreate"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }

  async function confirmRevoke() {
    if (!revokeId) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeKey(project.id, revokeId);
      setRevokeId(null);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("project.revokeFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {freshKey && (
        <div className="card">
          <div className="secret-banner">
            <div className="row secret-banner-head">
              <h2>{t("project.keysNewTitle")}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setFreshKey(null)}
              >
                {t("common.dismiss")}
              </button>
            </div>
            <div className="secret-box">{freshKey}</div>
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyKey()}>
                {copied ? t("common.copied") : t("common.copy")}
              </button>
              <p className="muted hint-inline">
                {t("project.keysNewHint")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>{t("project.keysCreateTitle")}</h2>
        <form className="row" onSubmit={(e) => void createKey(e)}>
          <label className="label">
            {t("common.name")}
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="label">
            {t("project.role")}
            <select
              className="select"
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "anon" | "service_role")
              }
            >
              <option value="service_role">service_role</option>
              <option value="anon">anon</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {t("project.mintKey")}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>{t("project.keysTitle")}</h2>
        {keys.length === 0 ? (
          <p className="empty">{t("project.keysEmpty")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("project.colName")}</th>
                <th>{t("project.colRole")}</th>
                <th>{t("project.colPrefix")}</th>
                <th>{t("project.colStatus")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <code>{k.role}</code>
                  </td>
                  <td>
                    <code>{k.key_prefix}…</code>
                  </td>
                  <td>
                    <span
                      className={`badge ${k.revoked_at ? "badge-warn" : "badge-ok"}`}
                    >
                      {k.revoked_at ? t("project.revoked") : t("project.active")}
                    </span>
                  </td>
                  <td className="actions">
                    {!k.revoked_at && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => setRevokeId(k.id)}
                      >
                        {t("project.revoke")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={revokeId !== null}
        title={t("project.revokeTitle")}
        body={t("project.revokeBody")}
        confirmLabel={t("project.revoke")}
        busy={busy}
        onCancel={() => {
          if (!busy) setRevokeId(null);
        }}
        onConfirm={() => void confirmRevoke()}
      />
    </div>
  );
}

function useBrowserKey(ref: string) {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(BROWSER_KEY(ref)) || "",
  );
  useEffect(() => {
    localStorage.setItem(BROWSER_KEY(ref), apiKey);
  }, [ref, apiKey]);
  return { apiKey, setApiKey };
}

function KvTab({ project }: { project: Project }) {
  const t = useT();
  const { apiKey, setApiKey } = useBrowserKey(project.ref);
  const [prefix, setPrefix] = useState("");
  const [keys, setKeys] = useState<Array<{ name: string }>>([]);
  const [selected, setSelected] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function listKeys() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.redisList(project.ref, apiKey, prefix);
      setKeys(res.keys);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("project.listFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadKey(name: string) {
    setSelected(name);
    setBusy(true);
    setError(null);
    try {
      const res = await api.redisGet(project.ref, apiKey, name);
      setValue(res.value);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("project.getFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    if (!selected.trim()) {
      setError(t("project.keyRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.redisSet(project.ref, apiKey, selected.trim(), value);
      setMsg(t("project.saved"));
      await listKeys();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("project.putFailed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteKey() {
    if (!selected.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.redisDelete(project.ref, apiKey, selected.trim());
      setSelected("");
      setValue("");
      setMsg(t("project.deleted"));
      setDeleteOpen(false);
      await listKeys();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("common.failedDelete"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>{t("project.browserKey")}</h2>
        <p className="muted tight-b">{t("project.browserKeyHint")}</p>
        <input
          className="input mono"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="cfb_sk_…"
        />
      </div>

      <div className="card">
        <h2>{t("project.keysTitle")}</h2>
        <div className="row">
          <label className="label">
            {t("project.prefix")}
            <input
              className="input mono"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="btn"
              disabled={busy || !apiKey}
              onClick={() => void listKeys()}
            >
              {t("project.list")}
            </button>
          </div>
        </div>
        {keys.length > 0 && (
          <table className="table mt-1">
            <tbody>
              {keys.map((k) => (
                <tr key={k.name}>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void loadKey(k.name)}
                    >
                      <code>{k.name}</code>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>{t("project.readWrite")}</h2>
        <form className="stack" onSubmit={(e) => void saveKey(e)}>
          <label className="label">
            {t("project.key")}
            <input
              className="input mono"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            />
          </label>
          <label className="label">
            {t("project.value")}
            <textarea
              className="textarea"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <div className="row">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !apiKey}
            >
              {t("common.save")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !apiKey || !selected.trim()}
              onClick={() => setDeleteOpen(true)}
            >
              {t("common.delete")}
            </button>
          </div>
        </form>
        {error && <div className="alert alert-error mt-1">{error}</div>}
        {msg && <div className="alert alert-success mt-1">{msg}</div>}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={t("project.deleteKeyTitle")}
        body={t("project.deleteKeyBody", { name: selected })}
        confirmLabel={t("common.delete")}
        busy={busy}
        onCancel={() => {
          if (!busy) setDeleteOpen(false);
        }}
        onConfirm={() => void confirmDeleteKey()}
      />
    </div>
  );
}

function D1Tab({ project }: { project: Project }) {
  const t = useT();
  const { apiKey, setApiKey } = useBrowserKey(project.ref);
  const [sql, setSql] = useState(
    "SELECT name FROM sqlite_master WHERE type='table';",
  );
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    if (!result || typeof result !== "object") return null;
    const r = result as {
      result?: Array<{ results?: Record<string, unknown>[] }>;
    };
    const first = r.result?.[0]?.results;
    return first ?? null;
  }, [result]);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.d1Query(project.ref, apiKey, sql);
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("project.queryFailed"),
      );
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const columns =
    rows && rows.length > 0 ? Object.keys(rows[0] as object) : [];

  return (
    <div className="stack">
      <div className="card">
        <h2>{t("project.browserKey")}</h2>
        <input
          className="input mono"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="cfb_sk_…"
        />
      </div>

      <div className="card">
        <h2>{t("project.sql")}</h2>
        <form className="stack" onSubmit={(e) => void run(e)}>
          <textarea
            className="textarea textarea-lg"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
          />
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy || !apiKey}
            >
              {busy ? t("project.running") : t("project.runQuery")}
            </button>
          </div>
        </form>
        {error && <div className="alert alert-error mt-1">{error}</div>}
      </div>

      <div className="card">
        <h2>{t("project.result")}</h2>
        {rows ? (
          rows.length === 0 ? (
            <p className="muted">{t("project.zeroRows")}</p>
          ) : (
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map((col) => (
                        <td key={col}>
                          <code>
                            {String(
                              (row as Record<string, unknown>)[col] ?? "",
                            )}
                          </code>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : result ? (
          <pre className="mono pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <p className="empty">{t("project.runToSee")}</p>
        )}
      </div>
    </div>
  );
}
