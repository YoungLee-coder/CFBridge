import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type { RedisKeyEntry } from "@cfbridge/shared";
import { api, ApiClientError } from "@/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { formatJson } from "@/lib/json-value";
import { parseRedisArgv } from "@/lib/redis-argv";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatRemainingTtl(expiration: number): string {
  const remaining = Math.max(0, expiration - Math.floor(Date.now() / 1000));
  if (remaining < 60) return `${remaining}s`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}m`;
  if (remaining < 86400) return `${Math.floor(remaining / 3600)}h`;
  return `${Math.floor(remaining / 86400)}d`;
}

function ttlLabel(entry: RedisKeyEntry): string | null {
  if (entry.expiration != null) {
    return formatRemainingTtl(entry.expiration);
  }
  return null;
}

export default function KvPage() {
  const t = useT();
  const { project, resources } = useProject();
  const hasKv = resources.some((r) => r.kind === "kv");

  const [prefix, setPrefix] = useState("");
  const [keys, setKeys] = useState<RedisKeyEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [listComplete, setListComplete] = useState(true);
  const [selected, setSelected] = useState("");
  const [value, setValue] = useState("");
  const [currentTtl, setCurrentTtl] = useState<number | null>(null);
  const [ttlInput, setTtlInput] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [consoleLine, setConsoleLine] = useState("");
  const [consoleResult, setConsoleResult] = useState<unknown>(null);
  const listLoadedRef = useRef(false);

  const loadKeys = useCallback(
    async (append = false) => {
      setBusy(true);
      try {
        const res = await api.redisKeys(project.id, {
          prefix: prefix || undefined,
          cursor: append ? cursor : undefined,
        });
        setKeys((prev) =>
          append && prev ? [...prev, ...res.keys] : res.keys,
        );
        setCursor(res.cursor);
        setListComplete(res.list_complete);
        listLoadedRef.current = true;
      } catch (err) {
        toast.error(
          err instanceof ApiClientError ? err.message : t("project.listFailed"),
        );
      } finally {
        setBusy(false);
      }
    },
    [project.id, prefix, cursor, t],
  );

  useEffect(() => {
    listLoadedRef.current = false;
    setKeys(null);
  }, [project.id]);

  useEffect(() => {
    let cancelled = false;
    // First paint: load immediately. Prefix edits: debounce without clearing the list.
    const delay = listLoadedRef.current ? 300 : 0;
    const timer = window.setTimeout(() => {
      setCursor(undefined);
      setChecked(new Set());
      void (async () => {
        setBusy(true);
        try {
          const res = await api.redisKeys(project.id, {
            prefix: prefix || undefined,
          });
          if (cancelled) return;
          setKeys(res.keys);
          setCursor(res.cursor);
          setListComplete(res.list_complete);
          listLoadedRef.current = true;
        } catch (err) {
          if (cancelled) return;
          toast.error(
            err instanceof ApiClientError ? err.message : t("project.listFailed"),
          );
          if (!listLoadedRef.current) setKeys([]);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project.id, prefix, t]);

  if (!hasKv) {
    return <Navigate to={`/projects/${project.id}/overview`} replace />;
  }

  function toggleCheck(name: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function loadKey(name: string) {
    setSelected(name);
    setBusy(true);
    try {
      const res = await api.redisInspect(project.id, name);
      setValue(res.value ?? "");
      setCurrentTtl(res.ttl);
      setTtlInput(res.ttl > 0 ? String(res.ttl) : "");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("project.getFailed"));
    } finally {
      setBusy(false);
    }
  }

  function startNewKey() {
    setSelected("");
    setValue("");
    setCurrentTtl(null);
    setTtlInput("");
          }

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    if (!selected.trim()) {
      toast.error(t("project.keyRequired"));
      return;
    }
    setBusy(true);
    try {
      const ttl =
        ttlInput.trim() !== "" ? Number.parseInt(ttlInput, 10) : undefined;
      if (ttl != null && ttl > 0 && ttl < 60) {
        toast.error(t("project.ttlMin60"));
        setBusy(false);
        return;
      }
      await api.redisSet(
        project.id,
        selected.trim(),
        value,
        ttl != null && ttl > 0 ? ttl : undefined,
      );
      toast.success(t("project.saved"));
      setCursor(undefined);
      const res = await api.redisKeys(project.id, {
        prefix: prefix || undefined,
      });
      setKeys(res.keys);
      setCursor(res.cursor);
      setListComplete(res.list_complete);
      const inspect = await api.redisInspect(project.id, selected.trim());
      setCurrentTtl(inspect.ttl);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("project.putFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteKey() {
    if (!selected.trim()) return;
    setBusy(true);
    try {
      await api.redisDelete(project.id, selected.trim());
      setSelected("");
      setValue("");
      setCurrentTtl(null);
      setTtlInput("");
      toast.success(t("project.deleted"));
      setDeleteOpen(false);
      setCursor(undefined);
      const res = await api.redisKeys(project.id, {
        prefix: prefix || undefined,
      });
      setKeys(res.keys);
      setCursor(res.cursor);
      setListComplete(res.list_complete);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("common.failedDelete"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmBulkDelete() {
    const names = [...checked];
    if (names.length === 0) return;
    setBusy(true);
    try {
      await api.redisDelete(project.id, names);
      setChecked(new Set());
      if (selected && names.includes(selected)) {
        setSelected("");
        setValue("");
        setCurrentTtl(null);
        setTtlInput("");
      }
      toast.success(t("project.bulkDeleted", { count: names.length }));
      setBulkDeleteOpen(false);
      setCursor(undefined);
      const res = await api.redisKeys(project.id, {
        prefix: prefix || undefined,
      });
      setKeys(res.keys);
      setCursor(res.cursor);
      setListComplete(res.list_complete);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("common.failedDelete"));
    } finally {
      setBusy(false);
    }
  }

  async function applyTtl() {
    if (!selected.trim()) {
      toast.error(t("project.keyRequired"));
      return;
    }
    const ttl = Number.parseInt(ttlInput, 10);
    if (!Number.isFinite(ttl) || ttl < 60) {
      toast.error(t("project.ttlMin60"));
      return;
    }
    setBusy(true);
    try {
      await api.redisExpire(project.id, selected.trim(), ttl);
      const inspect = await api.redisInspect(project.id, selected.trim());
      setCurrentTtl(inspect.ttl);
      toast.success(t("project.ttlUpdated"));
      setCursor(undefined);
      const res = await api.redisKeys(project.id, {
        prefix: prefix || undefined,
      });
      setKeys(res.keys);
      setCursor(res.cursor);
      setListComplete(res.list_complete);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("project.putFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function clearTtl() {
    if (!selected.trim()) return;
    setBusy(true);
    try {
      const result = await api.redisPersist(project.id, selected.trim());
      if (result === 0) {
        toast.error(t("project.keyMissing"));
        return;
      }
      const after = await api.redisInspect(project.id, selected.trim());
      setCurrentTtl(after.ttl);
      setTtlInput("");
      toast.success(t("project.ttlCleared"));
      setCursor(undefined);
      const res = await api.redisKeys(project.id, {
        prefix: prefix || undefined,
      });
      setKeys(res.keys);
      setCursor(res.cursor);
      setListComplete(res.list_complete);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("project.putFailed"));
    } finally {
      setBusy(false);
    }
  }

  function handleFormatJson() {
    const formatted = formatJson(value);
    if (formatted) setValue(formatted);
  }

  async function runConsole(e: FormEvent) {
    e.preventDefault();
    const line = consoleLine.trim();
    if (!line) {
      toast.error(t("project.commandRequired"));
      return;
    }
    setBusy(true);
    try {
      const argv = parseRedisArgv(line);
      const result = await api.redisCommand(project.id, argv);
      setConsoleResult(result);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : t("project.queryFailed"));
      setConsoleResult(null);
    } finally {
      setBusy(false);
    }
  }

  function formatTtlSeconds(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  function ttlStatusBadge(): { label: string; variant: "secondary" | "outline" | "destructive" } | null {
    if (currentTtl === null) return null;
    if (currentTtl === -2) {
      return { label: t("project.keyMissing"), variant: "destructive" };
    }
    if (currentTtl === -1) {
      return { label: t("project.noExpiry"), variant: "secondary" };
    }
    return {
      label: t("project.ttlExpiresIn", { time: formatTtlSeconds(currentTtl) }),
      variant: "outline",
    };
  }

  const ttlBadge = ttlStatusBadge();

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader title={t("project.tabRedis")} />

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
              onClick={() => {
                setCursor(undefined);
                setChecked(new Set());
                void loadKeys(false);
              }}
            >
              {t("project.refresh")}
            </Button>
          </div>

          {checked.size > 0 && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {t("project.selectedCount", { count: checked.size })}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => setBulkDeleteOpen(true)}
              >
                {t("common.delete")}
              </Button>
            </div>
          )}

          <div
            className={cn(
              "h-0 min-h-0 flex-1 overflow-y-auto overscroll-none scrollbar-none",
              busy && keys != null && "opacity-70",
            )}
          >
            {keys == null ? (
              <div className="space-y-0" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="flex h-8 items-center gap-2 border-b border-border px-2"
                  >
                    <Skeleton className="size-3.5 shrink-0 rounded-sm" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                ))}
              </div>
            ) : keys.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {t("project.redisKeysEmpty")}
              </p>
            ) : (
              <ul>
                {keys.map((k) => {
                  const badge = ttlLabel(k);
                  return (
                    <li
                      key={k.name}
                      className={cn(
                        "flex w-full items-stretch border-b border-border hover:bg-muted",
                        selected === k.name && "bg-accent hover:bg-accent",
                      )}
                    >
                      <div className="flex items-center px-2">
                        <Checkbox
                          checked={checked.has(k.name)}
                          onCheckedChange={() => toggleCheck(k.name)}
                          aria-label={k.name}
                        />
                      </div>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 truncate py-2 pr-3 text-left font-mono text-xs outline-none"
                        onClick={() => void loadKey(k.name)}
                      >
                        <span className="min-w-0 flex-1 truncate">{k.name}</span>
                        {badge && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {badge}
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!listComplete && (
            <div className="shrink-0 border-t border-border p-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={busy}
                onClick={() => void loadKeys(true)}
              >
                {t("project.loadMore")}
              </Button>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-canvas">
          <Tabs defaultValue="editor" className="flex h-0 min-h-0 flex-1 flex-col gap-0">
            <div className="shrink-0 border-b border-border bg-background px-3 pt-2">
              <TabsList variant="line">
                <TabsTrigger value="editor">{t("project.tabEditor")}</TabsTrigger>
                <TabsTrigger value="console">{t("project.tabConsole")}</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="editor"
              className="mt-0 flex h-0 min-h-0 flex-1 flex-col overflow-clip"
            >
              <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(e) => void saveKey(e)}
              >
                <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-border bg-background p-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-xs">{t("project.key")}</Label>
                    <Input
                      className="h-8 font-mono text-xs"
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                      placeholder={t("project.newKey")}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startNewKey}
                  >
                    {t("project.newKey")}
                  </Button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs">{t("project.value")}</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t("project.valueLength", { count: value.length })}
                      </span>
                      {formatJson(value) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleFormatJson}
                        >
                          {t("project.formatJson")}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="relative min-h-0 flex-1">
                    <Textarea
                      className="absolute inset-0 size-full resize-none [field-sizing:fixed] font-mono text-xs"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </div>
                </div>

                <div className="shrink-0 space-y-2 border-t border-border bg-background p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <div className="flex h-5 items-center gap-1.5">
                        <Label className="text-xs leading-none">{t("project.ttlSeconds")}</Label>
                        <span className="inline-flex h-5 min-w-0 items-center">
                          {ttlBadge ? (
                            <Badge
                              variant={ttlBadge.variant}
                              className="h-5 px-2 text-xs font-normal"
                            >
                              {ttlBadge.label}
                            </Badge>
                          ) : (
                            <span className="invisible h-5 px-2 text-xs" aria-hidden>
                              {t("project.noExpiry")}
                            </span>
                          )}
                        </span>
                      </div>
                      <Input
                        type="number"
                        min={60}
                        className="h-8 w-28 font-mono text-xs"
                        value={ttlInput}
                        onChange={(e) => setTtlInput(e.target.value)}
                        placeholder="60"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || !selected.trim()}
                      onClick={() => void applyTtl()}
                    >
                      {t("project.setTtl")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        busy ||
                        !selected.trim() ||
                        currentTtl === null ||
                        currentTtl < 0
                      }
                      onClick={() => void clearTtl()}
                    >
                      {t("project.clearTtl")}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
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
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent
              value="console"
              className="mt-0 flex h-0 min-h-0 flex-1 flex-col overflow-clip"
            >
              <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(e) => void runConsole(e)}
              >
                <div className="shrink-0 space-y-2 border-b border-border bg-background p-3">
                  <Label className="text-xs">{t("project.tabConsole")}</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-8 flex-1 font-mono text-xs"
                      value={consoleLine}
                      onChange={(e) => setConsoleLine(e.target.value)}
                      placeholder="GET mykey"
                    />
                    <Button type="submit" size="sm" disabled={busy}>
                      {t("project.consoleRun")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("project.consoleHint")}
                  </p>
                </div>
                <div className="h-0 min-h-0 flex-1 overflow-auto p-3 scrollbar-none">
                  <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {t("project.consoleResult")}
                  </div>
                  {consoleResult != null ? (
                    <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(consoleResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("project.runToSee")}
                    </p>
                  )}
                </div>
              </form>
            </TabsContent>
          </Tabs>
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

      <ConfirmDialog
        open={bulkDeleteOpen}
        title={t("project.deleteSelectedTitle")}
        body={t("project.deleteSelectedBody", { count: checked.size })}
        confirmLabel={t("common.delete")}
        busy={busy}
        onCancel={() => {
          if (!busy) setBulkDeleteOpen(false);
        }}
        onConfirm={() => void confirmBulkDelete()}
      />
    </div>
  );
}
