import { t, useLocale } from "../lib/i18n";
import { readPricingTiers, usageLabels } from "../lib/dynamic-pricing";
import { usd, type PricingModel } from "../lib/account-data";

export default function DynamicPricingView({
  model,
  ratio,
}: {
  model: PricingModel;
  ratio: number;
}) {
  useLocale();
  const tiers = readPricingTiers(model.billing_expr);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-yellow-600 dark:text-yellow-400">
          {t("message.6f754ba1ad23", {
            v0:
              tiers.length > 1
                ? t("ui.96489a16d712", { v0: tiers.length })
                : "",
          })}
        </span>
        <span className="text-slate-500">{t("ui.096e7f762768")}</span>
      </div>
      {tiers.length ? (
        tiers.map((tier, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-yellow-500/20 bg-yellow-500/[0.04]"
          >
            <div className="border-b border-yellow-500/10 px-4 py-3 text-xs font-medium text-yellow-700 dark:text-yellow-300">
              {tier.condition}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4">
              {tier.fixed !== undefined ? (
                <div>
                  <p className="text-[11px] text-slate-500">
                    {t("ui.125a4a4b24fa")}
                  </p>
                  <p className="mt-1 font-semibold">
                    {t("message.cf22c191bf43", { v0: usd(tier.fixed * ratio) })}
                  </p>
                </div>
              ) : (
                [...new Set(["p", "c", ...Object.keys(tier.prices)])].map(
                  (key) => (
                    <div key={key}>
                      <p className="text-[11px] text-slate-500">
                        {usageLabels[key]}
                      </p>
                      <p className="mt-1 whitespace-nowrap text-sm font-semibold">
                        {usd((tier.prices[key] ?? 0) * ratio)}
                        <span className="ml-1 text-[10px] font-normal text-slate-400">
                          {t("ui.4b2b9f00ebe0")}
                        </span>
                      </p>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs leading-6 text-slate-600 dark:text-gray-400">
          {t("ui.daaa2b981f21")}
        </div>
      )}
    </div>
  );
}
