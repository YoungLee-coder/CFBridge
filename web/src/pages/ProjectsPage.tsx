import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CreateApiKeyResponse, Project } from "@cfbridge/shared";
import {
  ChevronDownIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { api, ApiClientError } from "@/api";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "readonly" | "readwrite";
type SortKey = "name" | "created";
type ViewMode = "grid" | "list";

function ProjectCubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M36 10L58 22V46L36 58L14 46V22L36 10Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M36 10V34M36 34L14 22M36 34L58 22M36 34V58"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="34" r="9" fill="var(--card)" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M36 29V39M31 34H41"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ProjectsPage() {
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [reveal, setReveal] = useState<{
    project: Project;
    publishable: CreateApiKeyResponse;
    secret: CreateApiKeyResponse;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<"publishable" | "secret" | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [view, setView] = useState<ViewMode>("grid");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : tRef.current("common.failedLoad"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await api.createProject({
        name: name.trim(),
        ref: ref.trim() || undefined,
      });
      setName("");
      setRef("");
      setShowCreate(false);
      setReveal({
        project: res.project,
        publishable: res.keys.publishable,
        secret: res.keys.secret,
      });
      setCopiedField(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("common.failedCreate"));
    } finally {
      setCreating(false);
    }
  }

  async function copyReveal(field: "publishable" | "secret") {
    if (!reveal) return;
    const value =
      field === "publishable" ? reveal.publishable.key : reveal.secret.key;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
    } catch {
      /* ignore */
    }
  }

  function continueToProject() {
    if (!reveal) return;
    const id = reveal.project.id;
    setReveal(null);
    navigate(`/projects/${id}/keys`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = projects.filter((p) => {
      if (status === "readonly" && !p.anon_readonly) return false;
      if (status === "readwrite" && p.anon_readonly) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sort === "created") return b.created_at.localeCompare(a.created_at);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [projects, query, status, sort]);

  const statusLabel =
    status === "readonly"
      ? t("projects.readonly")
      : status === "readwrite"
        ? t("projects.readwrite")
        : t("projects.statusFilter");

  const sortLabel =
    sort === "created" ? t("projects.sortByCreated") : t("projects.sortByName");

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <div>
          <h1 className="text-lg font-medium tracking-tight">{t("projects.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("projects.subtitle")}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
          <PlusIcon data-icon="inline-start" />
          {t("projects.createCta")}
        </Button>
      </div>

      <div className="flex h-0 min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-none scrollbar-none p-4 md:flex-row md:p-6">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("projects.searchPlaceholder")}
              className="h-8 bg-background pl-8 shadow-none"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="bg-background">
                {statusLabel}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={(v) => setStatus(v as StatusFilter)}
              >
                <DropdownMenuRadioItem value="all">{t("projects.statusAll")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="readwrite">
                  {t("projects.readwrite")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="readonly">
                  {t("projects.readonly")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="bg-background">
                {sortLabel}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(v) => setSort(v as SortKey)}
              >
                <DropdownMenuRadioItem value="name">
                  {t("projects.sortByName")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="created">
                  {t("projects.sortByCreated")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <Button
              type="button"
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={t("projects.viewGrid")}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGridIcon />
            </Button>
            <Button
              type="button"
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label={t("projects.viewList")}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <ListIcon />
            </Button>
          </div>

        </div>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("projects.createTitle")}</DialogTitle>
              <DialogDescription>{t("projects.subtitle")}</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => void onCreate(e)}>
              <div className="space-y-2">
                <Label htmlFor="project-name">{t("common.name")}</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("projects.namePlaceholder")}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-ref">{t("projects.refOptional")}</Label>
                <Input
                  id="project-ref"
                  className="font-mono"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder={t("projects.refPlaceholder")}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? t("projects.creating") : t("common.create")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={reveal !== null}
          onOpenChange={(open) => {
            if (!open && reveal) continueToProject();
          }}
        >
          <DialogContent className="sm:max-w-lg" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{t("projects.keysRevealTitle")}</DialogTitle>
              <DialogDescription>{t("projects.keysRevealHint")}</DialogDescription>
            </DialogHeader>
            {reveal && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("projects.publishableKey")}</Label>
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                    {reveal.publishable.key}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyReveal("publishable")}
                  >
                    {copiedField === "publishable"
                      ? t("common.copied")
                      : t("common.copy")}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>{t("projects.secretKey")}</Label>
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                    {reveal.secret.key}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyReveal("secret")}
                  >
                    {copiedField === "secret" ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" onClick={continueToProject}>
                {t("projects.keysRevealContinue")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {error && !showCreate && !reveal && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label={t("common.loading")}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="animate-empty-enter flex min-h-[22rem] flex-col items-center justify-center rounded-md border border-dashed border-border bg-background px-6 py-16 text-center">
            <ProjectCubeIcon className="mb-5 size-16 text-muted-foreground" />
            <h2 className="text-base font-semibold tracking-tight">{t("projects.emptyTitle")}</h2>
            <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
              {t("projects.emptyHint")}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-5 bg-background"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon data-icon="inline-start" />
              {t("projects.createCta")}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            {t("projects.empty")}
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}/overview`}
                className={cn(
                  "group rounded-md border border-border bg-background p-4 no-underline shadow-none",
                  "transition-[border-color,background-color] duration-150",
                  "[@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-card",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {p.name}
                    </div>
                    <code className="mt-1 block truncate text-xs text-muted-foreground">
                      {p.ref}
                    </code>
                  </div>
                  <Badge variant={p.anon_readonly ? "secondary" : "outline"}>
                    {p.anon_readonly ? t("projects.readonly") : t("projects.readwrite")}
                  </Badge>
                </div>
                <div className="mt-4 text-xs text-muted-foreground tabular-nums">
                  {p.created_at}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("projects.colRef")}</TableHead>
                  <TableHead>{t("project.colStatus")}</TableHead>
                  <TableHead className="text-right">{t("projects.colCreated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const href = `/projects/${p.id}/overview`;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      role="link"
                      onClick={() => navigate(href)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(href);
                        }
                      }}
                    >
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        <code className="text-xs">{p.ref}</code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.anon_readonly ? "secondary" : "outline"}>
                          {p.anon_readonly ? t("projects.readonly") : t("projects.readwrite")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {p.created_at}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 md:w-64 lg:w-72">
        <div className="rounded-md border border-border bg-background p-4">
          <div className="text-sm font-semibold tracking-tight">{t("projects.instanceTitle")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("projects.instanceSubtitle")}</p>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="uppercase tracking-wide text-muted-foreground">
                {t("projects.instanceProjects")}
              </span>
              <span className="font-mono tabular-nums text-foreground">{projects.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="uppercase tracking-wide text-muted-foreground">
                {t("projects.instanceReady")}
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                {t("projects.instanceReadyValue")}
              </span>
            </div>
          </div>

          <Button type="button" variant="outline" className="mt-5 w-full bg-background" asChild>
            <a
              href="https://github.com/YoungLee-coder/cfbridge"
              target="_blank"
              rel="noreferrer"
            >
              {t("projects.instanceDocs")}
            </a>
          </Button>
        </div>
      </aside>
      </div>
    </div>
  );
}
