import { t, useLocale } from "../lib/i18n";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  calculateTopupAmount,
  getTopupInfo,
  getSiteStatus,
  openPaymentForm,
  openPaymentWindow,
  requestTopupPayment,
} from "../lib/api";
import {
  feeFromTotal,
  minimumTopup,
  normalizeTopupInfo,
  positiveAmount as asAmount,
  processingFee,
} from "../lib/topup";
import { SiAlipay, SiWechat, SiStripe } from "react-icons/si";
import type { TopupInfo, TopupPaymentMethod } from "../types";

interface TopupDialogProps {
  open: boolean;
  onClose: () => void;
  onRefreshWallet: () => Promise<void>;
}

const methodLabel = (method: TopupPaymentMethod) => {
  if (method.name?.trim()) return method.name;
  const labels: Record<string, string> = {
    alipay: t("ui.66f1177d677b"),
    wxpay: t("ui.64aeba8fbc56"),
    stripe: "Stripe",
    stripe_alipay: t("ui.ef049b98c9fa"),
    creem: "Creem",
    waffo: "Waffo",
    waffo_pancake: "Waffo Pancake",
  };
  return labels[method.type] ?? method.type;
};

const methodColor = (method: TopupPaymentMethod) => {
  if (method.color) return method.color;
  const colors: Record<string, string> = {
    alipay: "#1677ff",
    wxpay: "#07c160",
    stripe: "#635bff",
    stripe_alipay: "#1677ff",
    creem: "#6366f1",
    waffo: "#2563eb",
    waffo_pancake: "#f97316",
  };
  return colors[method.type] ?? "#64748b";
};

const PaymentIcon = ({ method }: { method: TopupPaymentMethod }) => {
  useLocale();
  const [failedIcon, setFailedIcon] = useState("");
  const icon = method.icon?.trim();
  if (icon && /^https:\/\//i.test(icon) && failedIcon !== icon) {
    return (
      <img
        src={icon}
        alt=""
        referrerPolicy="no-referrer"
        className="h-5 w-5 object-contain"
        onError={() => setFailedIcon(icon)}
      />
    );
  }
  const names: Record<string, string> = {
    alipay: "SiAlipay",
    alipay_plus: "SiAlipay",
    wxpay: "SiWechat",
    stripe: "SiStripe",
  };
  const name = icon || names[method.type];
  const Icon = (
    { SiAlipay, SiWechat, SiStripe } as Record<
      string,
      React.ComponentType<{ size: number }>
    >
  )[name || ""];
  return Icon ? <Icon size={18} /> : <CreditCard size={18} />;
};

export const TopupDialog: React.FC<TopupDialogProps> = ({
  open,
  onClose,
  onRefreshWallet,
}) => {
  useLocale();
  const [info, setInfo] = useState<TopupInfo | null>(null);
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [customAmount, setCustomAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{
    key: string;
    amount: number;
    error?: string;
  } | null>(null);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [siteCurrency, setSiteCurrency] = useState("$");

  const loadInfo = async () => {
    setLoading(true);
    setQuote(null);
    setError(null);
    try {
      const [rawInfo, siteStatus] = await Promise.all([
        getTopupInfo(),
        getSiteStatus(),
      ]);
      const data = normalizeTopupInfo(rawInfo);
      setSiteCurrency(
        siteStatus.quota_display_type === "CNY"
          ? "¥"
          : siteStatus.quota_display_type === "CUSTOM"
            ? siteStatus.custom_currency_symbol || "¤"
            : "$",
      );
      const amounts = (data.amount_options ?? []).map(asAmount).filter(Boolean);
      const methods = data.pay_methods ?? [];
      setInfo(data);
      const method =
        methods.find((item) => item.id === selectedMethod) ?? methods[0];
      const min = minimumTopup(data, method);
      setSelectedAmount(amounts.find((value) => value >= min) || min);
      setCustomAmount("");
      setSelectedMethod(method?.id || "");
    } catch (err) {
      const message = typeof err === "string" ? err : t("ui.0a803eb2b59b");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadInfo();
  }, [open]);

  const methods = info?.pay_methods ?? [];
  const currentMethod =
    methods.find((method) => method.id === selectedMethod) ?? methods[0];
  const amount =
    currentMethod?.fixed_amount ??
    (customAmount !== "" ? asAmount(customAmount) : selectedAmount);
  const minimum = minimumTopup(info, currentMethod);
  const validAmount = Number.isSafeInteger(amount) && amount >= minimum;
  const quoteKey = `${amount}:${currentMethod?.id}:${quoteRetry}`;
  const quoteReady =
    quote?.key === quoteKey && quote.amount > 0 && !quote.error;
  const payable = quoteReady ? quote.amount : 0;
  const currency =
    currentMethod?.currency === "EUR"
      ? "€"
      : currentMethod?.type === "stripe" ||
          currentMethod?.type === "creem" ||
          currentMethod?.type === "waffo_pancake"
        ? "$"
        : siteCurrency;
  const fee = feeFromTotal(payable, currentMethod?.type || "", info);

  useEffect(() => {
    setQuote(null);
    if (!open || loading || !info || !currentMethod || !validAmount) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const data =
          currentMethod.fixed_price ??
          (await calculateTopupAmount(amount, currentMethod.type));
        const record =
          data && typeof data === "object"
            ? (data as Record<string, unknown>)
            : null;
        const value = asAmount(
          record
            ? (record.amount ?? record.base_amount ?? record.display_amount)
            : data,
        );
        if (!value) throw new Error(t("ui.c36b7775d327"));
        if (!cancelled) setQuote({ key: quoteKey, amount: value });
      } catch (err) {
        if (!cancelled)
          setQuote({
            key: quoteKey,
            amount: 0,
            error:
              typeof err === "string"
                ? err
                : (err as Error).message || t("ui.7c9d5f0de705"),
          });
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, loading, info, currentMethod, amount, validAmount, quoteKey]);

  const submitPayment = async () => {
    if (!currentMethod) {
      toast.error(t("ui.327c8c39eebb"));
      return;
    }
    if (paying || !validAmount || !quoteReady) {
      toast.error(t("ui.4be636de0907", { v0: minimum }));
      return;
    }
    setPaying(true);
    try {
      const result = await requestTopupPayment(
        amount,
        currentMethod.type,
        currentMethod.waffo_index,
        currentMethod.product_id,
      );
      const data =
        result.data && typeof result.data === "object" ? result.data : null;
      const url =
        result.url ||
        (data?.pay_link as string | undefined) ||
        (data?.payment_url as string | undefined) ||
        (data?.checkout_url as string | undefined) ||
        (data?.url as string | undefined);
      if (!url) {
        throw new Error(t("ui.c5771ad685ba"));
      }
      if (
        result.url &&
        data &&
        !["stripe", "waffo", "waffo_pancake", "creem"].includes(
          currentMethod.type,
        )
      ) {
        const fields = Object.fromEntries(
          Object.entries(data)
            .filter(([, value]) => value !== null && value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        );
        await openPaymentForm(url, fields);
      } else {
        await openPaymentWindow(url);
      }
      toast.success(t("ui.95314193066f"));
      await onRefreshWallet();
    } catch (err) {
      toast.error(
        typeof err === "string"
          ? err
          : (err as Error)?.message || t("ui.d700b85d5394"),
      );
    } finally {
      setPaying(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 top-11 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !paying) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("ui.c833c89f3f8a")}
        className="flex max-h-[calc(100vh-5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-800 shadow-2xl dark:border-white/10 dark:bg-[#111522] dark:text-slate-100"
      >
        <header className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/80 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Wallet size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {t("ui.c833c89f3f8a")}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t("ui.993802d8928d")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={paying}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
            title={t("common.close")}
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 size={17} className="animate-spin" />{" "}
              {t("ui.87c5c6651c2a")}
            </div>
          ) : error ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-rose-500">{error}</p>
              <button
                type="button"
                onClick={() => void loadInfo()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
              >
                <RefreshCw size={13} />
                {t("ui.726593d24aab")}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t("ui.29757efaec9e")}
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {t("message.3f3fd9166a37", { v0: minimum.toFixed(2) })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(info?.amount_options ?? []).map((option) => {
                    const value = asAmount(option);
                    const active = !customAmount && value === selectedAmount;
                    const disabled =
                      paying || !!currentMethod?.product_id || value < minimum;
                    return (
                      <button
                        type="button"
                        key={value}
                        disabled={disabled}
                        title={
                          value < minimum
                            ? t("ui.11267606a811", { v0: minimum })
                            : undefined
                        }
                        onClick={() => {
                          setSelectedAmount(value);
                          setCustomAmount("");
                        }}
                        className={`relative rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active && !disabled ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/10" : "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/60"}`}
                      >
                        {active && (
                          <Check
                            size={14}
                            className="absolute right-2 top-2 text-indigo-600"
                          />
                        )}
                        <div className="text-lg font-semibold tabular-nums">
                          ${value.toLocaleString()}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {value < minimum
                            ? t("ui.a9b7aade4d14", { v0: minimum })
                            : t("ui.db75217295b1")}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <label className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {t("ui.a71cc27720ce")}
                  </label>
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                      $
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={minimum}
                      step={1}
                      disabled={paying || !!currentMethod?.product_id}
                      aria-label={t("ui.e979d4c9fa4c")}
                      aria-invalid={!validAmount}
                      value={customAmount}
                      onChange={(event) => {
                        setSelectedAmount(0);
                        setCustomAmount(event.target.value);
                      }}
                      placeholder={t("ui.a9b7aade4d14", { v0: minimum })}
                      className="w-full rounded-lg border border-slate-200 bg-transparent py-2.5 pl-7 pr-3 text-sm outline-none ring-indigo-500 transition focus:ring-2 dark:border-white/10"
                    />
                  </div>
                  <div className="shrink-0 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                    {t("ui.dcf90c5ca841")}{" "}
                    <strong className="ml-1 text-slate-800 dark:text-white">
                      {!validAmount
                        ? "—"
                        : quoteReady
                          ? `${currency}${payable.toFixed(2)}`
                          : quote?.key === quoteKey && quote.error
                            ? t("ui.95b6cf05ae76")
                            : t("ui.701173443035")}
                    </strong>
                  </div>
                </div>
                {!validAmount && (
                  <p role="alert" className="mt-2 text-xs text-amber-600">
                    {t("message.dec117ff1f05", { v0: minimum })}
                  </p>
                )}
                {quote?.key === quoteKey && quote.error && (
                  <p role="alert" className="mt-2 text-xs text-rose-500">
                    {quote.error}{" "}
                    <button
                      type="button"
                      onClick={() => setQuoteRetry((value) => value + 1)}
                      className="underline"
                    >
                      {t("ui.3635d74e2884")}
                    </button>
                  </p>
                )}
                {fee > 0 && (
                  <p className="mt-2 text-xs text-orange-600">
                    {t("message.ef42e515674e", {
                      v0: currency,
                      v1: fee.toFixed(2),
                    })}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t("ui.c6b9a8cfdb21")}
                </div>
                {methods.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {methods.map((method) => {
                      const active = method.id === currentMethod?.id;
                      const min = minimumTopup(info, method);
                      const belowMin =
                        !method.product_id &&
                        !currentMethod?.product_id &&
                        (!Number.isSafeInteger(amount) || amount < min);
                      const methodFee = processingFee(
                        Math.max(0, payable - fee),
                        method.type,
                        info,
                      );
                      return (
                        <button
                          type="button"
                          key={method.id}
                          disabled={paying || belowMin}
                          title={
                            belowMin
                              ? t("ui.11267606a811", { v0: min })
                              : method.name
                          }
                          onClick={() => {
                            if (
                              currentMethod?.product_id &&
                              !method.product_id
                            ) {
                              setSelectedAmount(Math.max(min, selectedAmount));
                              setCustomAmount("");
                            }
                            setSelectedMethod(method.id || "");
                          }}
                          className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/10" : "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/60"}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs font-bold dark:bg-white/10"
                              style={{ color: methodColor(method) }}
                            >
                              <PaymentIcon method={method} />
                            </span>
                            <span>
                              <span className="block text-sm font-medium">
                                {methodLabel(method)}
                              </span>
                              {method.product_id ? (
                                <span className="block text-[11px] text-slate-500">
                                  ${method.fixed_amount}
                                  {t("ui.77934b654ef4")}{" "}
                                  {method.currency === "EUR" ? "€" : "$"}
                                  {method.fixed_price?.toFixed(2)}
                                </span>
                              ) : belowMin ? (
                                <span className="block text-[11px] text-amber-600">
                                  {t("message.a9b7aade4d14", { v0: min })}
                                </span>
                              ) : (
                                <span className="block text-[11px] text-slate-500">
                                  {quoteReady
                                    ? methodFee > 0
                                      ? t("ui.670e5a82f671", {
                                          v0: currency,
                                          v1: methodFee.toFixed(2),
                                        })
                                      : t("ui.fc614d8b81c6")
                                    : t("ui.a9b7aade4d14", { v0: min })}
                                </span>
                              )}
                            </span>
                          </span>
                          {active && (
                            <Check size={15} className="text-indigo-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500 dark:border-white/15">
                    {t("ui.3f4876be1867")}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                <span>{t("ui.c7c82ef07d69")}</span>
                <span className="flex items-center gap-1">
                  <ExternalLink size={12} />
                  {t("ui.973260a507af")}
                </span>
              </div>
            </div>
          )}
        </div>

        {!loading && !error && (
          <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4 dark:border-white/10 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={onClose}
              disabled={paying}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-white disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void submitPayment()}
              disabled={paying || !currentMethod || !validAmount || !quoteReady}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paying ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CreditCard size={14} />
              )}
              {paying
                ? t("ui.0c142d69c764")
                : quoteReady
                  ? t("ui.cfecb603ed6b", {
                      v0: currency,
                      v1: payable.toFixed(2),
                    })
                  : t("ui.0a7494b3bcab")}
            </button>
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
};

export default TopupDialog;
