import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiClientError } from "../api";
import { useAuth } from "../auth";
import { useT } from "../i18n";

export default function LoginPage() {
  const { authed, ready, login } = useAuth();
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (ready && authed) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("login.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card stack" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <h1>
            CF<span style={{ color: "var(--accent)" }}>Bridge</span>
          </h1>
          <p>{t("login.subtitle")}</p>
        </div>
        <label className="label">
          {t("login.adminPassword")}
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? t("login.signingIn") : t("login.signIn")}
        </button>
      </form>
    </div>
  );
}
