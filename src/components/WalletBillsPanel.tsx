import { useEffect, useState } from "react";
import { getLocale, t, useLocale } from "../lib/i18n";
import { getWalletBills } from "../lib/api";
import { usd, type WalletBillPage } from "../lib/account-data";
import {
  buttonClass,
  cardClass,
  DataHeader,
  Pagination,
} from "./AccountDataUI";

function formatDate(value?: number) {
  if (!value) return "—";
  return new Date(value * 1000).toLocaleString(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function compactOrder(value?: string) {
  if (!value) return "—";
  return value.length > 18
    ? `${value.slice(0, 10)}..${value.slice(-6)}`
    : value;
}

function statusLabel(status?: string) {
  switch (status?.toLowerCase()) {
    case "success":
    case "completed":
      return t("usage.billStatusSuccess");
    case "pending":
      return t("usage.billStatusPending");
    case "failed":
    case "canceled":
    case "cancelled":
      return t("usage.billStatusFailed");
    default:
      return status || "—";
  }
}

function statusTone(status?: string) {
  switch (status?.toLowerCase()) {
    case "success":
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300";
    case "failed":
    case "canceled":
    case "cancelled":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300";
  }
}

export default function WalletBillsPanel() {
  useLocale();
  const [data, setData] = useState<WalletBillPage | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    getWalletBills({ p: page, page_size: pageSize })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, pageSize, version]);

  return (
    <section className="w-full text-slate-700 dark:text-gray-300">
      <DataHeader
        title={t("usage.billView")}
        description={t("usage.billDescription")}
        loading={loading}
        refresh={() => setVersion((current) => current + 1)}
      />
      <div className={cardClass + " overflow-hidden"}>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {t("usage.loadingBill")}
          </div>
        ) : error ? (
          <div role="alert" className="p-6 text-sm text-red-500">
            {error}
            <button
              type="button"
              className={buttonClass + " ml-3"}
              onClick={() => setVersion((current) => current + 1)}
            >
              {t("ui.e2d53a6d3a6a")}
            </button>
          </div>
        ) : !data?.items?.length ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {t("usage.emptyWalletBills")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-fixed whitespace-nowrap text-left text-xs leading-5">
              <colgroup>
                {[150, 170, 130, 140, 150, 150, 150].map((width, index) => (
                  <col
                    key={index}
                    style={{ width: `${(width / 1040) * 100}%` }}
                  />
                ))}
              </colgroup>
              <thead className="border-b-2 border-blue-500/60 bg-slate-50/95 text-slate-600 dark:bg-white/[0.045] dark:text-gray-300">
                <tr>
                  {[
                    t("usage.billDate"),
                    t("usage.billOrder"),
                    t("usage.billAmount"),
                    t("usage.billCredit"),
                    t("usage.billMethod"),
                    t("usage.billStatus"),
                    t("usage.billCompletedAt"),
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.items.map((bill) => {
                  const order = bill.trade_no || bill.payment_order_no;
                  return (
                    <tr
                      key={bill.id}
                      className="transition-colors odd:bg-slate-50/35 hover:bg-blue-50/60 dark:odd:bg-white/[0.012] dark:hover:bg-blue-400/[0.045]"
                    >
                      <td className="px-3 py-3 tabular-nums text-slate-800 dark:text-gray-100">
                        {formatDate(bill.create_time)}
                      </td>
                      <td className="px-3 py-3 tabular-nums font-mono text-[10px] text-slate-500 dark:text-gray-400">
                        <code className="text-[11px]" title={order}>
                          {compactOrder(order)}
                        </code>
                      </td>
                      <td className="px-3 py-3 tabular-nums font-semibold text-slate-800 dark:text-gray-100">
                        {bill.money === undefined ? "—" : usd(bill.money)}
                      </td>
                      <td className="px-3 py-3 tabular-nums font-medium text-emerald-700 dark:text-emerald-300">
                        {bill.credit_amount !== undefined
                          ? usd(bill.credit_amount)
                          : bill.amount !== undefined
                            ? usd(bill.amount)
                            : "—"}
                      </td>
                      <td className="px-3 py-3">
                        {bill.payment_method || bill.payment_provider || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block border px-2 py-0.5 text-[10px] font-medium ${statusTone(bill.status)}`}
                          title={
                            bill.status?.toLowerCase() === "pending"
                              ? t("usage.billStatusPendingHelp")
                              : undefined
                          }
                        >
                          {statusLabel(bill.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {formatDate(bill.complete_time)}
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
          page={page}
          total={data.total}
          size={pageSize}
          setPage={setPage}
          visibleCount={data.items?.length ?? 0}
          setSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
