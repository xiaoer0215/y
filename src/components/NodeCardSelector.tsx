import { t, useLocale } from "../lib/i18n";
import { Server, Check, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import {
  parseApiEndpoints,
  sameEndpoint,
  useSiteContent,
} from "../lib/site-content";

interface NodeCardSelectorProps {
  value: string;
  customUrl?: string;
  onChange: (url: string) => void;
  accentColor?: "blue" | "purple" | "emerald" | "orange";
  className?: string;
}

export function NodeCardSelector({
  value,
  onChange,
  accentColor = "blue",
  className,
}: NodeCardSelectorProps) {
  useLocale();
  const site = useSiteContent();
  const endpoints = parseApiEndpoints(site?.api_endpoints);
  const isBlue = accentColor === "blue";
  const isEmerald = accentColor === "emerald";
  const isOrange = accentColor === "orange";

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", className)}>
      {endpoints.length === 0 && (
        <p
          role="status"
          className="col-span-full py-3 text-xs text-amber-600 dark:text-amber-400"
        >
          {t(site ? "feature.noApiEndpoints" : "feature.loadingApiEndpoints")}
        </p>
      )}
      {endpoints.map(({ url, isDefault }) => {
        const selected = sameEndpoint(value, url);
        const meta = {
          name: isDefault ? t("nodes.primary") : t("nodes.backup"),
          tag: isDefault ? t("nodes.default") : t("nodes.backupTag"),
          description: t("nodes.siteConfigured"),
        };

        return (
          <button
            key={url}
            type="button"
            onClick={() => onChange(url)}
            className={cn(
              "group relative w-full flex flex-col p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer",
              selected
                ? isBlue
                  ? "border-blue-500 bg-blue-50/90 dark:bg-blue-500/10 dark:border-blue-500/80 shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/30"
                  : isEmerald
                    ? "border-emerald-500 bg-emerald-50/90 dark:bg-emerald-500/10 dark:border-emerald-500/80 shadow-xs dark:shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                    : isOrange
                      ? "border-orange-500 bg-orange-50/90 dark:bg-orange-500/10 dark:border-orange-500/80 shadow-xs dark:shadow-[0_0_20px_rgba(255,106,0,0.15)] ring-1 ring-orange-500/30"
                      : "border-purple-500 bg-purple-50/90 dark:bg-purple-500/10 dark:border-purple-500/80 shadow-xs dark:shadow-[0_0_20px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30"
                : "border-slate-200/90 dark:border-white/10 bg-white/70 dark:bg-[#141724]/60 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50/80 dark:hover:bg-[#191c2b]/80",
            )}
          >
            {/* 顶栏：图标、名称、标签与选中勾选 */}
            <div className="flex items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    selected
                      ? isBlue
                        ? "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
                        : isEmerald
                          ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : isOrange
                            ? "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400"
                            : "bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300"
                      : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-300",
                  )}
                >
                  <Server size={16} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={cn(
                        "text-xs font-semibold transition-colors truncate",
                        selected
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-700 dark:text-gray-300 group-hover:text-slate-900 dark:group-hover:text-white",
                      )}
                    >
                      {meta.name}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-mono font-medium",
                        selected
                          ? isBlue
                            ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30"
                            : isEmerald
                              ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                              : isOrange
                                ? "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30"
                                : "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30"
                          : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-white/10",
                      )}
                    >
                      {meta.tag}
                    </span>
                  </div>
                </div>
              </div>

              {/* 选中指示圆圈 */}
              <div
                className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center border transition-all flex-shrink-0",
                  selected
                    ? isBlue
                      ? "border-blue-600 dark:border-blue-500 bg-blue-600 dark:bg-blue-500 text-white"
                      : isEmerald
                        ? "border-emerald-600 dark:border-emerald-500 bg-emerald-600 dark:bg-emerald-500 text-white"
                        : isOrange
                          ? "border-orange-600 dark:border-orange-500 bg-orange-600 dark:border-orange-500 text-white"
                          : "border-purple-600 dark:border-purple-500 bg-purple-600 dark:border-purple-500 text-white"
                    : "border-slate-300 dark:border-white/20 bg-transparent group-hover:border-slate-400 dark:group-hover:border-white/40",
                )}
              >
                {selected && <Check size={10} strokeWidth={3} />}
              </div>
            </div>

            {/* 描述与 URL */}
            <div className="mt-2.5 text-left w-full">
              <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed line-clamp-1">
                {meta.description}
              </p>
              <div className="flex items-center gap-1 mt-1 text-[11px] font-mono text-slate-400 dark:text-gray-500">
                <Zap
                  size={11}
                  className={
                    selected
                      ? isBlue
                        ? "text-blue-500"
                        : isEmerald
                          ? "text-emerald-500"
                          : isOrange
                            ? "text-orange-500"
                            : "text-purple-500"
                      : "opacity-60"
                  }
                />
                <span className="truncate">{url}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default NodeCardSelector;
