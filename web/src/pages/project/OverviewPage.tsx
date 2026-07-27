import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { CfAccountResource, ProjectResource } from "@cfbridge/shared";
import { api, ApiClientError } from "@/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/i18n";

export default function OverviewPage() {
  const t = useT();
  const navigate = useNavigate();
  const { project, resources, reload, setError } = useProject();
  const [kind, setKind] = useState<"kv" | "d1">("kv");
  const [mode, setMode] = useState<"create" | "attach">("create");
  const [name, setName] = useState("");
  const [cfId, setCfId] = useState("");
  const [cfOptions, setCfOptions] = useState<CfAccountResource[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfLoadError, setCfLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detachTarget, setDetachTarget] = useState<ProjectResource | null>(null);
  const [deleteCf, setDeleteCf] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteProjectCf, setDeleteProjectCf] = useState(false);

  useEffect(() => {
    if (mode !== "attach") {
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
  }, [mode, kind, t]);

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
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("project.resourceFailed"));
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

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader
        title={project.name}
        description={t("project.refBase", { ref: project.ref })}
      />

      <section className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
        <div className="shrink-0 space-y-3 border-b border-border px-4 py-3 md:px-6">
          <div>
            <h2 className="text-sm font-medium">{t("project.resources")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("project.resourcesHint")}</p>
          </div>
          <form
            className="space-y-1.5"
            onSubmit={(e) => void addResource(e)}
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="h-4 text-xs leading-none">{t("project.kind")}</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v as "kv" | "d1");
                    setCfId("");
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-[5.5rem] py-0 text-sm"
                    aria-label={t("project.kind")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="kv">KV</SelectItem>
                    <SelectItem value="d1">D1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="h-4 text-xs leading-none">{t("project.mode")}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => {
                    setMode(v as "create" | "attach");
                    setCfId("");
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-[7.5rem] py-0 text-sm"
                    aria-label={t("project.mode")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="create">{t("project.modeCreate")}</SelectItem>
                    <SelectItem value="attach">{t("project.modeAttach")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="h-4 text-xs leading-none">{t("common.name")}</Label>
                <Input
                  className="h-8 w-40 py-0 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${project.ref}-${kind}`}
                  required={mode === "create"}
                />
              </div>
              {mode === "attach" && (
                <div className="flex min-w-0 flex-col gap-1">
                  <Label className="h-4 text-xs leading-none">{t("project.cfId")}</Label>
                  {cfLoadError ? (
                    <Input
                      className="h-8 w-56 py-0 font-mono text-sm"
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
                        className="h-8 w-56 py-0 text-sm"
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
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="h-4" aria-hidden />
                <Button
                  type="submit"
                  className="h-8"
                  disabled={
                    busy ||
                    (mode === "attach" &&
                      (!cfId.trim() ||
                        (!cfLoadError && (cfLoading || cfOptions.length === 0))))
                  }
                >
                  {mode === "create"
                    ? t("project.createResource")
                    : t("project.attachResource")}
                </Button>
              </div>
            </div>
            {mode === "attach" && cfLoadError ? (
              <p className="text-[11px] leading-tight text-muted-foreground">
                {cfLoadError}
              </p>
            ) : null}
          </form>
        </div>

        <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-none scrollbar-none p-4 md:p-6">
          <div className="overflow-hidden rounded-md border border-border bg-background">
            {resources.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("project.resourcesEmpty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t("project.colKind")}</TableHead>
                    <TableHead>{t("project.colName")}</TableHead>
                    <TableHead>{t("project.colCfId")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resources.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="secondary">{r.kind}</Badge>
                      </TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <code className="text-xs">{r.cf_id}</code>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setDeleteCf(false);
                            setDetachTarget(r);
                          }}
                        >
                          {t("common.remove")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </section>

      <section className="shrink-0 border-t border-border px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-destructive">{t("project.dangerZone")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("project.dangerZoneHint")}</p>
          </div>
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
        </div>
      </section>

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
