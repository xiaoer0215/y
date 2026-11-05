import { t, useLocale } from "../lib/i18n";
import { useState } from "react";
import { FileCode, FolderOpen, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { openConfigFile } from "../lib/api";

export interface ConfigPathBarProps {
  path?: string;
  shortPath: string;
  exists: boolean;
  accentColor?: "blue" | "purple" | "emerald" | "orange";
  className?: string;
}

export function ConfigPathBar({
  path,
  shortPath,
  exists,
  accentColor = "blue",
  className,
}: ConfigPathBarProps) {
  useLocale();
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleCopy = async () => {
    const textToCopy = path || shortPath;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success(t("ui.4de7e08bd70e"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("ui.f2c6b5167b9a"));
    }
  };

  const handleOpen = async () => {
    if (!exists) {
      toast.warning(t("ui.fa8c68b2a0a8"));
      return;
    }
    const target = path || shortPath;
    if (!target) return;
    setOpening(true);
    try {
      const ok = await openConfigFile(target);
      if (ok) {
        toast.success(t("ui.eb2ed44f52a5"));
      }
    } finally {
      setOpening(false);
    }
  };

  const accentBtnStyle = {
    blue: "text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-500/10",
    purple:
      "text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-500/10",
    emerald:
      "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-500/10",
    orange:
      "text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-500/10",
  }[accentColor];

  return (
    <div
      className={cn(
        "config-path-bar flex h-9 min-w-0 items-center gap-2 px-3 rounded-md border text-xs transition-colors",
        "bg-white border-slate-200 text-slate-700",
        "dark:bg-white/5 dark:border-white/10 dark:text-gray-300",
        className,
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          exists ? "bg-emerald-500" : "bg-amber-400",
        )}
        title={exists ? t("ui.7fff71ec9e58") : t("ui.060a29799366")}
      />
      <FileCode
        size={13}
        className="text-slate-400 dark:text-gray-400 shrink-0"
      />
      <span
        className="min-w-0 flex-1 font-mono text-[11px] text-slate-600 dark:text-gray-300 truncate select-all"
        title={path || shortPath}
      >
        {shortPath}
      </span>

      <button
        type="button"
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title={t("ui.db7a35400958")}
      >
        {copied ? (
          <Check size={12} className="text-emerald-500" />
        ) : (
          <Copy size={12} />
        )}
      </button>

      <span className="w-px h-3 bg-slate-200 dark:bg-white/10 mx-0.5 shrink-0" />

      <button
        type="button"
        onClick={handleOpen}
        disabled={opening}
        className={cn(
          "flex h-7 items-center gap-1.5 whitespace-nowrap px-2 rounded text-xs font-medium transition-colors cursor-pointer shrink-0",
          accentBtnStyle,
          opening && "opacity-50 cursor-wait",
        )}
        title={exists ? t("ui.76cf8f37360a") : t("ui.0bff00b9624e")}
      >
        <FolderOpen size={12} />
        <span>{t("common.open")}</span>
      </button>
    </div>
  );
}

export default ConfigPathBar;
