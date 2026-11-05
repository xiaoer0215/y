import { BRAND } from "../lib/brand";
import { useGroupDisplayName } from "../lib/site-content";
import { getLocale, t, useLocale } from "../lib/i18n";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  KeyRound,
  LogOut,
  ReceiptText,
  RefreshCw,
  Wallet,
  Wrench,
} from "lucide-react";
import { useAuth } from "../lib/useAuth";
import { usd } from "../lib/account-data";
import { buttonClass } from "./AccountDataUI";

type NetworkState = "checking" | "reachable" | "unreachable";

export default function AccountOverview({
  topup,
  showBills,
  showKeys,
  showTools,
  checkNetwork,
  networkState,
  version,
}: {
  topup: () => void;
  showBills: () => void;
  showKeys: () => void;
  showTools: () => void;
  checkNetwork: () => void;
  networkState: NetworkState;
  version: string;
}) {
  useLocale();
  const groupName = useGroupDisplayName();
  const {
    authState,
    wallet,
    isLoadingWallet,
    walletError,
    refreshWallet,
    logout,
  } = useAuth();
  const username =
    authState.user?.display_name ||
    authState.user?.username ||
    t("ui.9ba763ea3423");
  const requestCount = Math.max(0, wallet?.request_count ?? 0);
  const consumed = Math.max(0, wallet?.used_quota_usd ?? 0);
  const remaining = Math.max(0, wallet?.quota_usd ?? 0);
  const totalTracked = consumed + remaining;
  const usedPercent =
    wallet?.quota !== undefined && wallet.quota < 0
      ? 0
      : totalTracked > 0
        ? Math.min(100, (consumed / totalTracked) * 100)
        : 0;
  const networkLabel =
    networkState === "checking"
      ? t("accountCenter.networkChecking")
      : networkState === "reachable"
        ? t("accountCenter.networkOnline")
        : t("accountCenter.networkOffline");
  const Shortcut = ({
    icon: Icon,
    title,
    description,
    action,
    tone,
  }: {
    icon: typeof Activity;
    title: string;
    description: string;
    action: () => void;
    tone: string;
  }) => (
    <button
      type="button"
      onClick={action}
      className="group flex min-w-0 items-center gap-3 border border-slate-200/80 bg-white px-3.5 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-blue-400/30 dark:hover:bg-blue-400/[0.05]"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center ${tone}`}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-gray-100">
          {title}
        </span>
        <span className="mt-1 block truncate text-[10px] text-slate-500 dark:text-gray-400">
          {description}
        </span>
      </span>
      <ChevronRight
        size={15}
        className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500"
      />
    </button>
  );

  return (
    <section className="w-full space-y-5 text-slate-700 dark:text-gray-300">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-blue-600 text-base font-semibold text-white">
            {username.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-slate-900 dark:text-white">
              {username}
            </h1>
            <p className="mt-1 truncate text-xs text-slate-500">
              {t("accountCenter.subtitle")}
            </p>
          </div>
        </div>
        <button
          className={buttonClass + " text-slate-500"}
          onClick={() => void logout()}
        >
          <LogOut size={13} />
          {t("ui.094774b4a77b")}
        </button>
      </header>

      <section className="overflow-hidden border border-slate-200/90 bg-white/90 p-4 dark:border-white/10 dark:bg-[#111823] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center bg-blue-600 text-white">
              <Wallet size={17} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("accountCenter.walletTitle")}
              </h2>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {t("accountCenter.walletSubtitle")}
              </p>
            </div>
          </div>
          <button
            aria-label={t("common.refresh")}
            onClick={() => void refreshWallet()}
            disabled={isLoadingWallet}
            className={buttonClass}
          >
            <RefreshCw
              size={13}
              className={isLoadingWallet ? "animate-spin" : ""}
            />
            {t("common.refresh")}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="py-3 sm:pr-4 sm:py-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{t("accountCenter.available")}</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {t("accountCenter.walletBalance")}
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {wallet?.quota !== undefined && wallet.quota < 0
                ? t("ui.fa2de29515c3")
                : usd(wallet?.quota_usd)}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {t("accountCenter.balanceUnit")}
            </p>
          </div>
          <div className="py-3 sm:px-4 sm:py-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{t("accountCenter.consumed")}</span>
              <span className="text-slate-400">
                {t("accountCenter.lifetime")}
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-800 dark:text-gray-100">
              {usd(wallet?.used_quota_usd)}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {t("accountCenter.cumulativeSpend")}
            </p>
          </div>
          <div className="py-3 sm:pl-4 sm:py-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{t("accountCenter.requests")}</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                {t("accountCenter.lifetime")}
              </span>
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {requestCount.toLocaleString(getLocale())}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {t("accountCenter.requestCount")}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
            <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-gray-200">
              <Activity size={13} className="text-blue-500" />
              {t("accountCenter.usageHealth")}
            </span>
            <span className="tabular-nums text-slate-500">
              {wallet?.quota !== undefined && wallet.quota < 0
                ? t("accountCenter.unlimitedBalance")
                : `${t("accountCenter.availablePercent", { value: (100 - usedPercent).toFixed(1) })} · ${t("accountCenter.usedPercent", { value: usedPercent.toFixed(1) })}`}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden bg-slate-200 dark:bg-white/10"
            role="progressbar"
            aria-label={t("accountCenter.usageHealth")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usedPercent}
          >
            <div
              className="h-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
            <span>
              {t("accountCenter.trackedTotal", {
                value: usd(totalTracked),
              })}
            </span>
            {usedPercent < 90 ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check size={12} />
                {t("accountCenter.balanceHealthy")}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CircleAlert size={12} />
                {t("accountCenter.balanceLow")}
              </span>
            )}
          </div>
        </div>

        {walletError && (
          <p role="alert" className="mt-3 text-xs text-red-500">
            {walletError}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
          <button
            onClick={showBills}
            className={buttonClass + " bg-white/70 dark:bg-white/5"}
          >
            <ReceiptText size={14} />
            {t("accountCenter.walletBills")}
          </button>
          <button
            onClick={topup}
            className="inline-flex items-center gap-2 border border-blue-600 bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            {t("account.topup")}
            <ArrowUpRight size={14} />
          </button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("accountCenter.quickAccess")}
          </h2>
          <span className="text-[10px] text-slate-400">
            {t("accountCenter.quickAccessHint")}
          </span>
        </div>
        <div className="grid gap-2.5 md:grid-cols-2">
          <Shortcut
            icon={KeyRound}
            title={t("accountCenter.apiKeys")}
            description={t("accountCenter.apiKeysDescription")}
            action={showKeys}
            tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
          />
          <Shortcut
            icon={Wrench}
            title={t("accountCenter.tools")}
            description={t("accountCenter.toolsDescription")}
            action={showTools}
            tone="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
          />
        </div>
      </section>

      <section className="grid gap-5 border-y border-slate-200/80 py-4 dark:border-white/10 md:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-gray-100">
            <ArrowDownToLine size={15} className="text-blue-500" />
            {t("accountCenter.groupTitle")}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {wallet?.group
                ? groupName(wallet.group)
                : t("accountCenter.groupUnavailable")}
            </span>
            <span className="text-[10px] text-slate-500">
              {wallet?.group ? wallet.group : ""}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-slate-500">
            {t("accountCenter.groupDescription")}
          </p>
        </div>
        <div className="border-t border-slate-200/80 pt-4 dark:border-white/10 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-gray-100">
              {networkState === "reachable" ? (
                <Check size={15} className="text-emerald-500" />
              ) : networkState === "unreachable" ? (
                <CircleAlert size={15} className="text-amber-500" />
              ) : (
                <Clock3 size={15} className="text-blue-500" />
              )}
              {t("accountCenter.serviceStatus")}
            </div>
            <button
              type="button"
              className={buttonClass + " px-2.5 py-1.5"}
              onClick={checkNetwork}
              disabled={networkState === "checking"}
            >
              <RefreshCw
                size={12}
                className={networkState === "checking" ? "animate-spin" : ""}
              />
              {t("accountCenter.testConnection")}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-slate-500">{new URL(BRAND.siteUrl).hostname}</span>
            <span
              className={
                networkState === "reachable"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : networkState === "unreachable"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500"
              }
            >
              {networkLabel}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
            <span className="text-slate-500">
              {t("accountCenter.clientVersion")}
            </span>
            <span className="font-mono text-slate-500">
              {BRAND.productName} v{version}
            </span>
          </div>
        </div>
      </section>
    </section>
  );
}
