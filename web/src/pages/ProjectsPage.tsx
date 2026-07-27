import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Project } from "@cfbridge/shared";
import { api, ApiClientError } from "../api";
import { useT } from "../i18n";

export default function ProjectsPage() {
  const t = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
      if (res.projects.length === 0) setShowCreate(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createProject({
        name: name.trim(),
        ref: ref.trim() || undefined,
      });
      setName("");
      setRef("");
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t("common.failedCreate"),
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("projects.title")}</h1>
          <p>{t("projects.subtitle")}</p>
        </div>
        <div className="page-actions">
          {!loading && (
            <button
              type="button"
              className={showCreate ? "btn" : "btn btn-primary"}
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? t("projects.hideCreate") : t("projects.createCta")}
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="card">
          <h2>{t("projects.createTitle")}</h2>
          <form className="row" onSubmit={(e) => void onCreate(e)}>
            <label className="label">
              {t("common.name")}
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("projects.namePlaceholder")}
                required
                autoFocus
              />
            </label>
            <label className="label">
              {t("projects.refOptional")}
              <input
                className="input mono"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder={t("projects.refPlaceholder")}
              />
            </label>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={creating}
              >
                {creating ? t("projects.creating") : t("common.create")}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="alert alert-error mt-1">{error}</div>
      )}

      <div className={showCreate || error ? "mt-1" : undefined}>
        {loading ? (
          <div className="skeleton-list" aria-busy="true" aria-label={t("common.loading")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-row">
                <div className="skeleton-line w-40" />
                <div className="skeleton-line w-60" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="list">
            <div className="empty-state">
              <p className="empty-state-title">{t("projects.empty")}</p>
              <p>{t("projects.emptyHint")}</p>
              {!showCreate && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowCreate(true)}
                >
                  {t("projects.createCta")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="list">
            {projects.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="list-row"
              >
                <div className="list-row-title">{p.name}</div>
                <div className="list-row-meta">
                  <code>{p.ref}</code>
                  <span
                    className={`badge ${p.anon_readonly ? "badge-warn" : "badge-ok"}`}
                  >
                    {p.anon_readonly
                      ? t("projects.readonly")
                      : t("projects.readwrite")}
                  </span>
                  <span>{p.created_at}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
