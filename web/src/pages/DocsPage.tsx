import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";

export default function DocsPage() {
  const t = useT();
  const { authed } = useAuth();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/docs/api.md");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) {
          setMarkdown(text);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError(t("docs.loadFailed"));
          setMarkdown(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function copyMarkdown() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("docs.copyFailed"));
    }
  }

  const html = markdown ? renderMarkdown(markdown) : "";

  return (
    <div className="animate-page-enter flex h-svh flex-col overflow-clip bg-canvas">
      <header className="shrink-0 border-b border-border/80 bg-canvas/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark className="size-7 shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-medium tracking-tight">
                {t("docs.title")}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {t("docs.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={!markdown}
              onClick={() => void copyMarkdown()}
            >
              {copied ? t("common.copied") : t("docs.copyMarkdown")}
            </Button>
            {authed ? (
              <Button type="button" variant="ghost" size="sm" asChild>
                <Link to="/">{t("docs.backToApp")}</Link>
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" asChild>
                <Link to="/login">{t("docs.signIn")}</Link>
              </Button>
            )}
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="h-0 min-h-0 w-full flex-1 overflow-y-auto overscroll-none">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <section className="space-y-2 rounded-lg border border-border/80 bg-card/40 px-4 py-3 text-sm">
          <p className="font-medium">{t("docs.fetchHeading")}</p>
          <ul className="space-y-1 font-mono text-xs text-muted-foreground">
            <li>
              <a className="text-foreground underline-offset-2 hover:underline" href="/docs/api.md">
                {origin}/docs/api.md
              </a>
              <span className="ml-2 text-muted-foreground">{t("docs.fetchApiMd")}</span>
            </li>
            <li>
              <a className="text-foreground underline-offset-2 hover:underline" href="/llms.txt">
                {origin}/llms.txt
              </a>
              <span className="ml-2 text-muted-foreground">{t("docs.fetchLlms")}</span>
            </li>
            <li>
              <a className="text-foreground underline-offset-2 hover:underline" href="/llms-full.txt">
                {origin}/llms-full.txt
              </a>
              <span className="ml-2 text-muted-foreground">{t("docs.fetchLlmsFull")}</span>
            </li>
          </ul>
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!markdown && !error ? (
          <p className="animate-skeleton-in text-sm text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : null}

        {markdown ? (
          <article
            className={cn(
              "animate-content-enter docs-prose text-sm leading-relaxed text-foreground",
              "[&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
              "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:border-b [&_h2]:border-border/70 [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold",
              "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-medium",
              "[&_p]:my-3 [&_p]:text-muted-foreground",
              "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
              "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted-foreground",
              "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ol]:text-muted-foreground",
              "[&_li]:leading-relaxed",
              "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2",
              "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
              "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/80 [&_pre]:bg-muted/50 [&_pre]:p-3",
              "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
              "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-xs",
              "[&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium",
              "[&_td]:border-b [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-2 [&_td]:align-top [&_td]:text-muted-foreground",
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : null}
        </div>
      </main>
    </div>
  );
}
