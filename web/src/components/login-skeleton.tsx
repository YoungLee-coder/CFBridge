import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";

/** Login-shaped placeholder so boot/auth waits don't flash a different screen. */
export function LoginSkeleton({ label }: { label: string }) {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-canvas p-6">
      <div className="animate-login-chrome absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div
        className="animate-skeleton-in w-full max-w-[360px] space-y-8"
        aria-busy="true"
        aria-label={label}
      >
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="size-10 rounded-md" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="space-y-4 rounded-md border border-border bg-background p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
