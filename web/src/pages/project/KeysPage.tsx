import { useEffect, useState, type FormEvent } from "react";
import type { ApiKeyPublic, CreateApiKeyResponse } from "@cfbridge/shared";
import { CheckIcon, CopyIcon } from "lucide-react";
import { api, ApiClientError } from "@/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/i18n";

function KeyReveal({
  title,
  value,
  onDismiss,
}: {
  title: string;
  value: string;
  onDismiss: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-md border border-primary/40 bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          {t("common.dismiss")}
        </Button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
        {value}
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={() => void copy()}>
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
        <p className="text-sm text-muted-foreground">{t("project.keysNewHint")}</p>
      </div>
    </div>
  );
}

function KeyRows({
  rows,
  busy,
  knownKeys,
  onRevoke,
}: {
  rows: ApiKeyPublic[];
  busy: boolean;
  knownKeys: Record<string, string>;
  onRevoke: (id: string) => void;
}) {
  const t = useT();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyKey(k: ApiKeyPublic) {
    const value = knownKeys[k.id] || k.key_prefix;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(k.id);
      window.setTimeout(() => {
        setCopiedId((id) => (id === k.id ? null : id));
      }, 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("project.colName")}</TableHead>
          <TableHead>{t("project.colPrefix")}</TableHead>
          <TableHead>{t("project.colStatus")}</TableHead>
          <TableHead>{t("project.colCreated")}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((k) => (
          <TableRow key={k.id}>
            <TableCell>{k.name}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <code className="text-xs">{k.key_prefix}…</code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  disabled={busy}
                  aria-label={
                    copiedId === k.id ? t("common.copied") : t("common.copy")
                  }
                  onClick={() => void copyKey(k)}
                >
                  {copiedId === k.id ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                </Button>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={k.revoked_at ? "secondary" : "default"}>
                {k.revoked_at ? t("project.revoked") : t("project.active")}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {k.created_at.slice(0, 10)}
            </TableCell>
            <TableCell className="text-right">
              {!k.revoked_at && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRevoke(k.id)}
                >
                  {t("project.revoke")}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function KeysPage() {
  const t = useT();
  const { project, keys, reload, setError } = useProject();
  const [freshKey, setFreshKey] = useState<CreateApiKeyResponse | null>(null);
  const [freshPair, setFreshPair] = useState<{
    publishable: CreateApiKeyResponse;
    secret: CreateApiKeyResponse;
  } | null>(null);
  const [secretName, setSecretName] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<ApiKeyPublic | null>(null);
  const [anonReadonly, setAnonReadonly] = useState(project.anon_readonly);
  const [knownKeys, setKnownKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    setAnonReadonly(project.anon_readonly);
  }, [project.anon_readonly]);

  const publishable = keys.filter((k) => k.role === "anon");
  const secrets = keys.filter((k) => k.role === "service_role");
  const activePublishable = publishable.filter((k) => !k.revoked_at);

  function rememberPlaintext(res: CreateApiKeyResponse) {
    setKnownKeys((prev) => ({ ...prev, [res.id]: res.key }));
  }

  async function saveReadonly(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.updateProject(project.id, { anon_readonly: next });
      setAnonReadonly(next);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedUpdate"));
    } finally {
      setBusy(false);
    }
  }

  async function mint(
    role: "anon" | "service_role",
    name: string,
  ): Promise<CreateApiKeyResponse | null> {
    setBusy(true);
    setError(null);
    setFreshKey(null);
    setFreshPair(null);
    try {
      const res = await api.createKey(project.id, { name, role });
      rememberPlaintext(res);
      setFreshKey(res);
      await reload();
      return res;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedCreate"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createPublishable() {
    await mint("anon", "default");
  }

  async function createSecret(e: FormEvent) {
    e.preventDefault();
    const name = secretName.trim() || "secret";
    const res = await mint("service_role", name);
    if (res) setSecretName("");
  }

  async function bootstrapDefaults() {
    setBusy(true);
    setError(null);
    setFreshKey(null);
    setFreshPair(null);
    let publishableKey: CreateApiKeyResponse | null = null;
    try {
      publishableKey = await api.createKey(project.id, {
        name: "default",
        role: "anon",
      });
      const secretKey = await api.createKey(project.id, {
        name: "default",
        role: "service_role",
      });
      rememberPlaintext(publishableKey);
      rememberPlaintext(secretKey);
      setFreshPair({ publishable: publishableKey, secret: secretKey });
      await reload();
    } catch (err) {
      if (publishableKey) {
        try {
          await api.revokeKey(project.id, publishableKey.id);
        } catch {
          /* best-effort */
        }
        rememberPlaintext(publishableKey);
        setFreshKey(publishableKey);
      }
      setError(err instanceof ApiClientError ? err.message : t("common.failedCreate"));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function confirmRotate() {
    if (!rotateTarget) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.createKey(project.id, {
        name: "default",
        role: "anon",
      });
      for (const k of activePublishable) {
        await api.revokeKey(project.id, k.id);
      }
      rememberPlaintext(res);
      setFreshKey(res);
      setRotateTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedCreate"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeId) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokeKey(project.id, revokeId);
      setRevokeId(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("project.revokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader
        title={t("project.tabKeys")}
      />

      <div className="h-0 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-none scrollbar-none p-4 md:p-6">
        {freshPair && (
          <div className="space-y-3 rounded-md border border-primary/40 bg-background p-4">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-sm font-medium">{t("project.keysNewTitle")}</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFreshPair(null)}>
                {t("common.dismiss")}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{t("projects.publishableKey")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(freshPair.publishable.key)
                  }
                >
                  {t("common.copy")}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                {freshPair.publishable.key}
              </pre>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{t("projects.secretKey")}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard.writeText(freshPair.secret.key)
                  }
                >
                  {t("common.copy")}
                </Button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                {freshPair.secret.key}
              </pre>
            </div>
            <p className="text-sm text-muted-foreground">{t("project.keysNewHint")}</p>
          </div>
        )}

        {freshKey && !freshPair && (
          <KeyReveal
            title={t("project.keysNewTitle")}
            value={freshKey.key}
            onDismiss={() => setFreshKey(null)}
          />
        )}

        {keys.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("project.keysEmptyLegacy")}</p>
            <Button
              type="button"
              className="mt-4"
              size="sm"
              disabled={busy}
              onClick={() => void bootstrapDefaults()}
            >
              {t("project.bootstrapKeys")}
            </Button>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">{t("project.publishableTitle")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("project.publishableHint")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="flex items-center gap-2 text-xs font-normal">
                    <Checkbox
                      checked={anonReadonly}
                      disabled={busy}
                      onCheckedChange={(v) => void saveReadonly(v === true)}
                    />
                    {t("project.publishableReadonly")}
                  </Label>
                  {activePublishable.length === 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void createPublishable()}
                    >
                      {t("project.createPublishable")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setRotateTarget(activePublishable[0]!)}
                    >
                      {t("project.rotatePublishable")}
                    </Button>
                  )}
                </div>
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-background">
                {publishable.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("project.publishableEmpty")}
                  </p>
                ) : (
                  <KeyRows
                    rows={publishable}
                    busy={busy}
                    knownKeys={knownKeys}
                    onRevoke={setRevokeId}
                  />
                )}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">{t("project.secretTitle")}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("project.secretHint")}
                  </p>
                </div>
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => void createSecret(e)}
                >
                  <Input
                    className="h-8 w-40"
                    value={secretName}
                    onChange={(e) => setSecretName(e.target.value)}
                    placeholder={t("project.secretNamePlaceholder")}
                  />
                  <Button type="submit" size="sm" disabled={busy}>
                    {t("project.createSecret")}
                  </Button>
                </form>
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-background">
                {secrets.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("project.secretEmpty")}
                  </p>
                ) : (
                  <KeyRows
                    rows={secrets}
                    busy={busy}
                    knownKeys={knownKeys}
                    onRevoke={setRevokeId}
                  />
                )}
              </div>
            </section>
          </>
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

      <ConfirmDialog
        open={rotateTarget !== null}
        title={t("project.rotatePublishableTitle")}
        body={t("project.rotatePublishableBody")}
        confirmLabel={t("project.rotatePublishable")}
        busy={busy}
        onCancel={() => {
          if (!busy) setRotateTarget(null);
        }}
        onConfirm={() => void confirmRotate()}
      />
    </div>
  );
}
