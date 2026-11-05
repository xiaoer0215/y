import { t, useLocale } from "../lib/i18n";
import { useState } from "react";
import {
  FileCode,
  Check,
  Copy,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { openConfigFile } from "../lib/api";

interface StatusBadgeProps {
  exists: boolean;
  path: string;
  onReload?: () => void;
  onOpen?: () => void;
  accentColor?: "blue" | "purple" | "emerald" | "orange";
  className?: string;
}

export function StatusBadge({
  exists,
  path,
  onReload,
  onOpen,
  accentColor = "blue",
  className,
}: StatusBadgeProps) {
  useLocale();
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  const handleCopy = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      toast.success(t("ui.4de7e08bd70e"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("ui.f2c6b5167b9a"));
    }
  };

  const handleOpenFile = async () => {
    if (onOpen) {
      onOpen();
      return;
    }
    if (!path) return;
    if (!exists) {
      toast.warning(t("ui.fa8c68b2a0a8"));
      return;
    }
    setOpening(true);
    try {
      const ok = await openConfigFile(path);
      if (ok) {
        toast.success(t("ui.eb2ed44f52a5"));
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs transition-colors",
        "bg-slate-100/80 border-slate-200/90 text-slate-700",
        "dark:bg-[#121524]/80 dark:border-white/10 dark:text-gray-300",
        className,
      )}
    >
      {/* 路径与图标 */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
            accentColor === "blue"
              ? "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
              : accentColor === "emerald"
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                : accentColor === "orange"
                  ? "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
                  : "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
          )}
        >
          <FileCode size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="font-mono text-xs text-slate-800 dark:text-gray-200 block truncate select-all"
            title={path}
          >
            {path || t("ui.a7e84088b522")}
          </span>
        </div>
      </div>

      {/* 状态徽章与操作按钮 */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* 状态指示 */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border",
            exists
              ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400"
              : path
                ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-400"
                : "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400",
          )}
        >
          {exists ? (
            <>
              <CheckCircle2 size={12} className="text-emerald-500" />
              <span>{t("ui.50a31ec4fd63")}</span>
            </>
          ) : path ? (
            <>
              <AlertCircle size={12} className="text-amber-500" />
              <span>{t("ui.a4dfe0d6a0d9")}</span>
            </>
          ) : (
            <>
              <AlertCircle size={12} className="text-rose-500" />
              <span>{t("ui.ef860e597169")}</span>
            </>
          )}
        </div>

        {/* 打开配置文件按钮 */}
        {path && (
          <button
            type="button"
            onClick={handleOpenFile}
            disabled={opening}
            className={cn(
              "p-1 rounded-md transition-colors cursor-pointer",
              exists
                ? "text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10"
                : "text-slate-300 dark:text-gray-600 hover:text-slate-500 hover:bg-slate-200/40 dark:hover:text-gray-400 dark:hover:bg-white/5",
              opening && "opacity-50 cursor-wait",
            )}
            title={exists ? t("ui.f4659695b66f") : t("ui.679f5b7680f0")}
          >
            <ExternalLink size={13} />
          </button>
        )}

        {/* 复制路径按钮 */}
        {path && (
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors cursor-pointer"
            title={t("ui.090e9421463c")}
          >
            {copied ? (
              <Check size={13} className="text-emerald-500" />
            ) : (
              <Copy size={13} />
            )}
          </button>
        )}

        {/* 重新读取配置按钮 */}
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors cursor-pointer"
            title={t("ui.7309e2cf2b4a")}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export default StatusBadge;
