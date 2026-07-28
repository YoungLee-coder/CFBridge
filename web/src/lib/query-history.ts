export type QueryHistoryEntry = { sql: string; at: number };

const MAX = 30;

function key(projectId: string) {
  return `cfbridge_d1_history_${projectId}`;
}

export function loadHistory(projectId: string): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is QueryHistoryEntry =>
          typeof e === "object" &&
          e !== null &&
          typeof (e as QueryHistoryEntry).sql === "string" &&
          typeof (e as QueryHistoryEntry).at === "number",
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushHistory(projectId: string, sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) return;
  const prev = loadHistory(projectId).filter((e) => e.sql !== trimmed);
  const next: QueryHistoryEntry[] = [
    { sql: trimmed, at: Date.now() },
    ...prev,
  ].slice(0, MAX);
  try {
    localStorage.setItem(key(projectId), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}
