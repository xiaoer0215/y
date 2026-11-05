import { useState } from "react";
import { t, useLocale } from "../lib/i18n";
import { isDynamic, usd, type PricingCatalog } from "../lib/account-data";
import { keyGroupModels, keyGroupRatio } from "../lib/key-pricing";
import type { KeyForm, KeyGroups } from "../lib/keys";
import { useGroupDisplayName } from "../lib/site-content";
import ModelIcon from "./ModelIcon";
import { buttonClass, fieldClass } from "./AccountDataUI";

export function ratioText(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value}×`
    : "—";
}

export default function KeyModelRates({
  form,
  groups,
  catalog,
  loading,
  error,
  retry,
  expanded = false,
}: {
  form: Pick<
    KeyForm,
    "group" | "auto_groups" | "model_limits_enabled" | "model_limits"
  >;
  groups: KeyGroups | null;
  catalog: PricingCatalog | null;
  loading: boolean;
  error: string;
  retry: () => void;
  expanded?: boolean;
}) {
  useLocale();
  const displayGroup = useGroupDisplayName();
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(8);
  const [autoGroup, setAutoGroup] = useState("");
  const candidates = form.auto_groups.length
    ? form.auto_groups
    : (groups?.auto.groups ?? []);
  const group =
    form.group === "auto"
      ? candidates.includes(autoGroup)
        ? autoGroup
        : (candidates[0] ?? "")
      : form.group;
  const models = catalog
    ? keyGroupModels(
        catalog,
        groups,
        group,
        form.model_limits_enabled,
        form.model_limits,
      ).filter((m) =>
        m.model_name.toLowerCase().includes(search.toLowerCase().trim()),
      )
    : [];
  return (
    <details
      open={expanded}
      className="key-model-rates rounded-md border border-slate-200 p-3 dark:border-white/10"
    >
      <summary className="cursor-pointer text-xs font-medium text-blue-600 dark:text-blue-400">
        {t("keys.modelRates")}
      </summary>
      <div className="mt-3 space-y-3">
        {!form.group ? (
          <p className="text-xs text-slate-500">{t("keys.chooseGroup")}</p>
        ) : (
          <>
            {form.group === "auto" && (
              <label className="block space-y-2 text-xs">
                <span>{t("keys.autoRatio")}</span>
                <select
                  className={fieldClass + " w-full"}
                  value={group}
                  onChange={(e) => {
                    setAutoGroup(e.target.value);
                    setCount(8);
                  }}
                >
                  {!candidates.length && (
                    <option value="">{t("keys.noModels")}</option>
                  )}
                  {candidates.map((g) => (
                    <option key={g} value={g}>
                      {displayGroup(g, groups?.groups[g])} ·{" "}
                      {ratioText(keyGroupRatio(g, groups, catalog))}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-slate-500">
              {t("keys.groupRate")}：
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {ratioText(keyGroupRatio(group, groups, catalog))}
              </span>
            </p>
            <p className="text-xs leading-5 text-slate-500">
              {t("keys.rateHelp")}
            </p>
            {loading ? (
              <p className="text-xs text-slate-500">{t("ui.1d08846f05c5")}</p>
            ) : error ? (
              <div
                role="status"
                className="space-y-2 text-xs text-amber-600 dark:text-amber-400"
              >
                <p>{t("keys.ratesUnavailable")}</p>
                <button type="button" className={buttonClass} onClick={retry}>
                  {t("ui.e2d53a6d3a6a")}
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  className={fieldClass + " w-full"}
                  aria-label={t("keys.searchModels")}
                  placeholder={t("keys.searchModels")}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCount(8);
                  }}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-slate-500">
                      <tr>
                        <th className="py-2 pr-3">{t("keys.model")}</th>
                        <th className="whitespace-nowrap px-2 py-2">
                          {t("keys.inputRatio")}
                        </th>
                        <th className="whitespace-nowrap px-2 py-2">
                          {t("keys.outputRatio")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {models.slice(0, count).map((m) => (
                        <tr key={m.model_name}>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0">
                                <ModelIcon
                                  name={m.model_name}
                                  icon={m.icon}
                                  size={16}
                                />
                              </span>
                              <span className="break-all">{m.model_name}</span>
                            </div>
                          </td>
                          {isDynamic(m) ? (
                            <td
                              colSpan={2}
                              className="px-2 text-yellow-600 dark:text-yellow-400"
                            >
                              {t("ui.af9df0b600c3")}
                            </td>
                          ) : m.quota_type === 1 ? (
                            <td colSpan={2} className="px-2">
                              {usd(m.model_price)}
                              {t("ui.7e4b4f47925b")}
                            </td>
                          ) : (
                            <>
                              <td className="px-2 tabular-nums">
                                {ratioText(m.model_ratio)}
                              </td>
                              <td className="px-2 tabular-nums">
                                {ratioText(m.completion_ratio)}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!models.length && (
                  <p className="text-xs text-slate-500">{t("keys.noModels")}</p>
                )}
                {models.length > count && (
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => setCount((n) => n + 8)}
                  >
                    {t("keys.moreModels")}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}
