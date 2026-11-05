import { t, useLocale } from "../lib/i18n";
import React, { useState } from "react";
import { Wallet, RefreshCw, Loader2, AlertCircle, Coins } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/useAuth";
import { cn } from "../lib/utils";
import TopupDialog from "./TopupDialog";

export interface AccountBalanceCardProps {
  className?: string;
}

export const AccountBalanceCard: React.FC<AccountBalanceCardProps> = ({
  className,
}) => {
  useLocale();
  const {
    authState,
    wallet,
    isLoadingWallet,
    walletError,
    refreshWallet,
    setLoginModalOpen,
  } = useAuth();
  const [topupOpen, setTopupOpen] = useState(false);

  const handleOpenTopup = () => {
    setTopupOpen(true);
  };

  const handleManualRefresh = async () => {
    try {
      await refreshWallet();
      toast.success(t("ui.4a07a6fc839f"));
    } catch {
      toast.error(t("ui.5d12b62000a7"));
    }
  };

  // 若未登录，展示极简引导登录卡片或提供便捷入口
  if (!authState.is_logged_in) {
    return (
      <div
        className={cn(
          "p-2.5 rounded-xl border text-xs transition-all",
          "bg-slate-50/70 border-slate-200/80 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-400",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5">
            <Wallet size={12} className="opacity-60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-75">
              {t("ui.a53710fd7d15")}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-slate-400 dark:text-gray-500">
            {t("ui.36baeffb16cc")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="text-[10px] font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {t("ui.6c01b0cfd0e4")}
            </button>
            <button
              type="button"
              onClick={() => setLoginModalOpen(true)}
              className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer disabled:opacity-50"
            >
              {t("account.topup")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "p-2.5 rounded-xl border text-xs transition-all",
          "bg-indigo-50/60 border-indigo-200/70 text-slate-800 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-slate-200",
          className,
        )}
      >
        {/* 头部：标题、用户分组与刷新/充值按钮 */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Wallet
              size={12}
              className="text-indigo-600 dark:text-indigo-400 flex-shrink-0"
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 opacity-90 truncate">
              {t("ui.a53710fd7d15")}
            </span>
            {wallet?.group && (
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-200/60 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-300 uppercase tracking-tight flex-shrink-0"
                title={t("ui.16f9e83af0e0", { v0: wallet.group })}
              >
                {wallet.group}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* 刷新按钮 */}
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              disabled={isLoadingWallet}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 text-slate-500 dark:text-gray-400"
              title={t("ui.44ea1d810539")}
            >
              <RefreshCw
                size={11}
                className={
                  isLoadingWallet ? "animate-spin text-indigo-600" : ""
                }
              />
            </button>

            {/* 内置充值窗口 */}
            <button
              type="button"
              onClick={() => void handleOpenTopup()}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-white/10 transition-colors cursor-pointer shadow-2xs"
              title={t("ui.18a6c36399de")}
            >
              <span>{t("account.topup")}</span>
            </button>
          </div>
        </div>

        {/* 核心数值展示区域 */}
        {isLoadingWallet && !wallet ? (
          <div className="flex items-center gap-2 py-1">
            <Loader2
              size={13}
              className="animate-spin text-indigo-600 dark:text-indigo-400 flex-shrink-0"
            />
            <span className="text-[11px] text-slate-500 dark:text-gray-400">
              {t("ui.1e7950f4b216")}
            </span>
          </div>
        ) : walletError && !wallet ? (
          <div className="flex items-center justify-between gap-1 py-0.5">
            <div className="flex items-center gap-1.5 min-w-0 text-amber-600 dark:text-amber-400">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span className="text-[11px] truncate">{walletError}</span>
            </div>
            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0 cursor-pointer"
            >
              {t("ui.e2d53a6d3a6a")}
            </button>
          </div>
        ) : wallet ? (
          <div>
            {/* 账号额度按美元 1:1 显示 */}
            <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
              <div className="flex items-baseline gap-1.5">
                {wallet.quota < 0 ? (
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    {t("ui.fa2de29515c3")}
                  </span>
                ) : (
                  <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white tracking-tight">
                    ${wallet.quota_usd.toFixed(2)}
                  </span>
                )}
              </div>

              <div
                className="flex items-center gap-1 text-[10px] font-mono text-slate-400 dark:text-gray-400"
                title={t("ui.da1023b32326")}
              >
                <Coins size={10} className="text-amber-500" />
                <span>1:1</span>
              </div>
            </div>

            {/* 辅助指标栏：已消耗与充值跳转 */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-gray-500 font-mono mt-1 pt-1 border-t border-indigo-200/50 dark:border-white/5">
              <span
                className="truncate mr-1"
                title={t("ui.5bde8b56a297", {
                  v0: wallet.used_quota_usd.toFixed(2),
                })}
              >
                {t("message.cb2f09439534", {
                  v0: wallet.used_quota_usd.toFixed(2),
                })}
              </span>
              <button
                type="button"
                onClick={() => void handleOpenTopup()}
                className="hover:text-indigo-600 dark:hover:text-indigo-300 text-indigo-600/80 dark:text-indigo-400/80 transition-colors flex items-center gap-0.5 cursor-pointer font-sans shrink-0"
                title={t("ui.18a6c36399de")}
              >
                <span>{t("ui.7e64dae0afa7")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-1 text-slate-400 dark:text-gray-500 text-[11px]">
            <span>{t("ui.ddb770a078ac")}</span>
          </div>
        )}
      </div>
      <TopupDialog
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onRefreshWallet={refreshWallet}
      />
    </>
  );
};

export default AccountBalanceCard;
