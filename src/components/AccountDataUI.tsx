import { t, useLocale } from "../lib/i18n";
import { useEffect, useRef, type ReactNode } from "react";
import { X, RefreshCw, Loader2 } from "lucide-react";

export const fieldClass =
  "min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-white/10 dark:bg-[#141826] dark:text-gray-200";
export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-white/10 dark:hover:bg-white/5";
export const cardClass =
  "rounded-2xl border border-slate-200/80 bg-white/80 dark:border-white/10 dark:bg-white/[0.025]";

export function DataHeader({
  title,
  description,
  loading,
  refresh,
}: {
  title: string;
  description: string;
  loading: boolean;
  refresh: () => void;
}) {
  useLocale();
  return (
    <header className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      <button
        className={buttonClass}
        onClick={refresh}
        disabled={loading}
        aria-label={t("common.refresh")}
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {t("common.refresh")}
      </button>
    </header>
  );
}

export function DataState({
  loading,
  error,
  empty,
  retry,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  retry: () => void;
}) {
  useLocale();
  if (loading)
    return (
      <div
        role="status"
        className="flex justify-center gap-2 p-12 text-sm text-slate-500"
      >
        <Loader2 size={18} className="animate-spin" />
        {t("ui.1d08846f05c5")}
      </div>
    );
  if (error)
    return (
      <div role="alert" className="p-6 text-sm text-red-500 break-words">
        {error}
        <button className={buttonClass + " ml-3"} onClick={retry}>
          {t("ui.e2d53a6d3a6a")}
        </button>
      </div>
    );
  if (empty)
    return (
      <p className="p-12 text-center text-sm text-slate-500">
        {t("ui.e59bc66ced12")}
      </p>
    );
  return null;
}

export function Pagination({
  page,
  total,
  size,
  setPage,
  visibleCount,
  setSize,
}: {
  page: number;
  total: number;
  size: number;
  setPage: (page: number) => void;
  visibleCount?: number;
  setSize?: (size: number) => void;
}) {
  useLocale();
  const pages = Math.max(1, Math.ceil(total / size));
  const footerRef = useRef<HTMLElement>(null);
  const changePage = (next: number) => {
    const footer = footerRef.current;
    const container = footer?.closest("dialog") ?? footer?.closest(".app-main");
    container?.scrollTo({ top: 0 });
    setPage(next);
  };
  return (
    <footer
      ref={footerRef}
      className="list-pagination flex items-center justify-between gap-3 pt-4 pb-1 text-xs text-slate-500"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        {visibleCount !== undefined && (
          <span className="whitespace-nowrap">
            {t("usage.resultCount", { count: visibleCount, total })}
          </span>
        )}
        {setSize && (
          <label className="flex items-center gap-2 whitespace-nowrap">
            {t("usage.pageSize")}
            <select
              aria-label={t("usage.pageSize")}
              className={fieldClass + " py-1.5"}
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            >
              {[20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="whitespace-nowrap">
          {t("message.1fbb9729f253", { v0: page, v1: pages })}
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          className={buttonClass}
          disabled={page <= 1}
          onClick={() => changePage(page - 1)}
        >
          {t("ui.b41561d80765")}
        </button>
        <button
          className={buttonClass}
          disabled={page >= pages}
          onClick={() => changePage(page + 1)}
        >
          {t("ui.67a246a344ae")}
        </button>
      </div>
    </footer>
  );
}

export function DetailDialog({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
      className={`fixed inset-0 m-auto w-[calc(100%_-_2rem)] ${wide ? "max-w-4xl" : "max-w-2xl"} max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm dark:border-white/10 dark:bg-[#101421] dark:text-gray-200`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#101421]">
        <h2 className="font-semibold break-all">{title}</h2>
        <button
          className={buttonClass}
          aria-label={t("ui.6a3082724a14")}
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <div className="space-y-4 p-5 text-sm">{children}</div>
    </dialog>
  );
}
