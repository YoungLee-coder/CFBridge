import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  /** When true, render as a fixed-size badge (transparent, currentColor). */
  tiled?: boolean;
};

const MARK_PATH =
  "M8 26.5V15.2c0-4.15 3.35-7.55 7.05-8.85L16 3.4l.95 2.95C20.65 7.65 24 11.05 24 15.2v11.3H8Zm3.85 0h8.3V17.1c0-2.35-1.85-4.15-4.15-4.65-2.3.5-4.15 2.3-4.15 4.65v9.4Z";

/** CFBridge keystone-arch mark. Monochrome via currentColor. */
export function BrandMark({ className, tiled = false }: BrandMarkProps) {
  const mark = (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={tiled ? "size-full" : cn("size-full", className)}
      aria-hidden
    >
      <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );

  if (!tiled) return mark;

  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center text-foreground",
        className,
      )}
      aria-hidden
    >
      {mark}
    </span>
  );
}
