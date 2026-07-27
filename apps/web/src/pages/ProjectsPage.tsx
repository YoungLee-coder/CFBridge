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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
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
      </div>

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
          <button
            className="btn btn-primary"
            type="submit"
            disabled={creating}
            style={{ alignSelf: "end" }}
          >
            {creating ? t("projects.creating") : t("common.create")}
          </button>
        </form>
      </div>

      {error && (
        <p className="error" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      )}

      <div className="card" style={{ marginTop: "1rem" }}>
        <h2>{t("projects.allTitle")}</h2>
        {loading ? (
          <p className="muted">{t("common.loading")}</p>
        ) : projects.length === 0 ? (
          <p className="empty">{t("projects.empty")}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t("projects.colName")}</th>
                <th>{t("projects.colRef")}</th>
                <th>{t("projects.colAnon")}</th>
                <th>{t("projects.colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>
                    <code>{p.ref}</code>
                  </td>
                  <td>
                    <span
                      className={`badge ${p.anon_readonly ? "badge-warn" : "badge-ok"}`}
                    >
                      {p.anon_readonly
                        ? t("projects.readonly")
                        : t("projects.readwrite")}
                    </span>
                  </td>
                  <td className="muted">{p.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
