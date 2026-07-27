import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Navigate, Outlet, useParams, useSearchParams } from "react-router-dom";
import type { ApiKeyPublic, Project, ProjectResource } from "@cfbridge/shared";
import { api, ApiClientError } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";

const PROJECT_SECTIONS = ["overview", "keys", "kv", "d1"] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

function isSection(v: string | null): v is ProjectSection {
  return v !== null && (PROJECT_SECTIONS as readonly string[]).includes(v);
}

type ProjectContextValue = {
  project: Project;
  resources: ProjectResource[];
  keys: ApiKeyPublic[];
  error: string | null;
  setError: (e: string | null) => void;
  reload: () => Promise<void>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectLayout");
  return ctx;
}

export function ProjectTabRedirect() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const section = isSection(tab) ? tab : "overview";
  return <Navigate to={`/projects/${id}/${section}`} replace />;
}

export function ProjectLayout() {
  const { id = "" } = useParams();
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;
  const [project, setProject] = useState<Project | null>(null);
  const [resources, setResources] = useState<ProjectResource[]>([]);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProject(id);
      setProject(res.project);
      setResources(res.resources);
      const keyRes = await api.listKeys(res.project.id);
      setKeys(keyRes.keys);
    } catch (err) {
      setProject(null);
      setError(
        err instanceof ApiClientError
          ? err.message
          : tRef.current("common.failedLoad"),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<ProjectContextValue | null>(() => {
    if (!project) return null;
    return { project, resources, keys, error, setError, reload };
  }, [project, resources, keys, error, reload]);

  if (loading) {
    return (
      <div className="space-y-3 p-4 md:p-6" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!project || !value) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Alert variant="destructive">
          <AlertDescription>{error || t("project.notFound")}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link to="/">{t("common.back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ProjectContext.Provider value={value}>
      <div className="flex h-0 min-h-0 min-w-0 flex-1 flex-col overflow-clip overscroll-none">
        {error ? (
          <div className="shrink-0 border-b border-border px-4 py-2 md:px-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}
        <Outlet />
      </div>
    </ProjectContext.Provider>
  );
}
