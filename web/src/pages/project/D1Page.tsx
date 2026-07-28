import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import type { D1SchemaTable } from "@cfbridge/shared";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { api, ApiClientError } from "@/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { downloadText, rowsToCsv } from "@/lib/export-table";
import { loadHistory, pushHistory } from "@/lib/query-history";
import { isWriteSql } from "@/lib/sql-write";

type ResultSet = {
  results?: Record<string, unknown>[] | unknown;
  meta?: {
    changes?: number;
    duration?: number;
    rows_read?: number;
    rows_written?: number;
    last_row_id?: number;
    size_after?: number;
    changed_db?: boolean;
  };
  success?: boolean;
  error?: string;
};

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function isRowArray(
  results: unknown,
): results is Record<string, unknown>[] {
  if (!Array.isArray(results)) return false;
  if (results.length === 0) return true;
  const first = results[0];
  return typeof first === "object" && first !== null && !Array.isArray(first);
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const t = useT();
  const columns =
    rows.length > 0 ? Object.keys(rows[0] as object) : [];

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        {t("project.zeroRows")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead key={col} className="font-mono text-xs">
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col}>
                  <code className="text-xs">
                    {String((row as Record<string, unknown>)[col] ?? "")}
                  </code>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ResultSetPanel({ set, index }: { set: ResultSet; index: number }) {
  const t = useT();
  const rows = isRowArray(set.results) ? set.results : null;
  const metaParts: string[] = [];

  if (rows) {
    metaParts.push(t("project.rowsCount", { count: rows.length }));
  }
  if (set.meta?.changes != null) {
    metaParts.push(t("project.changesMeta", { changes: set.meta.changes }));
  }
  if (set.meta?.duration != null) {
    metaParts.push(t("project.durationMs", { ms: set.meta.duration }));
  }

  return (
    <div className="space-y-2">
      {set.error && (
        <Alert variant="destructive">
          <AlertDescription>{set.error}</AlertDescription>
        </Alert>
      )}
      {metaParts.length > 0 && (
        <p className="text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
      )}
      {rows ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(
                  `result-${index + 1}.csv`,
                  rowsToCsv(rows),
                  "text/csv;charset=utf-8",
                )
              }
            >
              {t("project.exportCsv")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(
                  `result-${index + 1}.json`,
                  JSON.stringify(rows, null, 2),
                  "application/json;charset=utf-8",
                )
              }
            >
              {t("project.exportJson")}
            </Button>
          </div>
          <ResultTable rows={rows} />
        </div>
      ) : set.results != null ? (
        <pre className="overflow-x-auto rounded-md border border-border bg-background p-4 font-mono text-xs whitespace-pre-wrap">
          {JSON.stringify(set.results, null, 2)}
        </pre>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("project.zeroRows")}
        </p>
      )}
    </div>
  );
}

function SchemaTableRow({
  table,
  onPreview,
}: {
  table: D1SchemaTable;
  onPreview: (name: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <div className="flex w-full items-stretch hover:bg-muted">
        <button
          type="button"
          className="flex shrink-0 items-center px-2 text-muted-foreground outline-none hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={table.name}
        >
          {open ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 truncate py-2 pr-3 text-left font-mono text-xs outline-none"
          title={t("project.previewTable", { name: table.name })}
          onClick={() => onPreview(table.name)}
        >
          <span className="min-w-0 flex-1 truncate">{table.name}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground uppercase">
            {table.type}
          </span>
        </button>
      </div>
      {open && (
        <ul className="border-t border-border bg-muted/30 pb-2 pl-6">
          {table.columns.map((col) => (
            <li
              key={col.name}
              className="flex gap-2 py-1 pr-2 font-mono text-[11px]"
            >
              <span className="min-w-0 flex-1 truncate">{col.name}</span>
              <span className="shrink-0 text-muted-foreground">{col.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function D1Page() {
  const t = useT();
  const { project, resources } = useProject();
  const hasD1 = resources.some((r) => r.kind === "d1");

  const [sql, setSql] = useState(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%';",
  );
  const [paramsText, setParamsText] = useState("[]");
  const [showParams, setShowParams] = useState(false);
  const [resultSets, setResultSets] = useState<ResultSet[] | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeConfirmOpen, setWriteConfirmOpen] = useState(false);
  const [schema, setSchema] = useState<D1SchemaTable[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [history, setHistory] = useState(() => loadHistory(project.id));
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadSchema = async () => {
    setSchemaBusy(true);
    setSchemaError(null);
    try {
      const res = await api.d1Schema(project.id);
      setSchema(res.tables);
    } catch (err) {
      setSchemaError(
        err instanceof ApiClientError ? err.message : t("project.schemaFailed"),
      );
    } finally {
      setSchemaBusy(false);
    }
  };

  useEffect(() => {
    void loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  if (!hasD1) {
    return <Navigate to={`/projects/${project.id}/overview`} replace />;
  }

  function parseParams(): unknown[] {
    const trimmed = paramsText.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("not array");
      }
      return parsed;
    } catch {
      const parts = trimmed.split(",").map((s) => s.trim());
      return parts.map((p) => {
        try {
          return JSON.parse(p) as unknown;
        } catch {
          return p;
        }
      });
    }
  }

  async function executeQuery(sqlOverride?: string) {
    const querySql = sqlOverride ?? sql;
    if (busy) return;
    setBusy(true);
    setError(null);
    // Keep previous results visible until the new response arrives (avoids empty-state flash).
    const started = Date.now();
    try {
      const params = sqlOverride != null ? [] : parseParams();
      const res = await api.d1Query(project.id, querySql, params);
      setDurationMs(Date.now() - started);
      setRawResponse(res);
      pushHistory(project.id, querySql);
      setHistory(loadHistory(project.id));

      if (!res.success && res.errors?.length) {
        setError(
          String(
            (res.errors[0] as { message?: string })?.message ??
              JSON.stringify(res.errors[0]),
          ),
        );
      }

      if (Array.isArray(res.result)) {
        setResultSets(res.result as ResultSet[]);
      } else if (res.result != null) {
        setResultSets([{ results: res.result }]);
      } else {
        setResultSets([]);
      }
    } catch (err) {
      setDurationMs(Date.now() - started);
      setError(err instanceof ApiClientError ? err.message : t("project.queryFailed"));
    } finally {
      setBusy(false);
      setWriteConfirmOpen(false);
    }
  }

  function run(e: FormEvent) {
    e.preventDefault();
    if (isWriteSql(sql)) {
      setWriteConfirmOpen(true);
      return;
    }
    void executeQuery();
  }

  function previewTable(name: string) {
    const q = `SELECT * FROM ${quoteIdent(name)} LIMIT 100;`;
    setSql(q);
    if (isWriteSql(q)) return;
    void executeQuery(q);
  }

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader title={t("project.tabD1")} />

      <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-border bg-background lg:w-64 lg:border-r lg:border-b-0">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3">
            <span className="text-xs font-medium">{t("project.schema")}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={schemaBusy}
              onClick={() => void loadSchema()}
            >
              {t("project.refresh")}
            </Button>
          </div>
          <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-none scrollbar-none">
            {schemaError && (
              <p className="px-3 py-4 text-xs text-destructive">{schemaError}</p>
            )}
            {!schemaError && schema.length === 0 && !schemaBusy && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {t("project.schemaEmpty")}
              </p>
            )}
            {schema.map((table) => (
              <SchemaTableRow
                key={`${table.type}-${table.name}`}
                table={table}
                onPreview={previewTable}
              />
            ))}
          </div>
        </aside>

        <form
          className="flex min-w-0 flex-1 flex-col overflow-clip overscroll-none"
          onSubmit={(e) => void run(e)}
        >
          <div className="shrink-0 border-b border-border bg-background p-3">
            <Textarea
              className="min-h-28 resize-y font-mono text-sm"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              aria-label={t("project.sql")}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
                {t("project.runQuery")}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowParams((v) => !v)}
              >
                {t("project.params")}
              </Button>

              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryOpen((v) => !v)}
                >
                  {t("project.history")}
                </Button>
                {historyOpen && (
                  <div className="absolute top-full left-0 z-10 mt-1 max-h-48 w-72 overflow-y-auto rounded-md border border-border bg-background shadow-md">
                    {history.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-muted-foreground">
                        {t("project.historyEmpty")}
                      </p>
                    ) : (
                      <ul>
                        {history.map((entry) => (
                          <li key={entry.at}>
                            <button
                              type="button"
                              className="w-full border-b border-border px-3 py-2 text-left font-mono text-[11px] hover:bg-muted"
                              onClick={() => {
                                setSql(entry.sql);
                                setHistoryOpen(false);
                              }}
                            >
                              <span className="line-clamp-2">{entry.sql}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {busy && (
                <span className="text-xs text-muted-foreground">
                  {t("project.running")}
                </span>
              )}
              {!busy && durationMs != null && (
                <span className="text-xs text-muted-foreground">
                  {t("project.durationMs", { ms: durationMs })}
                </span>
              )}
            </div>

            {showParams && (
              <div className="mt-2 space-y-1">
                <Label className="text-xs">{t("project.params")}</Label>
                <Textarea
                  className="min-h-16 font-mono text-xs"
                  value={paramsText}
                  onChange={(e) => setParamsText(e.target.value)}
                  placeholder="[]"
                />
                <p className="text-xs text-muted-foreground">
                  {t("project.paramsHint")}
                </p>
              </div>
            )}
          </div>

          <div className="h-0 min-h-0 flex-1 overflow-auto overscroll-none bg-canvas p-3 scrollbar-none md:p-4">
            <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("project.result")}
            </div>
            {error && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div
              className={
                busy
                  ? "overflow-hidden rounded-md border border-border bg-background opacity-70 transition-opacity"
                  : "overflow-hidden rounded-md border border-border bg-background transition-opacity"
              }
            >
              {resultSets == null ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("project.runToSee")}
                </p>
              ) : resultSets.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("project.zeroRows")}
                </p>
              ) : resultSets.length === 1 ? (
                <div className="p-3">
                  <ResultSetPanel set={resultSets[0]!} index={0} />
                </div>
              ) : (
                <Tabs defaultValue="0" className="p-3">
                  <TabsList variant="line" className="mb-3">
                    {resultSets.map((_, i) => (
                      <TabsTrigger key={i} value={String(i)}>
                        {t("project.resultSetN", { n: i + 1 })}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {resultSets.map((set, i) => (
                    <TabsContent key={i} value={String(i)}>
                      <ResultSetPanel set={set} index={i} />
                    </TabsContent>
                  ))}
                </Tabs>
              )}

              {rawResponse != null && resultSets != null && (
                <details className="border-t border-border p-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t("project.rawResult")}
                  </summary>
                  <pre className="mt-2 overflow-x-auto font-mono text-xs whitespace-pre-wrap">
                    {JSON.stringify(rawResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={writeConfirmOpen}
        title={t("project.writeConfirmTitle")}
        body={t("project.writeConfirmBody")}
        confirmLabel={t("project.runQuery")}
        busy={busy}
        onCancel={() => {
          if (!busy) setWriteConfirmOpen(false);
        }}
        onConfirm={() => void executeQuery()}
      />
    </div>
  );
}
