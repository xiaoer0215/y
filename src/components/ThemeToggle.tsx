import { t, useLocale } from "../lib/i18n";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "../lib/utils";
import SegmentedTabs from "./ui/SegmentedTabs";

interface ThemeToggleProps {
  variant?: "icon" | "pills";
  className?: string;
}

export function ThemeToggle({ variant = "icon", className }: ThemeToggleProps) {
  useLocale();
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (variant === "pills") {
    return (
      <SegmentedTabs
        label={t("ui.149791dc60fe")}
        value={theme}
        change={(id) => setTheme(id as "light" | "dark" | "system")}
        className={className}
        tabs={[
          { id: "light", label: t("ui.80ec9e2b1bc4"), icon: <Sun size={14} /> },
          { id: "dark", label: t("ui.30b2c979ac87"), icon: <Moon size={14} /> },
          {
            id: "system",
            label: t("ui.f4bbd91f79ba"),
            icon: <Monitor size={14} />,
          },
        ]}
      />
    );
  }

  // Quick icon button for titlebar
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "w-7 h-7 flex items-center justify-center rounded-lg border transition-all",
        "border-slate-200 dark:border-white/10",
        "bg-slate-100 hover:bg-slate-200 text-slate-700",
        "dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400 dark:hover:text-white",
        className,
      )}
      title={t("ui.f3b1db4d567d", {
        v0: isDark ? t("ui.750642ccd6d4") : t("ui.a17555a1c524"),
      })}
    >
      {isDark ? (
        <Sun
          size={14}
          className="text-amber-400 transition-transform hover:rotate-45"
        />
      ) : (
        <Moon
          size={14}
          className="text-slate-700 transition-transform hover:-rotate-12"
        />
      )}
    </button>
  );
}

export default ThemeToggle;
