import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpenIcon,
  DatabaseIcon,
  FolderKanbanIcon,
  HomeIcon,
  KeyRoundIcon,
  LogOutIcon,
  SearchIcon,
  ServerIcon,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandMenu } from "@/components/command-menu";
import { ProjectSwitcher } from "@/components/project-switcher";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/auth";
import {
  ProjectToolsProvider,
  useProjectTools,
} from "@/components/layouts/project-tools-context";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

type RailItem = {
  to: string;
  label: string;
  icon: typeof HomeIcon;
  end?: boolean;
  match?: (pathname: string) => boolean;
};

function DashboardChrome({ children }: { children?: ReactNode }) {
  const { logout } = useAuth();
  const t = useT();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const projectMatch = useMatch("/projects/:id/*");
  const projectId = projectMatch?.params.id;
  const [cmdOpen, setCmdOpen] = useState(false);

  const inProject = Boolean(projectId);
  const { tools } = useProjectTools();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function closeMobile() {
    if (isMobile) setOpenMobile(false);
  }

  const homeItems: RailItem[] = [
    {
      to: "/",
      label: t("app.projects"),
      icon: FolderKanbanIcon,
      end: true,
      match: (p) => p === "/",
    },
  ];

  const projectItems: RailItem[] = [];
  if (projectId) {
    projectItems.push(
      {
        to: `/projects/${projectId}/overview`,
        label: t("project.tabOverview"),
        icon: HomeIcon,
        match: (p) => p.includes("/overview"),
      },
      {
        to: `/projects/${projectId}/keys`,
        label: t("project.tabKeys"),
        icon: KeyRoundIcon,
        match: (p) => p.includes("/keys"),
      },
    );
    if (tools?.hasKv) {
      projectItems.push({
        to: `/projects/${projectId}/kv`,
        label: t("project.tabRedis"),
        icon: ServerIcon,
        match: (p) => p.includes("/kv"),
      });
    }
    if (tools?.hasD1) {
      projectItems.push({
        to: `/projects/${projectId}/d1`,
        label: t("project.tabD1"),
        icon: DatabaseIcon,
        match: (p) => p.includes("/d1"),
      });
    }
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:border-b-0 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:py-3">
          <NavLink
            to="/"
            end
            onClick={closeMobile}
            className="flex items-center gap-2.5 rounded-md no-underline hover:no-underline group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center"
            aria-label="CFBridge"
          >
            <BrandMark tiled />
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-medium tracking-tight text-sidebar-foreground">
                CFBridge
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {t("app.adminBadge")}
              </span>
            </span>
          </NavLink>
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-2 group-data-[collapsible=icon]:hidden">
              {t("app.navBrowse")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {homeItems.map((item) => {
                  const active = item.match
                    ? item.match(location.pathname)
                    : false;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        className="data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground group-data-[collapsible=icon]:[&>span]:hidden"
                      >
                        <NavLink to={item.to} end={item.end} onClick={closeMobile}>
                          <item.icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {inProject && projectItems.length > 0 ? (
            <>
              <SidebarSeparator className="my-3 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:w-6" />
              <SidebarGroup className="p-0">
                <SidebarGroupLabel className="px-2 group-data-[collapsible=icon]:hidden">
                  {t("app.currentProject")}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {projectItems.map((item) => {
                      const active = item.match
                        ? item.match(location.pathname)
                        : false;
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                            className="data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground group-data-[collapsible=icon]:[&>span]:hidden"
                          >
                            <NavLink to={item.to} onClick={closeMobile}>
                              <item.icon />
                              <span>{item.label}</span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="gap-1 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:items-center">
          <SidebarMenu className="group-data-[collapsible=icon]:items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={t("app.docs")}
                className="group-data-[collapsible=icon]:[&>span]:hidden"
              >
                <NavLink to="/docs" onClick={closeMobile}>
                  <BookOpenIcon />
                  <span>{t("app.docs")}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("app.logout")}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive group-data-[collapsible=icon]:[&>span]:hidden"
                onClick={() => {
                  closeMobile();
                  void logout();
                }}
              >
                <LogOutIcon />
                <span>{t("app.logout")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-canvas">
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-4">
          <SidebarTrigger className="md:hidden" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden text-sm font-medium tracking-tight sm:inline">
              CFBridge
            </span>
            <Badge
              variant="secondary"
              className="hidden rounded-full px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide sm:inline-flex"
            >
              {t("app.adminBadge")}
            </Badge>
            <span className="hidden text-border sm:inline">/</span>
            <ProjectSwitcher />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "hidden h-8 gap-2 border-border bg-muted/40 px-2.5 text-xs text-muted-foreground shadow-none sm:inline-flex",
              )}
              onClick={() => setCmdOpen(true)}
            >
              <SearchIcon className="size-3.5" />
              <span>{t("app.searchPlaceholder")}</span>
              <kbd className="pointer-events-none inline-flex h-[18px] items-center rounded border border-border bg-background px-1.5 font-sans text-[10px] leading-none tracking-tight">
                <span className="inline-flex items-center" aria-hidden>
                  ⌘
                </span>
                <span className="inline-flex items-center">K</span>
              </kbd>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="sm:hidden"
              aria-label={t("app.searchPlaceholder")}
              onClick={() => setCmdOpen(true)}
            >
              <SearchIcon />
            </Button>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
          {children ?? <Outlet />}
        </div>
      </SidebarInset>

      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  );
}

export function DashboardLayout({ children }: { children?: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={false}>
      <ProjectToolsProvider>
        <DashboardChrome>{children}</DashboardChrome>
      </ProjectToolsProvider>
    </SidebarProvider>
  );
}
