import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  SYSTEM_PROJECT_REF,
  type CfAccountResource,
  type ProjectResource,
} from "@cfbridge/shared";
import { DatabaseIcon, PlusIcon } from "lucide-react";
import { api, ApiClientError } from "@/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export default function OverviewPage() {
  const t = useT();
  const navigate = useNavigate();
  const { project, resources, reload, setError } = useProject();
  const [showCreate, setShowCreate] = useState(false);
  const [kind, setKind] = useState<"kv" | "d1">("kv");
  const [mode, setMode] = useState<"create" | "attach">("create");
  const [name, setName] = useState("");
  const [cfId, setCfId] = useState("");
  const [cfOptions, setCfOptions] = useState<CfAccountResource[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfLoadError, setCfLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detachTarget, setDetachTarget] = useState<ProjectResource | null>(null);
  const [deleteCf, setDeleteCf] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProjectCf, setDeleteProjectCf] = useState(false);
  const isSystem = project.ref === SYSTEM_PROJECT_REF;

  const kvCount = resources.filter((r) => r.kind === "kv").length;
  const d1Count = resources.filter((r) => r.kind === "d1").length;

  function resetForm() {
    setKind("kv");
    setMode("create");
    setName("");
    setCfId("");
    setCfOptions([]);
    setCfLoadError(null);
    setCfLoading(false);
    setFormError(null);
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  function onCreateOpenChange(open: boolean) {
    if (busy) return;
    setShowCreate(open);
    if (!open) resetForm();
  }

  useEffect(() => {
    if (!showCreate || mode !== "attach") {
      setCfOptions([]);
      setCfLoadError(null);
      setCfLoading(false);
      return;
    }

    let cancelled = false;
    setCfLoading(true);
    setCfLoadError(null);
    setCfId("");

    void api
      .listCfResources(kind)
      .then((res) => {
        if (cancelled) return;
        setCfOptions(res.resources);
      })
      .catch((err) => {
        if (cancelled) return;
        setCfOptions([]);
        setCfLoadError(
          err instanceof ApiClientError
            ? err.message
            : t("project.cfResourcesLoadFailed"),
        );
      })
      .finally(() => {
        if (!cancelled) setCfLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showCreate, mode, kind, t]);

  async function addResource(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
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
      setShowCreate(false);
      resetForm();
      await reload();
    } catch (err) {
      setFormError(
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
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedDelete"));
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
      setError(err instanceof ApiClientError ? err.message : t("common.failedDelete"));
      setBusy(false);
    }
  }

  function onSelectCfResource(id: string) {
    setCfId(id);
    const selected = cfOptions.find((r) => r.id === id);
    if (selected && !name.trim()) {
      setName(selected.name);
    }
  }

  const attachDisabled =
    mode === "attach" &&
    (!cfId.trim() || (!cfLoadError && (cfLoading || cfOptions.length === 0)));

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader
        title={project.name}
        description={t("project.refBase", { ref: project.ref })}
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            {t("project.createResource")}
          </Button>
        }
      />

      <section className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-medium">{t("project.resources")}</h2>
            <span className="tabular-nums text-xs text-muted-foreground">
              {t("project.resourcesCount", { count: resources.length })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="font-normal">
              KV {kvCount}
            </Badge>
            <Badge variant="secondary" className="font-normal">
              D1 {d1Count}
            </Badge>
          </div>
        </div>

        <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-none scrollbar-none p-4 md:p-6">
          {resources.length === 0 ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-6 py-12 text-center">
              <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <DatabaseIcon className="size-5" aria-hidden />
              </div>
              <p className="max-w-sm text-sm text-pretty text-muted-foreground">
                {t("project.resourcesEmpty")}
              </p>
              <Button type="button" size="sm" className="mt-4" onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                {t("project.createResource")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {resources.map((r) => (
                <Link
                  key={r.id}
                  to={`/projects/${project.id}/${r.kind === "d1" ? "d1" : "kv"}`}
                  className={cn(
                    "group flex flex-col rounded-md border border-border bg-background p-4 no-underline shadow-none",
                    "transition-[border-color,background-color] duration-150",
                    "[@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-card",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {r.name}
                      </div>
                      <code className="mt-1 block truncate text-xs text-muted-foreground">
                        {r.cf_id}
                      </code>
                    </div>
                    <Badge variant="secondary" className="shrink-0 uppercase">
                      {r.kind}
                    </Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <Badge variant="outline">
                      {r.access_mode === "binding"
                        ? t("project.accessBinding")
                        : t("project.accessRest")}
                    </Badge>
                    {!isSystem && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteCf(false);
                          setDetachTarget(r);
                        }}
                      >
                        {t("common.remove")}
                      </Button>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="shrink-0 border-t border-border px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              className={
                isSystem
                  ? "text-sm font-medium"
                  : "text-sm font-medium text-destructive"
              }
            >
              {isSystem ? t("project.systemProtected") : t("project.dangerZone")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isSystem
                ? t("project.systemProtectedHint")
                : t("project.dangerZoneHint")}
            </p>
          </div>
          {!isSystem && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDeleteProjectCf(false);
                setDeleteOpen(true);
              }}
            >
              {t("project.deleteProject")}
            </Button>
          )}
        </div>
      </section>

      <Dialog open={showCreate} onOpenChange={onCreateOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("project.createResourceTitle")}</DialogTitle>
            <DialogDescription>{t("project.createResourceHint")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => void addResource(e)}>
            <div className="space-y-2">
              <Label>{t("project.mode")}</Label>
              <div className="inline-flex w-full rounded-md border border-border bg-background p-0.5">
                <Button
                  type="button"
                  variant={mode === "create" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 flex-1"
                  aria-pressed={mode === "create"}
                  onClick={() => {
                    setMode("create");
                    setCfId("");
                    setFormError(null);
                  }}
                >
                  {t("project.modeCreate")}
                </Button>
                <Button
                  type="button"
                  variant={mode === "attach" ? "secondary" : "ghost"}
                  size="sm"
                  className={cn("h-8 flex-1")}
                  aria-pressed={mode === "attach"}
                  onClick={() => {
                    setMode("attach");
                    setCfId("");
                    setFormError(null);
                  }}
                >
                  {t("project.modeAttach")}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource-kind">{t("project.kind")}</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as "kv" | "d1");
                  setCfId("");
                  setFormError(null);
                }}
              >
                <SelectTrigger id="resource-kind" className="w-full" aria-label={t("project.kind")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="kv">KV</SelectItem>
                  <SelectItem value="d1">D1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resource-name">{t("common.name")}</Label>
              <Input
                id="resource-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${project.ref}-${kind}`}
                required={mode === "create"}
                autoFocus
              />
            </div>

            {mode === "attach" && (
              <div className="space-y-2">
                <Label htmlFor="resource-cf">{t("project.cfId")}</Label>
                {cfLoadError ? (
                  <Input
                    id="resource-cf"
                    className="font-mono"
                    value={cfId}
                    onChange={(e) => setCfId(e.target.value)}
                    placeholder={t("project.cfIdManualPlaceholder")}
                    required
                  />
                ) : (
                  <Select
                    value={cfId || undefined}
                    onValueChange={onSelectCfResource}
                    disabled={cfLoading || cfOptions.length === 0}
                  >
                    <SelectTrigger
                      id="resource-cf"
                      className="w-full"
                      aria-label={t("project.cfId")}
                    >
                      <SelectValue
                        placeholder={
                          cfLoading
                            ? t("common.loading")
                            : cfOptions.length === 0
                              ? t("project.cfResourcesEmpty")
                              : t("project.cfSelectPlaceholder")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {cfOptions.map((r) => (
                        <SelectItem key={r.id} value={r.id} textValue={r.name}>
                          <span className="truncate">{r.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {cfLoadError ? (
                  <p className="text-xs text-muted-foreground">{cfLoadError}</p>
                ) : null}
              </div>
            )}

            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onCreateOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy || attachDisabled}>
                {busy
                  ? t("project.creatingResource")
                  : mode === "create"
                    ? t("project.createResource")
                    : t("project.attachResource")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={detachTarget !== null}
        title={t("project.detachTitle")}
        body={
          detachTarget
            ? detachTarget.access_mode === "binding"
              ? `${t("project.detachBody", {
                  kind: detachTarget.kind,
                  name: detachTarget.name,
                })} ${t("project.alsoDeleteCfBinding")}`
              : t("project.detachBody", {
                  kind: detachTarget.kind,
                  name: detachTarget.name,
                })
            : ""
        }
        confirmLabel={t("common.remove")}
        busy={busy}
        checkboxLabel={
          detachTarget?.access_mode === "binding"
            ? undefined
            : t("project.alsoDeleteCf")
        }
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
