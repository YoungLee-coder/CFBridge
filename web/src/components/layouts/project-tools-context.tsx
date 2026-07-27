import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProjectResource } from "@cfbridge/shared";

export type ProjectTools = {
  hasKv: boolean;
  hasD1: boolean;
};

type ProjectToolsContextValue = {
  tools: ProjectTools | null;
  setFromResources: (resources: ProjectResource[] | null) => void;
};

const ProjectToolsContext = createContext<ProjectToolsContextValue | null>(
  null,
);

export function toolsFromResources(
  resources: ProjectResource[],
): ProjectTools {
  return {
    hasKv: resources.some((r) => r.kind === "kv"),
    hasD1: resources.some((r) => r.kind === "d1"),
  };
}

export function ProjectToolsProvider({ children }: { children: ReactNode }) {
  const [tools, setTools] = useState<ProjectTools | null>(null);

  const setFromResources = useCallback(
    (resources: ProjectResource[] | null) => {
      setTools(resources ? toolsFromResources(resources) : null);
    },
    [],
  );

  const value = useMemo(
    () => ({ tools, setFromResources }),
    [tools, setFromResources],
  );

  return (
    <ProjectToolsContext.Provider value={value}>
      {children}
    </ProjectToolsContext.Provider>
  );
}

export function useProjectTools() {
  const ctx = useContext(ProjectToolsContext);
  if (!ctx) {
    throw new Error("useProjectTools must be used within ProjectToolsProvider");
  }
  return ctx;
}
