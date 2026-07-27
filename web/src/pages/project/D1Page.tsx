import { useMemo, useState, type FormEvent } from "react";
import { api, ApiClientError } from "@/api";
import { PageHeader } from "@/components/layouts/page-header";
import { useProject } from "@/components/layouts/project-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";

export default function D1Page() {
  const t = useT();
  const { project } = useProject();
  const [sql, setSql] = useState(
    "SELECT name FROM sqlite_master WHERE type='table';",
  );
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    if (!result || typeof result !== "object") return null;
    const r = result as {
      result?: Array<{ results?: Record<string, unknown>[] }>;
    };
    const first = r.result?.[0]?.results;
    return first ?? null;
  }, [result]);

  async function run(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.d1Query(project.id, sql);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t("project.queryFailed"));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const columns = rows && rows.length > 0 ? Object.keys(rows[0] as object) : [];

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none">
      <PageHeader
        title={t("project.tabD1")}
        description={t("project.d1PageHint")}
      />

      <form className="flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none" onSubmit={(e) => void run(e)}>
        <div className="shrink-0 border-b border-border bg-background p-3">
          <Textarea
            className="min-h-28 resize-y font-mono text-sm"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            aria-label={t("project.sql")}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("project.running") : t("project.runQuery")}
            </Button>
            {error && (
              <Alert variant="destructive" className="w-full sm:w-auto">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="h-0 min-h-0 flex-1 overflow-auto overscroll-none bg-canvas p-3 scrollbar-none md:p-4">
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("project.result")}
          </div>
          <div className="overflow-hidden rounded-md border border-border bg-background">
            {rows ? (
              rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("project.zeroRows")}
                </p>
              ) : (
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
              )
            ) : result ? (
              <pre className="overflow-x-auto p-4 font-mono text-xs whitespace-pre-wrap">
                {JSON.stringify(result, null, 2)}
              </pre>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("project.runToSee")}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
