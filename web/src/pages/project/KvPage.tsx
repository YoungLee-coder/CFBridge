import { useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export default function KvPage() {
  const t = useT();
  const { project } = useProject();
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
      const res = await api.redisList(project.id, prefix);
      setKeys(res.keys);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("project.listFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function loadKey(name: string) {
    setSelected(name);
    setBusy(true);
    setError(null);
    try {
      const res = await api.redisGet(project.id, name);
      setValue(res.value);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("project.getFailed"));
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
      await api.redisSet(project.id, selected.trim(), value);
      setMsg(t("project.saved"));
      await listKeys();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("project.putFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteKey() {
    if (!selected.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.redisDelete(project.id, selected.trim());
      setSelected("");
      setValue("");
      setMsg(t("project.deleted"));
      setDeleteOpen(false);
      await listKeys();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedDelete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader
        title={t("project.tabRedis")}
        description={t("project.redisPageHint")}
      />

      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none lg:flex-row">
        <aside className="flex w-full flex-col border-b border-border bg-background lg:w-72 lg:border-r lg:border-b-0">
          <div className="flex shrink-0 items-end gap-2 border-b border-border p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">{t("project.prefix")}</Label>
              <Input
                className="h-8 font-mono text-xs"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void listKeys()}
            >
              {t("project.list")}
            </Button>
          </div>
          <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-none scrollbar-none">
            {keys.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {t("project.keysEmpty")}
              </p>
            ) : (
              <ul>
                {keys.map((k) => (
                  <li key={k.name}>
                    <button
                      type="button"
                      className={cn(
                        "w-full truncate border-b border-border px-3 py-2 text-left font-mono text-xs outline-none hover:bg-muted",
                        selected === k.name && "bg-accent",
                      )}
                      onClick={() => void loadKey(k.name)}
                    >
                      {k.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-canvas">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => void saveKey(e)}
          >
            <div className="space-y-2 border-b border-border bg-background p-3">
              <Label className="text-xs">{t("project.key")}</Label>
              <Input
                className="h-8 font-mono text-xs"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 p-3">
              <Label className="mb-2 block text-xs">{t("project.value")}</Label>
              <Textarea
                className="min-h-[16rem] h-full resize-none font-mono text-xs"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background px-3 py-2">
              <Button type="submit" size="sm" disabled={busy}>
                {t("common.save")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy || !selected.trim()}
                onClick={() => setDeleteOpen(true)}
              >
                {t("common.delete")}
              </Button>
              {error && (
                <Alert variant="destructive" className="w-full sm:ml-auto sm:w-auto">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {msg && !error && (
                <p className="text-xs text-primary sm:ml-auto">{msg}</p>
              )}
            </div>
          </form>
        </div>
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
