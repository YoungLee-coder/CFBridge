import type { Project, ProjectResource, ApiKeyPublic, ApiKeyRole } from "@cfbridge/shared";

export interface ProjectRow {
  id: string;
  ref: string;
  name: string;
  anon_readonly: number;
  created_at: string;
}

export interface ResourceRow {
  id: string;
  project_id: string;
  kind: "kv" | "d1" | "r2";
  cf_id: string;
  name: string;
  created_at: string;
}

export interface ApiKeyRow {
  id: string;
  project_id: string;
  name: string;
  role: ApiKeyRole;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    ref: row.ref,
    name: row.name,
    anon_readonly: row.anon_readonly === 1,
    created_at: row.created_at,
  };
}

export function toResource(row: ResourceRow): ProjectResource {
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    cf_id: row.cf_id,
    name: row.name,
    created_at: row.created_at,
  };
}

export function toApiKeyPublic(row: ApiKeyRow): ApiKeyPublic {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    role: row.role,
    key_prefix: row.key_prefix,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}
