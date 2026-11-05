import { useGroupDisplayName } from "../lib/site-content";
import { t, useLocale, getLocale } from "../lib/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { getUsageLogs, isTauri } from "../lib/api";
import {
  logTypes,
  usd,
  usageMetadata,
  type UsageLog,
  type UsagePage,
  type UsageQuery,
  type UsageSummary,
  summarizeUsageLogs,
} from "../lib/account-data";
import {
  buttonClass,
  cardClass,
  DataHeader,
  DataState,
  DetailDialog,
  fieldClass,
  Pagination,
} from "./AccountDataUI";
import {
  Activity,
  ArrowDownUp,
  Check,
  Clock3,
  Coins,
  Copy,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import ModelIcon from "./ModelIcon";

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const initialFilters = () => ({
  start: localDate(new Date()),
  end: localDate(new Date()),
  model: "",
  token: "",
  group: "",
  request: "",
  type: "0",
});
type Filters = ReturnType<typeof initialFilters>;

function buildQuery(filters: Filters): UsageQuery {
  const start = filters.start
    ? Math.floor(new Date(filters.start + "T00:00:00").getTime() / 1000)
    : undefined;
  const end = filters.end
    ? Math.floor(new Date(filters.end + "T23:59:59").getTime() / 1000)
    : undefined;
  if (
    (start !== undefined && !Number.isFinite(start)) ||
    (end !== undefined && !Number.isFinite(end)) ||
    (start !== undefined && end !== undefined && start > end)
  )
    throw new Error(t("ui.56c191dc7355"));
  return {
    p: 1,
    page_size: 20,
    type: Number(filters.type),
    start_timestamp: start,
    end_timestamp: end,
    model_name: filters.model.trim() || undefined,
    token_name: filters.token.trim() || undefined,
    group: filters.group.trim() || undefined,
    request_id: filters.request.trim() || undefined,
  };
}

function formatAdditionalData(value?: string): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function formatRatio(value: number) {
  return `${value.toLocaleString(getLocale(), { maximumFractionDigits: 8 })}×`;
}

function formatSeconds(value: number) {
  return `${value.toLocaleString(getLocale(), { maximumFractionDigits: 3 })}s`;
}

function formatCount(value: number) {
  return value.toLocaleString(getLocale());
}

export default function UsageLogsPanel({
  quotaPerUnit = 500000,
  initialToken = "",
}: {
  quotaPerUnit?: number;
  initialToken?: string;
}) {
  useLocale();
  const groupName = useGroupDisplayName();
  const [filters, setFilters] = useState(() => ({
    ...initialFilters(),
    token: initialToken,
  }));
  const [query, setQuery] = useState(() =>
    buildQuery({ ...initialFilters(), token: initialToken }),
  );
  const [data, setData] = useState<UsagePage | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<UsageLog | null>(null);
  const [expanded, setExpanded] = useState(Boolean(initialToken));
  const [range, setRange] = useState("1");
  const [copiedRequestId, setCopiedRequestId] = useState<string | null>(null);
  const selectedMeta = selected ? usageMetadata(selected) : null;
  const unit =
    Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelected(null);
    getUsageLogs(query)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, version]);
  const summaryQueryKey = JSON.stringify({ ...query, p: 1, page_size: 100 });
  useEffect(() => {
    let active = true;
    const summaryQuery: UsageQuery = {
      ...query,
      p: 1,
      page_size: 100,
    };
    setSummary(null);
    setSummaryLoading(true);
    setSummaryError("");
    const loadSummary = async () => {
      try {
        const firstPage = await getUsageLogs(summaryQuery);
        if (!active) return;
        if (firstPage.total > 50000) {
          throw new Error(t("usage.summaryTooMany"));
        }
        const rows = [...(firstPage.items ?? [])];
        const pages = Math.ceil(firstPage.total / summaryQuery.page_size);
        for (let start = 2; start <= pages; start += 5) {
          const pageResults = await Promise.all(
            Array.from({ length: Math.min(5, pages - start + 1) }, (_, index) =>
              getUsageLogs({ ...summaryQuery, p: start + index }),
            ),
          );
          if (!active) return;
          for (const result of pageResults) rows.push(...(result.items ?? []));
        }
        setSummary(summarizeUsageLogs(rows, unit));
      } catch (e) {
        if (active) setSummaryError(String(e));
      } finally {
        if (active) setSummaryLoading(false);
      }
    };
    void loadSummary();
    return () => {
      active = false;
    };
  }, [summaryQueryKey, version]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    try {
      setQuery({ ...buildQuery(filters), page_size: query.page_size });
      setFormError("");
    } catch (e) {
      setFormError(String(e));
    }
  };
  const reset = () => {
    const next = initialFilters();
    setFilters(next);
    setQuery({ ...buildQuery(next), page_size: query.page_size });
    setFormError("");
    setRange("1");
  };
  const copyRequestId = async (requestId?: string) => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      setCopiedRequestId(requestId);
      window.setTimeout(
        () =>
          setCopiedRequestId((current) =>
            current === requestId ? null : current,
          ),
        1600,
      );
    } catch {
      setCopiedRequestId(null);
      toast.error(t("usage.copyFailed"));
    }
  };
  const field = (
    key: keyof Filters,
    label: string,
    type = "text",
    placeholder?: string,
  ) => (
    <label className="flex flex-col gap-1.5 min-w-0 text-[11px] text-slate-500">
      {label}
      <input
        aria-label={label}
        type={type}
        placeholder={placeholder}
        className={fieldClass}
        value={filters[key]}
        onChange={(e) => {
          setFilters((v) => ({ ...v, [key]: e.target.value }));
          if (key === "start" || key === "end") setRange("custom");
        }}
      />
    </label>
  );
  return (
    <section className="w-full text-slate-700 dark:text-gray-300">
      <DataHeader
        title={t("ui.909aa7771381")}
        description={t("ui.d606af95d901")}
        loading={loading}
        refresh={() => setVersion((v) => v + 1)}
      />
      <div
        className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5"
        aria-label={t("usage.summary")}
      >
        {[
          {
            label: t("usage.summaryCalls"),
            value: summaryLoading ? "…" : formatCount(summary?.calls ?? 0),
            icon: Activity,
            tone: "border-sky-500 text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-400/10",
          },
          {
            label: t("usage.summaryCost"),
            value: summaryLoading ? "…" : usd(summary?.cost ?? 0),
            icon: Coins,
            tone: "border-emerald-500 text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-400/10",
          },
          {
            label: t("usage.summaryTotalTokens"),
            value: summaryLoading
              ? "…"
              : formatCount(summary?.totalTokens ?? 0),
            icon: Hash,
            tone: "border-indigo-500 text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-400/10",
          },
          {
            label: t("usage.summaryThroughput"),
            value: summaryLoading
              ? "…"
              : `${formatCount(summary?.inputTokens ?? 0)} / ${formatCount(
                  summary?.outputTokens ?? 0,
                )}`,
            icon: ArrowDownUp,
            tone: "border-violet-500 text-violet-700 bg-violet-50 dark:text-violet-300 dark:bg-violet-400/10",
          },
          {
            label: t("usage.summaryAvgDuration"),
            value:
              summaryLoading || !summary?.calls
                ? summaryLoading
                  ? "…"
                  : "—"
                : formatSeconds(summary.averageDuration),
            icon: Clock3,
            tone: "border-amber-500 text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-400/10",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className={`min-w-0 border border-l-[3px] border-slate-200/80 bg-white/90 p-3 dark:border-white/10 dark:bg-[#111827]/80 ${tone}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[11px] font-medium text-slate-500 dark:text-gray-400">
                {label}
              </div>
              <Icon
                size={15}
                className="shrink-0 opacity-80"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 truncate text-base font-semibold tabular-nums text-slate-900 dark:text-gray-100">
              {value}
            </div>
          </div>
        ))}
      </div>
      {summaryError && (
        <p
          role="status"
          className="mb-3 text-xs text-amber-600 dark:text-amber-400"
        >
          {summaryError}
        </p>
      )}
      {!isTauri && (
        <p className="mb-3 text-xs text-amber-500">{t("ui.71c4030fc5b1")}</p>
      )}
      <form
        onSubmit={submit}
        className={
          cardClass +
          " mb-4 space-y-3 border-slate-200 bg-white/90 p-3 dark:bg-[#111827]/80"
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5 text-[11px] text-slate-500">
            {t("ui.2be9040878d3")}
            <select
              aria-label={t("ui.2be9040878d3")}
              className={fieldClass}
              value={range}
              onChange={(e) => {
                const value = e.target.value;
                setRange(value);
                if (value === "custom") {
                  setExpanded(true);
                  return;
                }
                const start = new Date();
                start.setDate(start.getDate() - Number(value) + 1);
                setFilters((f) => ({
                  ...f,
                  start: localDate(start),
                  end: localDate(new Date()),
                }));
              }}
            >
              <option value="1">{t("ui.17e83cc25e22")}</option>
              <option value="7">{t("ui.2a0a052cea78")}</option>
              <option value="30">{t("ui.279e4c240d52")}</option>
              <option value="custom">{t("ui.2b39f48d81f8")}</option>
            </select>
          </label>
          <div className="flex-1 min-w-[150px]">
            {field("model", t("ui.38719c9968ae"), "text", t("ui.29f904798e3a"))}
          </div>
          <button
            type="submit"
            className={
              buttonClass +
              " bg-blue-600 text-white hover:bg-blue-700 border-blue-600 shadow-sm shadow-blue-600/15"
            }
          >
            {t("ui.711363c42474")}
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("ui.71b0cbba2fa0") : t("ui.194b82d27d1f")}
            {!expanded &&
            [
              filters.token,
              filters.group,
              filters.request,
              filters.type !== "0",
            ].filter(Boolean).length > 0
              ? t("ui.be9d03f8d077")
              : ""}
          </button>
          <button type="button" className={buttonClass} onClick={reset}>
            {t("ui.3d81345303ab")}
          </button>
        </div>
        {expanded && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 border-t border-slate-200/60 pt-3 dark:border-white/10">
            {field("start", t("ui.1f2919689118"), "date")}
            {field("end", t("ui.f4b9b2b5de8a"), "date")}
            {field("token", t("ui.e8a3d906a8bd"))}
            {field("group", t("ui.65731c12ae52"))}
            {field("request", t("ui.ce1febd0cdeb"))}
            <label className="flex flex-col gap-1.5 text-[11px] text-slate-500">
              {t("ui.693090ce1041")}
              <select
                aria-label={t("ui.693090ce1041")}
                className={fieldClass}
                value={filters.type}
                onChange={(e) =>
                  setFilters((v) => ({ ...v, type: e.target.value }))
                }
              >
                <option value="0">{t("ui.fa6968d9f070")}</option>
                {Object.entries(logTypes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {filters.request && (
          <p className="text-[11px] text-slate-500">{t("ui.ca6152172a31")}</p>
        )}
        {formError && (
          <p role="alert" className="text-xs text-red-500">
            {formError}
          </p>
        )}
      </form>
      <div
        className={
          cardClass +
          " overflow-hidden border-slate-200 bg-white/95 dark:bg-[#111827]/85"
        }
      >
        <DataState
          loading={loading}
          error={error}
          empty={!data?.items?.length}
          retry={() => setVersion((v) => v + 1)}
        />
        {!loading && !error && !!data?.items?.length && (
          <div className="overflow-x-auto">
            <table className="usage-logs-table w-full min-w-[1170px] table-fixed whitespace-nowrap text-xs text-left leading-5">
              <caption className="sr-only">{t("usage.tableHelp")}</caption>
              <colgroup>
                {[120, 56, 156, 62, 120, 210, 98, 136, 132, 80].map(
                  (width, index) => (
                    <col
                      key={index}
                      style={{ width: `${(width / 1170) * 100}%` }}
                    />
                  ),
                )}
              </colgroup>
              <thead className="border-b-2 border-blue-500/60 bg-slate-50/95 text-slate-600 dark:bg-white/[0.045] dark:text-gray-300">
                <tr>
                  {[
                    t("usage.time"),
                    t("usage.type"),
                    t("usage.model"),
                    t("usage.key"),
                    t("ui.97d8a6c05b4c"),
                    "Token",
                    t("ui.9836a95e9d29"),
                    t("ui.a9704e1997b9"),
                    t("usage.requestId"),
                    t("usage.actions"),
                  ].map((h, i) => (
                    <th
                      key={i}
                      scope="col"
                      className={
                        "truncate px-2.5 py-3 font-medium " +
                        (i === 9
                          ? "sticky right-0 bg-slate-50 dark:bg-[#1c2030]"
                          : "")
                      }
                      title={h}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.items.map((log) => {
                  const meta = usageMetadata(log);
                  return (
                    <tr
                      key={log.id}
                      className={
                        "group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 hover:bg-slate-50/80 dark:hover:bg-white/[0.03] " +
                        (log.type === 5
                          ? "bg-rose-50/50 dark:bg-rose-500/[0.035]"
                          : "odd:bg-slate-50/35 dark:odd:bg-white/[0.012]")
                      }
                      tabIndex={0}
                      aria-label={t("usage.openLog", { id: log.id })}
                      onClick={() => setSelected(log)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(log);
                        }
                      }}
                    >
                      <td
                        className="px-2.5 py-2.5 align-middle tabular-nums"
                        title={new Date(log.created_at * 1000).toLocaleString(
                          getLocale(),
                        )}
                      >
                        <span>
                          {new Date(log.created_at * 1000).toLocaleDateString(
                            getLocale(),
                            { month: "2-digit", day: "2-digit" },
                          )}{" "}
                          {new Date(log.created_at * 1000).toLocaleTimeString(
                            getLocale(),
                            { hour12: false },
                          )}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle">
                        <span
                          className={
                            "inline-block max-w-full truncate border px-1 py-0.5 align-middle text-[10px] " +
                            (log.type === 5
                              ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                              : log.type === 1
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                                : "border-sky-200 bg-sky-50/70 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300")
                          }
                        >
                          {logTypes[log.type] ??
                            t("ui.8171f30c3c9e", { v0: log.type })}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle">
                        <div className="flex items-center gap-2">
                          {log.model_name && (
                            <ModelIcon
                              name={log.model_name}
                              size={18}
                              compact
                            />
                          )}
                          <span
                            className="min-w-0 truncate font-medium text-slate-900 dark:text-gray-100"
                            title={log.model_name}
                          >
                            {log.model_name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle">
                        <div className="truncate" title={log.token_name}>
                          {log.token_name || "—"}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="min-w-0 truncate font-medium text-slate-700 dark:text-gray-200"
                            title={log.group ? groupName(log.group) : undefined}
                          >
                            {log.group ? groupName(log.group) : "—"}
                          </span>
                          {meta.groupRatio !== undefined && (
                            <span
                              className="shrink-0 text-[11px] font-semibold text-amber-600 dark:text-amber-300"
                              title={t("usage.groupRatioHelp")}
                            >
                              <span className="tabular-nums">
                                {formatRatio(meta.groupRatio)}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle tabular-nums">
                        <div
                          className="flex min-w-0 items-center gap-1.5 tabular-nums"
                          title={[
                            `${t("usage.inputTokens")}: ${log.prompt_tokens ?? 0}`,
                            `${t("usage.outputTokens")}: ${log.completion_tokens ?? 0}`,
                            ...(meta.cacheReadTokens !== undefined &&
                            meta.cacheReadTokens > 0
                              ? [
                                  `${t("usage.cacheRead")}: ${meta.cacheReadTokens}`,
                                ]
                              : []),
                            ...(meta.cacheWriteTokens !== undefined &&
                            meta.cacheWriteTokens > 0
                              ? [
                                  `${t("usage.cacheWrite")}: ${meta.cacheWriteTokens}`,
                                ]
                              : []),
                          ].join(" · ")}
                        >
                          <span className="text-sky-700 dark:text-sky-300">
                            {(log.prompt_tokens ?? 0).toLocaleString(
                              getLocale(),
                            )}
                          </span>
                          <span className="mx-1.5 text-slate-400">/</span>
                          <span className="text-violet-700 dark:text-violet-300">
                            {(log.completion_tokens ?? 0).toLocaleString(
                              getLocale(),
                            )}
                          </span>
                          {meta.cacheReadTokens !== undefined &&
                            meta.cacheReadTokens > 0 && (
                              <span
                                className="shrink-0 border border-sky-200 bg-sky-50 px-1 text-[10px] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300"
                                title={`${t("usage.cacheRead")}: ${formatCount(meta.cacheReadTokens)}`}
                              >
                                R {formatCount(meta.cacheReadTokens)}
                              </span>
                            )}
                          {meta.cacheWriteTokens !== undefined &&
                            meta.cacheWriteTokens > 0 && (
                              <span
                                className="shrink-0 border border-amber-200 bg-amber-50 px-1 text-[10px] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300"
                                title={`${t("usage.cacheWrite")}: ${formatCount(meta.cacheWriteTokens)}`}
                              >
                                W {formatCount(meta.cacheWriteTokens)}
                              </span>
                            )}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle tabular-nums">
                        <div
                          className="truncate font-medium text-emerald-700 dark:text-emerald-300"
                          title={usd((log.quota ?? 0) / unit)}
                        >
                          {usd((log.quota ?? 0) / unit)}
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5 align-middle tabular-nums">
                        <div
                          className="truncate"
                          title={log.is_stream ? t("usage.stream") : undefined}
                        >
                          <span className="whitespace-nowrap">
                            {log.use_time ?? 0}s
                          </span>
                          {meta.firstResponseSeconds !== undefined && (
                            <span
                              className="ml-2 text-[11px] text-slate-500 dark:text-gray-400"
                              title={t("usage.firstResponse")}
                            >
                              {t("usage.firstResponseShort")}{" "}
                              <span className="whitespace-nowrap">
                                {formatSeconds(meta.firstResponseSeconds)}
                              </span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className="px-2.5 py-2.5 align-middle"
                        title={log.type === 5 ? log.content : undefined}
                      >
                        {log.request_id ? (
                          <div className="flex items-center gap-1.5">
                            <code
                              className="min-w-0 flex-1 truncate text-[10px] text-slate-500 dark:text-gray-400"
                              title={log.request_id}
                            >
                              {log.request_id}
                            </code>
                            <button
                              type="button"
                              className="shrink-0 p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
                              title={
                                copiedRequestId === log.request_id
                                  ? t("usage.copied")
                                  : t("usage.copyRequestId")
                              }
                              aria-label={
                                copiedRequestId === log.request_id
                                  ? t("usage.copied")
                                  : t("usage.copyRequestId")
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyRequestId(log.request_id);
                              }}
                            >
                              {copiedRequestId === log.request_id ? (
                                <Check size={13} />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="sticky right-0 bg-white px-2.5 py-2.5 align-middle shadow-[-4px_0_6px_-5px_rgba(0,0,0,0.3)] dark:bg-[#151925]">
                        <button
                          type="button"
                          className={buttonClass + " w-full min-w-0 px-2"}
                          title={t("ui.4f55ee1e687f")}
                          onClick={() => setSelected(log)}
                        >
                          <span className="truncate">
                            {t("ui.4f55ee1e687f")}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!loading && !error && data && (
        <Pagination
          page={query.p}
          total={data.total}
          size={query.page_size}
          setPage={(p) => setQuery((q) => ({ ...q, p }))}
          visibleCount={data.items?.length ?? 0}
          setSize={(page_size) =>
            setQuery((current) => ({ ...current, p: 1, page_size }))
          }
        />
      )}
      {selected && (
        <DetailDialog
          title={t("ui.88b864bdf668")}
          close={() => setSelected(null)}
          wide
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-3">
              <ModelIcon
                name={selected.model_name || "model"}
                size={38}
                compact
              />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-slate-900 dark:text-white">
                  {selected.model_name || "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {logTypes[selected.type] ?? selected.type} ·{" "}
                  {new Date(selected.created_at * 1000).toLocaleString(
                    getLocale(),
                  )}
                </p>
              </div>
            </div>
            <div className="border-l-2 border-emerald-400 bg-emerald-50/70 px-4 py-2 text-right dark:bg-emerald-400/[0.06]">
              <p className="text-[10px] text-slate-500">
                {t("ui.9836a95e9d29")}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                {usd((selected.quota ?? 0) / unit)}
              </p>
            </div>
          </div>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-gray-200">
              <Activity size={14} className="text-blue-500" />
              {t("usage.tokenBreakdown")}
            </h3>
            <dl className="grid overflow-hidden border border-slate-200 bg-slate-50/70 text-xs dark:border-white/10 dark:bg-white/[0.025] sm:grid-cols-2 lg:grid-cols-4">
              {[
                [t("usage.inputTokens"), selected.prompt_tokens ?? 0],
                [t("usage.outputTokens"), selected.completion_tokens ?? 0],
                [t("usage.cacheRead"), selectedMeta?.cacheReadTokens ?? 0],
                [t("usage.cacheWrite"), selectedMeta?.cacheWriteTokens ?? 0],
              ].map(([label, value], index) => (
                <div
                  key={String(label)}
                  className={`${index > 0 ? "border-t border-slate-200 dark:border-white/10 sm:border-t-0 sm:border-l" : ""} min-w-0 p-3`}
                >
                  <dt className="text-[10px] text-slate-500">{label}</dt>
                  <dd className="mt-1.5 font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-gray-100">
                    {Number(value).toLocaleString(getLocale())}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-gray-200">
              <Clock3 size={14} className="text-amber-500" />
              {t("usage.requestDetails")}
            </h3>
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
              {[
                [t("ui.e8a3d906a8bd"), selected.token_name],
                [
                  t("ui.97d8a6c05b4c"),
                  selected.group ? groupName(selected.group) : undefined,
                ],
                [
                  t("usage.groupRatio"),
                  selectedMeta?.groupRatio !== undefined
                    ? formatRatio(selectedMeta.groupRatio)
                    : undefined,
                ],
                [t("ui.a9704e1997b9"), `${selected.use_time ?? 0}s`],
                [
                  t("usage.firstResponse"),
                  selectedMeta?.firstResponseSeconds !== undefined
                    ? formatSeconds(selectedMeta.firstResponseSeconds)
                    : undefined,
                ],
                [
                  t("usage.stream"),
                  selected.is_stream ? t("usage.yes") : t("usage.no"),
                ],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="min-w-0 border-l-2 border-slate-300 bg-slate-50/70 px-3 py-2.5 dark:border-white/20 dark:bg-white/[0.025]"
                >
                  <dt className="text-[10px] text-slate-500">{label}</dt>
                  <dd className="mt-1 break-all font-medium text-slate-800 dark:text-gray-100 select-text">
                    {value ?? "-"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="grid gap-2 text-xs sm:grid-cols-2">
            {[
              [t("ui.ce1febd0cdeb"), selected.request_id],
              [t("usage.upstreamRequestId"), selected.upstream_request_id],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="min-w-0 border border-slate-200 px-3 py-2.5 dark:border-white/10"
              >
                <p className="text-[10px] text-slate-500">{label}</p>
                <code className="mt-1 block break-all text-[11px] text-slate-700 dark:text-gray-300 select-text">
                  {value || "-"}
                </code>
              </div>
            ))}
          </section>
          {selected.other && (
            <details className="border border-slate-200 p-3 dark:border-white/10">
              <summary className="cursor-pointer text-xs font-medium">
                {t("usage.additionalInfo")}
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs select-text">
                {formatAdditionalData(selected.other)}
              </pre>
            </details>
          )}
          {selected.content && (
            <div>
              <h3 className="text-xs text-slate-500 mb-2">
                {t("ui.5f5f8b8a866b")}
              </h3>
              <pre className="whitespace-pre-wrap break-all rounded-xl bg-slate-100 p-3 text-xs dark:bg-white/5">
                {selected.content}
              </pre>
            </div>
          )}
        </DetailDialog>
      )}
    </section>
  );
}
