import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, FolderKanbanIcon } from "lucide-react";
import { useNavigate, useMatch } from "react-router-dom";
import type { Project } from "@cfbridge/shared";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function ProjectSwitcher() {
  const t = useT();
  const navigate = useNavigate();
  const projectMatch = useMatch("/projects/:id/*");
  const id = projectMatch?.params.id;
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const current = projects.find((p) => p.id === id);
  const label = current?.name ?? (id ? (loading ? t("common.loading") : id) : t("app.projects"));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 max-w-[14rem] gap-1.5 px-2 font-normal"
          aria-label={t("app.projectSwitcher")}
        >
          <FolderKanbanIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm">{label}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
            !id && "bg-accent",
          )}
          onClick={() => {
            setOpen(false);
            navigate("/");
          }}
        >
          <FolderKanbanIcon className="size-3.5 text-muted-foreground" />
          <span className="flex-1 truncate">{t("app.allProjects")}</span>
          {!id ? <CheckIcon className="size-3.5 text-primary" /> : null}
        </button>
        <div className="my-1 h-px bg-border" />
        {loading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("common.loading")}</p>
        ) : projects.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t("projects.empty")}</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto">
            {projects.map((p) => {
              const active = p.id === id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent",
                      active && "bg-accent",
                    )}
                    onClick={() => {
                      setOpen(false);
                      navigate(`/projects/${p.id}/overview`);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <code className="block truncate text-[10px] text-muted-foreground">
                        {p.ref}
                      </code>
                    </span>
                    {active ? <CheckIcon className="size-3.5 shrink-0 text-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
