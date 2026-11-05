import { t, useLocale } from "../lib/i18n";
import {
  Boxes,
  LayoutDashboard,
  UserRound,
  Wrench,
  ChevronRight,
  Wallet,
  Wifi,
  WifiOff,
  Loader2,
  KeyRound,
  LifeBuoy,
} from "lucide-react";
import { cn } from "../lib/utils";

export type AppSection =
  | "workspace"
  | "models"
  | "keys"
  | "tickets"
  | "account"
  | "tools"
  | "settings";
const items = [
  {
    id: "workspace",
    get label() {
      return t("nav.workspace");
    },
    get description() {
      return t("ui.d4c52dc041b4");
    },
    icon: LayoutDashboard,
  },
  {
    id: "models",
    get label() {
      return t("nav.models");
    },
    get description() {
      return t("ui.5adba45e4415");
    },
    icon: Boxes,
  },
  {
    id: "keys",
    get label() {
      return t("nav.keys");
    },
    get description() {
      return t("ui.300ff4e67937");
    },
    icon: KeyRound,
  },
  {
    id: "tickets",
    get label() {
      return t("nav.tickets");
    },
    get description() {
      return t("nav.ticketsDescription");
    },
    icon: LifeBuoy,
  },
  {
    id: "tools",
    get label() {
      return t("nav.tools");
    },
    get description() {
      return t("ui.f81dc6b9f569");
    },
    icon: Wrench,
  },
] as const;

export default function AppSidebar({
  section,
  collapsed,
  navigate,
  username,
  balance,
  network,
  checkNetwork,
  topup,
  version,
}: {
  section: AppSection;
  collapsed: boolean;
  navigate: (section: AppSection) => void;
  username: string;
  balance?: number;
  network: "checking" | "reachable" | "unreachable";
  checkNetwork: () => void;
  topup: () => void;
  version: string;
}) {
  useLocale();
  return (
    <aside
      aria-label={t("ui.fb1c7dc70a99")}
      className={cn(
        "flex shrink-0 flex-col overflow-y-auto border-r border-slate-200/80 bg-white/75 backdrop-blur-xl transition-[width] duration-200 dark:border-white/[0.07] dark:bg-[#0d1019]/90",
        collapsed ? "w-[72px] px-2 py-5" : "w-[216px] p-4",
      )}
    >
      <div className={cn("mb-4 px-3", collapsed && "px-0 text-center")}>
        <div className="text-[10px] font-bold tracking-[0.22em] text-blue-500">
          {collapsed ? "U" : "UOCODE CLIENT"}
        </div>
        {!collapsed && (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-gray-500">
            {t("ui.803d06cb08fb")}
          </p>
        )}
      </div>
      <nav className="flex-1 space-y-1" aria-label={t("ui.295018abdd16")}>
        {items.map(({ id, label, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(id)}
            aria-label={label}
            title={collapsed ? label : undefined}
            aria-current={section === id ? "page" : undefined}
            className={cn(
              "group relative flex w-full items-center gap-1.5 rounded-lg border py-2.5 text-left transition-colors",
              collapsed ? "justify-center px-0" : "px-2",
              section === id
                ? "border-blue-500/20 bg-blue-500/[0.09] text-blue-600 dark:border-blue-400/15 dark:bg-blue-400/[0.09] dark:text-blue-400"
                : "border-transparent text-slate-500 hover:bg-slate-100/80 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200",
            )}
          >
            <Icon
              size={19}
              strokeWidth={section === id ? 2 : 1.7}
              className="shrink-0"
            />
            {!collapsed && (
              <>
                <div
                  className="min-w-0 flex-1"
                  title={`${label} · ${description}`}
                >
                  <div className="truncate text-[13px] font-semibold">
                    {label}
                  </div>
                  <div className="sidebar-nav-description mt-0.5 truncate text-[10px] text-slate-400 dark:text-gray-500">
                    {description}
                  </div>
                </div>
                <ChevronRight
                  size={13}
                  aria-hidden="true"
                  className={cn("shrink-0", section !== id && "invisible")}
                />
              </>
            )}
          </button>
        ))}
      </nav>
      <div className="mt-3 space-y-2">
        <div
          className={cn(
            "sidebar-account border-t border-slate-200 pt-4 dark:border-white/10",
            collapsed ? "space-y-3" : "space-y-4",
          )}
        >
          <button
            type="button"
            aria-label={t("ui.7fcfb90a3528")}
            aria-current={section === "account" ? "page" : undefined}
            title={`${t("nav.account")}${username ? ` · ${username}` : ""}`}
            onClick={() => navigate("account")}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border text-left transition-colors",
              collapsed ? "justify-center py-2" : "px-1 py-2",
              section === "account"
                ? "border-blue-500/20 bg-blue-500/[0.09] text-blue-600 dark:border-blue-400/15 dark:bg-blue-400/[0.09] dark:text-blue-400"
                : "border-transparent hover:bg-slate-100 dark:hover:bg-white/5",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-500">
              <UserRound size={18} />
            </span>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-gray-200">
                    {username || t("ui.e8041a8c9358")}
                  </p>
                  <p
                    className={cn(
                      "mt-1 truncate text-[10px]",
                      section === "account"
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-400",
                    )}
                  >
                    {t("nav.account")}
                  </p>
                </div>
                <ChevronRight
                  size={14}
                  className={cn(
                    "shrink-0",
                    section === "account" ? "text-blue-500" : "text-slate-400",
                  )}
                />
              </>
            )}
          </button>
          {!collapsed && (
            <div className="px-1 pb-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{t("ui.f34ba50a5aeb")}</span>
                <Wallet size={12} />
              </div>
              <div className="mt-2 mb-3 truncate text-xl font-semibold tracking-tight text-slate-900 dark:text-gray-100">
                {balance === undefined
                  ? "—"
                  : "$" +
                    balance.toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}
              </div>
              <button
                onClick={topup}
                className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-blue-500/25 bg-blue-500/10 text-xs font-medium text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
              >
                <Wallet size={13} />
                {t("account.topup")}
              </button>
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex items-center border-t border-slate-200/80 pt-3 dark:border-white/[0.07]",
            collapsed ? "justify-center" : "justify-between px-1",
          )}
        >
          <button
            aria-label={t("ui.167a5e5cf7ef")}
            title={t("ui.167a5e5cf7ef")}
            onClick={checkNetwork}
            className={cn(
              "flex items-center gap-1.5 text-[10px]",
              network === "reachable"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-400",
            )}
          >
            {network === "checking" ? (
              <Loader2 size={12} className="animate-spin" />
            ) : network === "reachable" ? (
              <Wifi size={12} />
            ) : (
              <WifiOff size={12} />
            )}
            {!collapsed &&
              (network === "checking"
                ? t("ui.699ade165469")
                : network === "reachable"
                  ? t("ui.888ce8db3d9d")
                  : t("ui.cf539eb8da42"))}
          </button>
          {!collapsed && (
            <span className="text-[9px] text-slate-400 dark:text-gray-600">
              v{version}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
