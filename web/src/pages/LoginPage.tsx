import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError } from "@/api";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

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
    <div className="relative flex min-h-svh items-center justify-center bg-canvas p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[360px]">
        <div className="mb-8 text-center">
          <BrandMark tiled className="mx-auto mb-5 size-10 rounded-md" />
          <h1 className="text-2xl font-semibold tracking-tight">
            CF<span className="text-primary">Bridge</span>
          </h1>
          <p className="mt-2 text-sm text-pretty text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>
        <div className="rounded-md border border-border bg-background p-6 shadow-none">
          <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="password">{t("login.adminPassword")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? t("login.signingIn") : t("login.signIn")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
