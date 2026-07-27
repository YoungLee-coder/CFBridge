import { useCallback, useEffect, useState } from "react";
import {
  BookOpenIcon,
  DatabaseIcon,
  FolderKanbanIcon,
  HomeIcon,
  KeyRoundIcon,
  LogOutIcon,
  ServerIcon,
} from "lucide-react";
import { useNavigate, useMatch } from "react-router-dom";
import type { Project } from "@cfbridge/shared";
import { api } from "@/api";
import { useAuth } from "@/auth";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useT } from "@/i18n";

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const projectMatch = useMatch("/projects/:id/*");
  const projectId = projectMatch?.params.id;
  const [projects, setProjects] = useState<Project[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.listProjects();
      setProjects(res.projects);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function go(path: string) {
    onOpenChange(false);
    navigate(path);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("app.commandTitle")}
      description={t("app.commandDescription")}
    >
      <CommandInput placeholder={t("app.commandPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("app.commandEmpty")}</CommandEmpty>
        <CommandGroup heading={t("app.projects")}>
          <CommandItem onSelect={() => go("/")}>
            <FolderKanbanIcon />
            <span>{t("app.allProjects")}</span>
          </CommandItem>
          {projects.map((p) => (
            <CommandItem
              key={p.id}
              value={`${p.name} ${p.ref}`}
              onSelect={() => go(`/projects/${p.id}/overview`)}
            >
              <HomeIcon />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {p.ref}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        {projectId ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("app.currentProject")}>
              <CommandItem onSelect={() => go(`/projects/${projectId}/overview`)}>
                <HomeIcon />
                <span>{t("project.tabOverview")}</span>
              </CommandItem>
              <CommandItem onSelect={() => go(`/projects/${projectId}/keys`)}>
                <KeyRoundIcon />
                <span>{t("project.tabKeys")}</span>
              </CommandItem>
              <CommandItem onSelect={() => go(`/projects/${projectId}/kv`)}>
                <ServerIcon />
                <span>{t("project.tabRedis")}</span>
              </CommandItem>
              <CommandItem onSelect={() => go(`/projects/${projectId}/d1`)}>
                <DatabaseIcon />
                <span>{t("project.tabD1")}</span>
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading={t("app.adminBadge")}>
          <CommandItem onSelect={() => go("/docs")}>
            <BookOpenIcon />
            <span>{t("app.docs")}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              void logout();
            }}
          >
            <LogOutIcon />
            <span>{t("app.logout")}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
