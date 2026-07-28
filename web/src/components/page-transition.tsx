import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Soft-rise the main pane on pathname change without remounting nested layouts. */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (isFirst.current) {
      isFirst.current = false;
      el.classList.add("animate-page-enter");
      return;
    }

    el.classList.remove("animate-page-enter");
    void el.offsetWidth;
    el.classList.add("animate-page-enter");
  }, [pathname]);

  return (
    <div
      ref={ref}
      className={cn(
        "flex h-0 min-h-0 flex-1 flex-col overflow-clip overscroll-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
