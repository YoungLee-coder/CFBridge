import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useT();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={t("app.toggleTheme")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="relative size-4">
        <SunIcon
          className={`absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ${
            isDark ? "scale-50 opacity-0 blur-sm" : "scale-100 opacity-100 blur-0"
          }`}
        />
        <MoonIcon
          className={`absolute inset-0 size-4 transition-[opacity,transform,filter] duration-200 ${
            isDark ? "scale-100 opacity-100 blur-0" : "scale-50 opacity-0 blur-sm"
          }`}
        />
      </span>
    </Button>
  );
}
