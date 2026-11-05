import ModelCompatibility from "./ModelCompatibility";
import { t, useLocale, getLocale } from "../lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, Check, Layers3, Search, Tag } from "lucide-react";
import { getPricingCatalog, isTauri } from "../lib/api";
import ModelIcon from "./ModelIcon";
import DynamicPricingView from "./DynamicPricingView";
import SegmentedTabs from "./ui/SegmentedTabs";
import {
  groupDisplayName,
  groupDescription,
  useSiteContent,
} from "../lib/site-content";
import {
  groupRatio,
  isDynamic,
  modelPrices,
  usd,
  type PricingCatalog,
  type PricingModel,
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

function StaticPricingView({
  model,
  ratio,
}: {
  model: PricingModel;
  ratio: number;
}) {
  const prices = modelPrices(model, ratio);
  const items = [
    {
      label: t("ui.e216731965cd"),
      value: prices.input,
      tone: "border-sky-400 text-sky-700 dark:text-sky-300",
    },
    {
      label: t("ui.bc3fc2bdc424"),
      value: prices.output,
      tone: "border-violet-400 text-violet-700 dark:text-violet-300",
    },
    {
      label: t("ui.63cbdb90653f"),
      value: prices.cache,
      tone: "border-emerald-400 text-emerald-700 dark:text-emerald-300",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-slate-800 dark:text-gray-100">
          {model.quota_type === 1 ? t("ui.de398c1294fe") : t("ui.91dad49039ad")}
        </span>
        <span className="font-mono text-slate-500">
          {ratio.toLocaleString(getLocale(), { maximumFractionDigits: 8 })}×
        </span>
      </div>
      <div className="grid overflow-hidden border border-slate-200 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.025] sm:grid-cols-3">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`min-w-0 border-l-2 px-4 py-3 ${item.tone} ${index > 0 ? "border-t border-t-slate-200 dark:border-t-white/10 sm:border-t-0" : ""}`}
          >
            <p className="text-[11px] text-slate-500 dark:text-gray-400">
              {item.label}
            </p>
            <p className="mt-1.5 truncate font-mono text-sm font-semibold">
              {item.value}
              {model.quota_type === 0 && item.value !== "—" && (
                <span className="ml-1 whitespace-nowrap text-[10px] font-normal text-slate-400">
                  {t("ui.4b2b9f00ebe0")}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
      {model.create_cache_ratio != null && model.model_ratio !== undefined && (
        <div className="border-l-2 border-amber-400 bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:bg-amber-400/[0.06] dark:text-amber-300">
          {t("message.25859a454428", {
            v0: usd(model.model_ratio * 2 * ratio * model.create_cache_ratio),
          })}
        </div>
      )}
    </div>
  );
}

export default function PricingPanel() {
  useLocale();
  const site = useSiteContent();
  const [catalog, setCatalog] = useState<PricingCatalog>({ data: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [vendor, setVendor] = useState("");
  const [available, setAvailable] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PricingModel | null>(null);
  const [view, setView] = useState<"models" | "groups">("models");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getPricingCatalog()
      .then((data) => {
        if (active) {
          setCatalog(data);
          setPage(1);
          setSelected(null);
        }
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
  }, [version]);
  const groups = useMemo(
    () =>
      Array.from(
        new Set([
          ...Object.keys(catalog.usable_group ?? {}),
          ...Object.keys(catalog.group_ratio ?? {}),
        ]),
      ).filter((g) => g !== "auto"),
    [catalog, getLocale()],
  );
  const models = useMemo(
    () =>
      catalog.data.filter(
        (m) =>
          (!search ||
            `${m.model_name} ${m.description ?? ""} ${m.tags ?? ""}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!group ||
            m.enable_groups?.includes(group) ||
            m.enable_groups?.includes("all")) &&
          (!vendor || String(m.vendor_id) === vendor) &&
          (!available || m.available === true),
      ),
    [catalog, search, group, vendor, available, getLocale()],
  );
  const reset = (change: () => void) => {
    change();
    setPage(1);
  };
  const groupName = (g: string) => {
    const usable = catalog.usable_group?.[g];
    return groupDisplayName(
      g,
      (typeof usable === "object" ? usable.display_name : undefined) ||
        catalog.user_group_display_names_localized?.[g] ||
        site?.user_group_display_names_localized?.[g],
    );
  };
  return (
    <section className="w-full text-slate-700 dark:text-gray-300">
      <DataHeader
        title={t("nav.models")}
        description={t("ui.f403c7f4b9fc")}
        loading={loading}
        refresh={() => setVersion((v) => v + 1)}
      />
      <SegmentedTabs
        label={t("nav.models")}
        className="mb-4"
        value={view}
        change={(id) => setView(id as "models" | "groups")}
        tabs={[
          { id: "models", label: t("ui.bf9c6bfe0c5f") },
          { id: "groups", label: t("ui.c166d7e26bc3") },
        ]}
      />
      {view === "groups" ? (
        <>
          <DataState
            loading={loading}
            error={error}
            empty={!groups.length}
            retry={() => setVersion((v) => v + 1)}
          />
          {!loading && !error && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => {
                const entries = catalog.data.filter(
                  (m) =>
                    m.available &&
                    (m.enable_groups?.includes(g) ||
                      m.enable_groups?.includes("all")),
                );
                const usable = catalog.usable_group?.[g];
                const description = groupDescription(
                  typeof usable === "object" ? usable : { desc: usable },
                  catalog.user_group_display_names_localized?.[g] ||
                    site?.user_group_display_names_localized?.[g],
                );
                const ratio =
                  catalog.group_ratio?.[g] ??
                  (typeof usable === "object" ? usable.ratio : undefined);
                return (
                  <article
                    key={g}
                    className={
                      cardClass +
                      " group relative flex min-h-[230px] flex-col overflow-hidden border-slate-200 bg-white/95 p-0 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:border-blue-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.02] dark:shadow-none dark:hover:border-blue-400/30"
                    }
                  >
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300">
                            <Layers3 size={19} />
                          </span>
                          <div className="min-w-0">
                            <h2 className="break-words text-sm font-semibold text-slate-900 dark:text-gray-100">
                              {groupName(g)}
                            </h2>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {t("message.ccbf7747fecd", {
                                v0: entries.length,
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="border-l border-slate-200 pl-3 text-right dark:border-white/10">
                          <p className="text-[10px] text-slate-500">
                            {t("usage.groupRatio")}
                          </p>
                          <p className="mt-1 font-mono text-sm font-semibold text-amber-600 dark:text-amber-300">
                            {ratio !== undefined
                              ? `${ratio.toLocaleString(getLocale(), { maximumFractionDigits: 8 })}×`
                              : t("ui.d2ad43154110")}
                          </p>
                        </div>
                      </div>
                      {description && description !== groupName(g) && (
                        <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500 dark:text-gray-400">
                          {description}
                        </p>
                      )}
                      <div className="mt-4 border-y border-slate-200 py-3 dark:border-white/10">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-medium text-slate-500">
                          <Boxes size={12} />
                          {t("ui.bf9c6bfe0c5f")}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {entries.slice(0, 4).map((m) => (
                            <span
                              key={m.model_name}
                              className="truncate border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] dark:border-white/10 dark:bg-white/[0.025]"
                              title={m.model_name}
                            >
                              {m.model_name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        className="mt-auto flex items-center justify-between pt-3 text-left text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-sky-300 dark:hover:text-sky-200"
                        onClick={() => {
                          setGroup(g);
                          setSearch("");
                          setVendor("");
                          setAvailable(true);
                          setPage(1);
                          setView("models");
                        }}
                      >
                        <span>{t("ui.714d9560bcd3")}</span>
                        <ArrowRight
                          size={14}
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {!isTauri && (
            <p className="mb-3 text-xs text-amber-500">
              {t("ui.7b8139e565f1")}
            </p>
          )}
          <div className={cardClass + " p-4 mb-4 space-y-3"}>
            <div className="flex flex-wrap gap-3">
              <label className="relative flex-1 min-w-[180px]">
                <Search
                  size={14}
                  className="absolute left-3 top-2.5 text-slate-400"
                />
                <input
                  aria-label={t("ui.df5586278501")}
                  placeholder={t("ui.00ef45ceb7db")}
                  className={fieldClass + " w-full pl-9"}
                  value={search}
                  onChange={(e) => reset(() => setSearch(e.target.value))}
                />
              </label>
              <select
                aria-label={t("ui.23f29094d921")}
                className={fieldClass + " max-w-[220px]"}
                value={group}
                onChange={(e) => reset(() => setGroup(e.target.value))}
              >
                <option value="">{t("ui.fe7eb1500edf")}</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {groupName(g)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("ui.27c82a2a98b6")}
                className={fieldClass}
                value={vendor}
                onChange={(e) => reset(() => setVendor(e.target.value))}
              >
                <option value="">{t("ui.835af3768d1d")}</option>
                {catalog.vendors?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>
                {group
                  ? t("ui.be54b91c24a5", { v0: groupName(group) })
                  : t("ui.11bbde9a4de4")}
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={available}
                  onChange={(event) =>
                    reset(() => setAvailable(event.target.checked))
                  }
                />
                <span
                  className={`flex h-4 w-4 items-center justify-center border transition-colors ${available ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-transparent dark:border-white/25 dark:bg-white/[0.03]"}`}
                >
                  <Check size={11} strokeWidth={3} />
                </span>
                {t("ui.da687bf746ac")}
              </label>
            </div>
          </div>
          <div className={cardClass + " overflow-hidden"}>
            <DataState
              loading={loading}
              error={error}
              empty={!models.length}
              retry={() => setVersion((v) => v + 1)}
            />
            {!loading && !error && models.length > 0 && (
              <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                {models.slice((page - 1) * 20, page * 20).map((m) => {
                  const vendorInfo = catalog.vendors?.find(
                    (v) => v.id === m.vendor_id,
                  );
                  const prices = modelPrices(m, groupRatio(catalog, m, group));
                  const dynamic = isDynamic(m);
                  return (
                    <article
                      key={m.model_name}
                      className="flex min-w-0 flex-col border border-slate-200/80 bg-white/70 p-3.5 transition-colors hover:border-blue-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-blue-400/30 dark:hover:bg-white/[0.035]"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <ModelIcon
                          name={m.model_name}
                          icon={m.icon || vendorInfo?.icon}
                          vendor={vendorInfo?.name}
                          size={34}
                        />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => setSelected(m)}
                            className="block max-w-full break-all text-left text-xs font-semibold text-slate-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-sky-300"
                          >
                            {m.model_name}
                          </button>
                          <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[10px]">
                            <span className="truncate text-slate-500 dark:text-gray-400">
                              {vendorInfo?.name || t("ui.835af3768d1d")}
                            </span>
                            {m.available !== undefined && (
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 ${m.available ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 ${m.available ? "bg-emerald-500" : "bg-amber-500"}`}
                                />
                                {m.available
                                  ? t("ui.e91365cf9ed9")
                                  : t("ui.4dddd9200cc9")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 dark:border-white/[0.07]">
                        <span
                          className={`text-[10px] font-medium ${dynamic ? "text-amber-600 dark:text-amber-300" : "text-slate-500 dark:text-gray-400"}`}
                        >
                          {dynamic
                            ? t("ui.af9df0b600c3")
                            : m.quota_type === 1
                              ? t("ui.de398c1294fe")
                              : t("ui.91dad49039ad")}
                        </span>
                        {group && (
                          <span className="truncate text-[10px] text-slate-500 dark:text-gray-400">
                            {groupName(group)}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 bg-slate-50/80 dark:divide-white/10 dark:border-white/10 dark:bg-white/[0.025]">
                        {[
                          [t("ui.e216731965cd"), prices.input],
                          [t("ui.bc3fc2bdc424"), prices.output],
                          [t("ui.63cbdb90653f"), prices.cache],
                        ].map(([label, value], index) => (
                          <div key={label} className="min-w-0 px-2 py-2">
                            <div className="truncate text-[9px] text-slate-500 dark:text-gray-400">
                              {label}
                            </div>
                            <div
                              className={`mt-1 truncate font-mono text-[10px] font-semibold ${dynamic ? "text-amber-600 dark:text-amber-300" : index === 0 ? "text-sky-700 dark:text-sky-300" : index === 1 ? "text-violet-700 dark:text-violet-300" : "text-emerald-700 dark:text-emerald-300"}`}
                            >
                              {value}
                              {m.quota_type !== 1 && value.startsWith("$") && (
                                <span className="ml-1 whitespace-nowrap text-[9px] font-normal text-slate-400">
                                  {t("ui.4b2b9f00ebe0")}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        className={buttonClass + " mt-3 w-full justify-center"}
                        onClick={() => setSelected(m)}
                      >
                        {t("ui.4f55ee1e687f")}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          {!loading && !error && models.length > 0 && (
            <Pagination
              page={page}
              total={models.length}
              size={20}
              setPage={setPage}
            />
          )}
        </>
      )}
      {selected && (
        <DetailDialog
          title={selected.model_name}
          close={() => setSelected(null)}
        >
          <div className="flex items-center gap-3">
            <ModelIcon
              name={selected.model_name}
              icon={
                selected.icon ||
                catalog.vendors?.find((v) => v.id === selected.vendor_id)?.icon
              }
            />
            <div>
              <p className="font-semibold">{selected.model_name}</p>
              <p
                className={
                  "mt-1 text-xs " +
                  (isDynamic(selected)
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-slate-500")
                }
              >
                {isDynamic(selected)
                  ? t("ui.af9df0b600c3")
                  : selected.quota_type === 1
                    ? t("ui.de398c1294fe")
                    : t("ui.91dad49039ad")}
              </p>
            </div>
          </div>
          {selected.description && (
            <p className="whitespace-pre-wrap leading-relaxed">
              {selected.description}
            </p>
          )}
          <div>
            {isDynamic(selected) ? (
              <DynamicPricingView
                model={selected}
                ratio={groupRatio(catalog, selected, group)}
              />
            ) : (
              <StaticPricingView
                model={selected}
                ratio={groupRatio(catalog, selected, group)}
              />
            )}
          </div>
          <div>
            <h3 className="text-xs text-slate-500 mb-2 flex gap-1">
              <Tag size={14} />
              {t("ui.16feb6f299b5")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {selected.enable_groups?.map((g) => (
                <span
                  key={g}
                  className="border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-white/10 dark:bg-white/[0.025]"
                >
                  {groupName(g)} ·{" "}
                  {isDynamic(selected) ? (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      {t("ui.af9df0b600c3")}
                    </span>
                  ) : (
                    modelPrices(selected, groupRatio(catalog, selected, g))
                      .input
                  )}
                </span>
              ))}
            </div>
          </div>
          {!!selected.supported_endpoint_types?.length && (
            <p className="text-xs break-all">
              {t("message.0d8054bc04df", {
                v0: selected.supported_endpoint_types.join("、"),
              })}
            </p>
          )}
          <ModelCompatibility model={selected.model_name} />
          {!!selected.context_length && (
            <p className="text-xs">
              {t("message.bdf37fbdff28", {
                v0: selected.context_length.toLocaleString(getLocale()),
              })}
            </p>
          )}
          {!!selected.max_output_tokens && (
            <p className="text-xs">
              {t("message.36e6e273196a", {
                v0: selected.max_output_tokens.toLocaleString(getLocale()),
              })}
            </p>
          )}
        </DetailDialog>
      )}
    </section>
  );
}
