import { t, useLocale } from "./lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  Minus,
  Maximize2,
  Minimize2,
  X,
  Loader2,
  RefreshCw,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import ConfigChangeNotice from "./components/ConfigChangeNotice";
import { IconButton } from "./components/ui/IconButton";
import {
  BrandLogo,
  OpenAIIcon,
  ClaudeIcon,
  WorkbuddyIcon,
  AccioWorkIcon,
} from "./components/BrandIcons";
import { ChatGPTPanel } from "./components/ChatGPTPanel";
import { ClaudePanel } from "./components/ClaudePanel";
import { WorkbuddyPanel } from "./components/WorkbuddyPanel";
import { AccioWorkPanel } from "./components/AccioWorkPanel";
import { AppPathsPanel } from "./components/AppPathsPanel";
import { QuickToolsModal } from "./components/QuickToolsModal";
import { InitializationModal } from "./components/InitializationModal";
import { LoginModal } from "./components/auth/LoginModal";
import { TokenSelectModal } from "./components/auth/TokenSelectModal";
import AppSidebar, { type AppSection } from "./components/AppSidebar";
import WorkspaceTabs from "./components/WorkspaceTabs";
import ScrollToTop from "./components/ScrollToTop";
import AccountOverview from "./components/AccountOverview";
import ToolsOverview from "./components/ToolsOverview";
import TopupDialog from "./components/TopupDialog";
import PricingPanel from "./components/PricingPanel";
import UsageLogsPanel from "./components/UsageLogsPanel";
import WalletBillsPanel from "./components/WalletBillsPanel";
import SecurityPanel from "./components/SecurityPanel";
import TicketCenter from "./components/TicketCenter";
import KeysPanel from "./components/KeysPanel";
import SettingsPanel from "./components/SettingsPanel";
import { getPreferences, usePreferences } from "./lib/preferences";
import AnnouncementBell from "./components/AnnouncementBell";
import { AuthProvider, useAuth } from "./lib/useAuth";
import { ThemeToggle } from "./components/ThemeToggle";
import { useTheme } from "./components/theme-provider";
import { AuroraBackground } from "./components/react-bits/AuroraBackground";
import { cn } from "./lib/utils";
import {
  checkBobApiNetwork,
  openUrl,
  isTauri,
  applyApiKeyToAgents,
} from "./lib/api";
import { isMac, modifierKey } from "./lib/platform";
import { ForceUpdateModal, useAppUpdater } from "./components/ForceUpdateModal";
import type { UserInfo } from "./types";

type Tab =
  | "chatgpt"
  | "claude"
  | "workbuddy"
  | "acciowork"
  | "paths"
  | "pricing"
  | "usage"
  | "wallet"
  | "security"
  | "tickets"
  | "keys"
  | "settings"
  | "account"
  | "tools";
type NetworkState = "checking" | "reachable" | "unreachable";
const toolTabs = ["tools", "paths"] as const;
const isToolsTab = (value: string) =>
  (toolTabs as readonly string[]).includes(value);

const mockWindow = {
  isMaximized: async () => false,
  toggleMaximize: async () => {},
  minimize: async () => {},
  close: async () => {},
  hide: async () => {},
  onResized: async (_cb: () => void) => () => {},
  show: async () => {},
  setFocus: async () => {},
};

const appWindow = isTauri ? getCurrentWindow() : mockWindow;

export default function App() {
  useLocale();
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  useLocale();
  const [tab, setTab] = useState<Tab>(() => {
    const page = getPreferences().startPage;
    return page === "workspace" ? "chatgpt" : page;
  });
  const { preferences } = usePreferences();
  const mainRef = useRef<HTMLElement>(null);
  const isListPage =
    tab === "pricing" ||
    tab === "usage" ||
    tab === "wallet" ||
    tab === "keys" ||
    tab === "tickets";
  const [lastAccountTab, setLastAccountTab] = useState<
    "account" | "wallet" | "security"
  >("account");
  const [lastToolsTab, setLastToolsTab] = useState<Tab>("tools");
  const section: AppSection =
    tab === "pricing"
      ? "models"
      : tab === "keys"
        ? "keys"
        : tab === "usage"
          ? "keys"
          : tab === "tickets"
            ? "tickets"
            : tab === "settings"
              ? "settings"
              : tab === "account" || tab === "wallet" || tab === "security"
                ? "account"
                : isToolsTab(tab)
                  ? "tools"
                  : "workspace";
  const [lastAgentTab, setLastAgentTab] = useState<
    "chatgpt" | "claude" | "workbuddy" | "acciowork"
  >("chatgpt");
  const [networkState, setNetworkState] = useState<NetworkState>("checking");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [usageToken, setUsageToken] = useState("");
  const [initModalOpen, setInitModalOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("...");
  const { resolvedTheme } = useTheme();
  const win = appWindow;

  const {
    authState,
    isAuthReady,
    wallet,
    refreshWallet,
    loginModalOpen,
    setLoginModalOpen,
    tokenModalOpen,
    setTokenModalOpen,
    onLoginSuccess,
  } = useAuth();

  const [isInitialized, setIsInitialized] = useState<boolean>(() => {
    return Boolean(
      localStorage.getItem("ai_helper_init_completed") ||
        localStorage.getItem("bobapi_init_completed"),
    );
  });

  const switchTab = (newTab: Tab) => {
    setTab(newTab);
    if (newTab === "account" || newTab === "wallet" || newTab === "security")
      setLastAccountTab(newTab);
    if (isToolsTab(newTab)) setLastToolsTab(newTab);
    if (
      newTab === "chatgpt" ||
      newTab === "claude" ||
      newTab === "workbuddy" ||
      newTab === "acciowork"
    ) {
      setLastAgentTab(newTab);
    }
  };

  const navigateSection = (next: AppSection) => {
    switchTab(
      next === "workspace"
        ? lastAgentTab
        : next === "models"
          ? "pricing"
          : next === "account"
            ? lastAccountTab
            : next === "keys"
              ? "keys"
              : next === "tickets"
                ? "tickets"
                : next === "settings"
                  ? "settings"
                  : lastToolsTab,
    );
  };

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  // ── 侧边栏整体折叠与分组折叠状态持久化 ──
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("ai_helper_sidebar_collapsed") === "true";
  });

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("ai_helper_sidebar_collapsed", String(next));
      return next;
    });
  };

  // 全局快捷键 Ctrl+B / Cmd+B 切换左侧栏收起/展开
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const active = document.activeElement;
        const isInput =
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            (active as HTMLElement).isContentEditable);
        if (!isInput) {
          e.preventDefault();
          toggleSidebarCollapsed();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const {
    phase: updatePhase,
    backendInfo: updateBackendInfo,
    currentSource: updateCurrentSource,
    downloadProgress: updateDownloadProgress,
    progressBytes: updateProgressBytes,
    totalBytes: updateTotalBytes,
    errorMessage: updateErrorMessage,
    isBootCheckComplete,
    handleRetry: handleUpdateRetry,
    handleRestart: handleUpdateRestart,
    handleClose: handleUpdateClose,
    handleExit: handleUpdateExit,
  } = useAppUpdater();

  const checkNetwork = async () => {
    setNetworkState("checking");
    try {
      const { reachable } = await checkBobApiNetwork();
      setNetworkState(reachable ? "reachable" : "unreachable");
      if (reachable && authState.is_logged_in && !wallet) {
        void refreshWallet();
      }
    } catch {
      setNetworkState("unreachable");
    }
  };

  useEffect(() => {
    void checkNetwork();
    if (isTauri) {
      void win.show();
      void win.setFocus();
    }
  }, []);

  // 全局拦截外部链接点击，在系统默认浏览器中打开
  useEffect(() => {
    const handleAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;

      const anchor = (event.target as HTMLElement)?.closest("a");
      if (!anchor || !anchor.href) return;

      const href = anchor.href;
      if (!href.startsWith("http://") && !href.startsWith("https://")) return;

      const isExternal =
        anchor.target === "_blank" || anchor.origin !== window.location.origin;

      if (isExternal) {
        event.preventDefault();
        void openUrl(href);
      }
    };

    document.addEventListener("click", handleAnchorClick);
    return () => {
      document.removeEventListener("click", handleAnchorClick);
    };
  }, []);

  // 读取真实版本号
  useEffect(() => {
    if (isTauri) {
      void getVersion()
        .then((v) => setAppVersion(v))
        .catch(() => setAppVersion("1.0.32"));
    } else {
      setAppVersion("1.0.32 (Web Preview)");
    }
  }, []);

  // ── 严格按序执行启动流水线：1. 检查更新 ➔ 2. 强制登录 ➔ 3. 环境初始化 ➔ 4. 就绪 ──
  useEffect(() => {
    // 阶段 1：启动检查更新尚未结束，或正处于更新流程（下载中、安装中、就绪重启），严禁进入后续阶段
    if (!isBootCheckComplete) return;
    if (
      updatePhase === "downloading" ||
      updatePhase === "installing" ||
      updatePhase === "ready"
    ) {
      setLoginModalOpen(false);
      setInitModalOpen(false);
      setTokenModalOpen(false);
      return;
    }

    // 阶段 1 已完成，若本地身份凭据校验尚未完成（如正在读取本地 session），等待其就绪以防界面闪烁
    if (!isAuthReady) return;

    // 阶段 2：强制登录判定（必须登录才能使用客户端）
    if (!authState.is_logged_in) {
      setLoginModalOpen(true);
      setInitModalOpen(false);
      setTokenModalOpen(false);
      return;
    }

    // 已登录：关闭强制登录弹窗
    setLoginModalOpen(false);

    // 阶段 3：环境初始化向导（仅在已成功登录后，且属于首次使用未初始化时唤起）
    if (!isInitialized) {
      setInitModalOpen(true);
      return;
    }

    // 阶段 4：已更新、已登录、已初始化，主工作区就绪
  }, [
    isBootCheckComplete,
    updatePhase,
    isAuthReady,
    authState.is_logged_in,
    isInitialized,
    setLoginModalOpen,
    setTokenModalOpen,
  ]);

  // 兜底保护：确保启动检测过渡遮罩最多停留 2.5 秒，超时后无论任何网络情况均放行
  useEffect(() => {
    if (isBootCheckComplete) return;
    const safety = setTimeout(() => {
      handleUpdateClose();
    }, 2500);
    return () => clearTimeout(safety);
  }, [isBootCheckComplete, handleUpdateClose]);

  const handleLoginSuccess = (user: UserInfo) => {
    onLoginSuccess(user);
  };

  const handleInitFinish = () => {
    localStorage.setItem("ai_helper_init_completed", "true");
    sessionStorage.setItem("ai_helper_init_completed", "true");
    setIsInitialized(true);
    setInitModalOpen(false);
  };

  const handleInitClose = () => {
    // 关闭时无论是否走完全部向导，都持久化标记已处理，防止后续重启重复弹窗打扰
    localStorage.setItem("ai_helper_init_completed", "true");
    setIsInitialized(true);
    setInitModalOpen(false);
  };

  const isDark = resolvedTheme === "dark";

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  // 监听并同步窗口最大化/还原状态
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const updateMaximized = async () => {
      try {
        const isMax = await win.isMaximized();
        setIsWindowMaximized(isMax);
      } catch (err) {
        console.error("Failed to check window maximized state:", err);
      }
    };
    void updateMaximized();

    const setupListener = async () => {
      try {
        unlisten = await win.onResized(() => {
          void updateMaximized();
        });
      } catch (err) {
        console.error("Failed to listen to window resize:", err);
      }
    };
    void setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [win]);

  const handleToggleMaximize = async () => {
    try {
      await win.toggleMaximize();
      const isMax = await win.isMaximized();
      setIsWindowMaximized(isMax);
    } catch (err) {
      console.error("Failed to toggle maximize:", err);
    }
  };

  return (
    <AuroraBackground
      theme={
        tab === "claude"
          ? "claude"
          : tab === "workbuddy"
            ? "workbuddy"
            : tab === "acciowork"
              ? "acciowork"
              : "chatgpt"
      }
      className="app-frame text-slate-800 dark:text-gray-200 transition-colors duration-200 h-screen w-screen overflow-hidden flex flex-col"
    >
      {/* ── 顶部无缝桌面标题栏 (始终置顶 z-[100]，确保窗口控制随时可用) ── */}
      <div
        className="flex items-center justify-between h-11 px-3 border-b flex-shrink-0 z-[100] backdrop-blur-xl transition-colors duration-200 bg-white/90 border-slate-200/90 dark:bg-[#0c0e18]/90 dark:border-white/10 select-none cursor-default"
        data-tauri-drag-region
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (
            !target.closest("button") &&
            !target.closest("input") &&
            !target.closest("a")
          ) {
            void handleToggleMaximize();
          }
        }}
      >
        {/* 左侧：Logo + 标题与版本 + 侧边栏折叠收起开关 (macOS 预留红绿灯间距) */}
        <div
          className={cn("flex items-center gap-2", isMac() ? "pl-20" : "pl-1")}
        >
          <div className="flex items-center gap-2.5 pointer-events-none">
            <BrandLogo size={22} className="w-[22px] h-[22px] drop-shadow-sm" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 leading-none">
                <span className="text-xs font-bold tracking-wider text-slate-900 dark:text-white">
                  Uocode
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-gray-400">
                  Client
                </span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 dark:bg-white/5 dark:text-gray-400 dark:border-white/10">
                v{appVersion}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="w-7 h-7 ml-1 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 dark:hover:bg-white/10 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer pointer-events-auto"
            title={
              isSidebarCollapsed
                ? t("ui.a9051458ed5d", { v0: modifierKey() })
                : t("ui.171d84045fb6", { v0: modifierKey() })
            }
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen size={14} />
            ) : (
              <PanelLeftClose size={14} />
            )}
          </button>
        </div>

        {/* 中间留白可拖动区域 */}
        <div className="flex-1 h-full" data-tauri-drag-region />

        {/* 右侧：主题切换与窗口控制按钮 (包含明确的后台运行按钮) */}
        <div className="flex items-center gap-1.5">
          <AnnouncementBell
            route={
              tab === "keys"
                ? "/keys"
                : tab === "usage"
                  ? "/usage-logs/common"
                  : tab === "pricing"
                    ? "/pricing"
                    : tab === "security"
                      ? "/profile"
                      : "/dashboard/overview"
            }
            enabled={
              preferences.announcementPush &&
              isAuthReady &&
              authState.is_logged_in &&
              !loginModalOpen &&
              !topupOpen &&
              !initModalOpen &&
              !tokenModalOpen
            }
          />
          <ThemeToggle />

          <div className="h-3.5 w-[1px] bg-slate-200 dark:bg-white/10 mx-1" />

          {/* 明确的“后台运行”按钮 (转入系统托盘常驻守护，无需快捷键) */}
          <IconButton
            label={t("settings.title")}
            hint={t("settings.title")}
            onClick={() => switchTab("settings")}
            aria-pressed={section === "settings"}
          >
            <Settings size={16} />
          </IconButton>

          {/* Windows / Linux 专属窗口控制按钮 (macOS 采用左上角原生红绿灯) */}
          {!isMac() && (
            <>
              {/* 最小化 */}
              <button
                type="button"
                onClick={() => win.minimize()}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 dark:hover:bg-white/10 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                title={t("ui.8484c610b1f0")}
              >
                <Minus size={13} />
              </button>
              {/* 最大化/还原 */}
              <button
                type="button"
                onClick={() => void handleToggleMaximize()}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 dark:hover:bg-white/10 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
                title={
                  isWindowMaximized
                    ? t("ui.a3109a4c9a5c")
                    : t("ui.da2d806e5ff9")
                }
              >
                {isWindowMaximized ? (
                  <Minimize2 size={13} />
                ) : (
                  <Maximize2 size={13} />
                )}
              </button>
              {/* 关闭/转入后台托盘守护 */}
              <button
                type="button"
                onClick={() => {
                  void win.close().catch((err) => toast.error(String(err)));
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-red-500 hover:text-white text-slate-500 dark:hover:bg-red-500/90 dark:text-gray-400 dark:hover:text-white cursor-pointer"
                title={t("ui.51daeffe4774")}
              >
                <X size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 桌面主工作区双栏布局 (左侧边栏导航 + 右侧宽阔配置展台) ── */}
      <div
        className={cn(
          "flex-1 min-h-0 flex flex-row overflow-hidden relative z-10 transition-all duration-300",
          !authState.is_logged_in &&
            "pointer-events-none select-none filter blur-[1.5px] opacity-40",
        )}
      >
        {/* ── 左侧边栏导航 (支持紧凑收起 rail 与完整展开双模式，以及分组手风琴折叠) ── */}
        <AppSidebar
          section={section}
          collapsed={isSidebarCollapsed}
          navigate={navigateSection}
          username={
            authState.user?.display_name || authState.user?.username || ""
          }
          balance={wallet?.quota_usd}
          network={networkState}
          checkNetwork={() => void checkNetwork()}
          topup={() => setTopupOpen(true)}
          version={appVersion}
        />

        {/* ── 右侧主工作台内容区 (占满右侧全部屏幕，作为唯一全局滚动条容器) ── */}
        <main
          ref={mainRef}
          className={cn(
            "app-main flex-1 min-w-0 min-h-0 h-full overflow-y-auto p-5 lg:p-6 xl:p-8 flex flex-col",
            section === "workspace" && "workspace-main",
            isListPage && "list-main",
            section === "tools" && "tools-main",
          )}
        >
          <div
            className={cn(
              "w-full flex-1 shrink-0 flex flex-col",
              section === "workspace" || section === "tools" || isListPage
                ? "pb-0"
                : "pb-10",
            )}
          >
            <ConfigChangeNotice />
            {section === "workspace" && (
              <WorkspaceTabs
                label={t("ui.a0a470ec5a18")}
                value={tab}
                change={(id) => switchTab(id as Tab)}
                tabs={[
                  {
                    id: "chatgpt",
                    label: "Codex",
                    icon: <OpenAIIcon size={14} />,
                  },
                  {
                    id: "claude",
                    label: "Claude Code",
                    icon: <ClaudeIcon size={14} />,
                  },
                  {
                    id: "workbuddy",
                    label: "WorkBuddy",
                    icon: <WorkbuddyIcon size={14} />,
                  },
                  {
                    id: "acciowork",
                    label: "Accio Work",
                    icon: <AccioWorkIcon size={14} />,
                  },
                ]}
              />
            )}
            {section === "account" && (
              <WorkspaceTabs
                label={t("nav.account")}
                value={tab}
                change={(id) => switchTab(id as Tab)}
                tabs={[
                  { id: "account", label: t("ui.ad6f5d8d21c8") },
                  { id: "wallet", label: t("usage.billView") },
                  { id: "security", label: t("ui.8bf435e8a8b5") },
                ]}
              />
            )}
            {section === "keys" && (
              <WorkspaceTabs
                label={t("nav.keys")}
                value={tab}
                change={(id) => switchTab(id as Tab)}
                tabs={[
                  { id: "keys", label: t("nav.keys") },
                  { id: "usage", label: t("nav.usage") },
                ]}
              />
            )}
            {section === "tools" && (
              <WorkspaceTabs
                label={t("nav.tools")}
                value={tab}
                change={(id) => switchTab(id as Tab)}
                tabs={[
                  { id: "tools", label: t("ui.88ffbfb66113") },
                  { id: "paths", label: t("ui.b06067a496d5") },
                ]}
              />
            )}
            <AnimatePresence
              mode="wait"
              onExitComplete={() => mainRef.current?.scrollTo({ top: 0 })}
            >
              {tab === "account" ||
              tab === "tools" ||
              tab === "security" ||
              tab === "wallet" ||
              tab === "tickets" ||
              tab === "settings" ||
              tab === "keys" ? (
                <motion.div
                  key={tab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="w-full flex-1 flex flex-col"
                >
                  {tab === "account" ? (
                    <AccountOverview
                      topup={() => setTopupOpen(true)}
                      showBills={() => switchTab("wallet")}
                      showKeys={() => switchTab("keys")}
                      showTools={() => switchTab("tools")}
                      checkNetwork={() => void checkNetwork()}
                      networkState={networkState}
                      version={appVersion}
                    />
                  ) : tab === "keys" ? (
                    <KeysPanel
                      defaultTarget={lastAgentTab}
                      showLogs={(name) => {
                        setUsageToken(name);
                        switchTab("usage");
                      }}
                    />
                  ) : tab === "settings" ? (
                    <SettingsPanel
                      version={appVersion}
                      collapsed={isSidebarCollapsed}
                      setCollapsed={(value) => {
                        localStorage.setItem(
                          "ai_helper_sidebar_collapsed",
                          String(value),
                        );
                        setIsSidebarCollapsed(value);
                      }}
                    />
                  ) : tab === "security" ? (
                    <SecurityPanel />
                  ) : tab === "tickets" ? (
                    <TicketCenter />
                  ) : tab === "wallet" ? (
                    <WalletBillsPanel />
                  ) : (
                    <ToolsOverview
                      initialize={() => setInitModalOpen(true)}
                      diagnose={() => setToolsOpen(true)}
                      paths={() => switchTab("paths")}
                    />
                  )}
                </motion.div>
              ) : tab === "pricing" || tab === "usage" ? (
                <motion.div
                  key={tab}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="w-full flex-1 flex flex-col"
                >
                  {tab === "pricing" ? (
                    <PricingPanel />
                  ) : (
                    <UsageLogsPanel
                      quotaPerUnit={wallet?.quota_per_unit}
                      initialToken={usageToken}
                    />
                  )}
                </motion.div>
              ) : tab === "chatgpt" ? (
                <motion.div
                  key="chatgpt"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full flex-1 flex flex-col"
                >
                  <ChatGPTPanel />
                </motion.div>
              ) : tab === "claude" ? (
                <motion.div
                  key="claude"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full flex-1 flex flex-col"
                >
                  <ClaudePanel />
                </motion.div>
              ) : tab === "workbuddy" ? (
                <motion.div
                  key="workbuddy"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full flex-1 flex flex-col"
                >
                  <WorkbuddyPanel />
                </motion.div>
              ) : tab === "acciowork" ? (
                <motion.div
                  key="acciowork"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full flex-1 flex flex-col"
                >
                  <AccioWorkPanel />
                </motion.div>
              ) : (
                <motion.div
                  key="paths"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="w-full flex-1 flex flex-col"
                >
                  <AppPathsPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
        {isListPage && <ScrollToTop container={mainRef} />}
      </div>

      {/* ── 模态框与工具箱 ── */}
      <QuickToolsModal
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        showKeys={() => switchTab("keys")}
        activeTab={
          lastAgentTab === "claude"
            ? "claude"
            : lastAgentTab === "workbuddy"
              ? "workbuddy"
              : lastAgentTab === "acciowork"
                ? "acciowork"
                : "chatgpt"
        }
        currentUrl="https://www.uocode.com/"
        currentKey=""
        currentModel={
          lastAgentTab === "claude"
            ? "claude-3-7-sonnet-20250219"
            : lastAgentTab === "workbuddy"
              ? "gpt-5.6-sol"
              : lastAgentTab === "acciowork"
                ? "claude-3-7-sonnet"
                : "gpt-4o"
        }
      />

      <ForceUpdateModal
        phase={updatePhase}
        backendInfo={updateBackendInfo}
        currentSource={updateCurrentSource}
        downloadProgress={updateDownloadProgress}
        progressBytes={updateProgressBytes}
        totalBytes={updateTotalBytes}
        errorMessage={updateErrorMessage}
        onRetry={handleUpdateRetry}
        onRestart={handleUpdateRestart}
        onClose={handleUpdateClose}
        onExit={handleUpdateExit}
      />

      <InitializationModal
        open={initModalOpen}
        onClose={handleInitClose}
        onFinish={handleInitFinish}
      />

      {/* ── www.uocode.com 登录弹窗 (未登录时启用强制锁定模式) ── */}
      <LoginModal
        open={loginModalOpen}
        mandatory={!authState.is_logged_in}
        onSuccess={handleLoginSuccess}
        onClose={() => {
          if (authState.is_logged_in) {
            setLoginModalOpen(false);
          }
        }}
      />

      {/* ── API Key 资产与关联弹窗 ── */}
      <TokenSelectModal
        open={tokenModalOpen}
        onSelectKey={async (plainKey, token) => {
          const tid = lastAgentTab;
          const result = await applyApiKeyToAgents(plainKey, [tid]);
          if (!result[tid]) throw new Error(t("ui.cdaacda471a5"));
          try {
            localStorage.setItem(
              `bound_token_${tid}`,
              JSON.stringify({
                id: token.id,
                name: token.name,
                group: token.group,
              }),
            );
          } catch {}
          window.dispatchEvent(
            new CustomEvent("ai_helper_sync_all_tokens", {
              detail: {
                id: token.id,
                name: token.name,
                group: token.group,
                key: plainKey,
                targets: [tid],
              },
            }),
          );
        }}
        onClose={() => setTokenModalOpen(false)}
        toolName={
          lastAgentTab === "claude"
            ? "Claude Code"
            : lastAgentTab === "workbuddy"
              ? "WorkBuddy"
              : lastAgentTab === "acciowork"
                ? "Accio Work"
                : "ChatGPT (Codex)"
        }
        accentColor={
          lastAgentTab === "claude"
            ? "purple"
            : lastAgentTab === "workbuddy"
              ? "emerald"
              : lastAgentTab === "acciowork"
                ? "orange"
                : "blue"
        }
      />

      {/* ── 阶段 1：启动检查更新阶段过渡层 (置于标题栏下方，保留窗口控制并提供引导入口) ── */}
      {!isBootCheckComplete && updatePhase === "idle" && (
        <div className="fixed inset-0 top-11 z-50 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-md select-none p-4">
          <div className="max-w-sm w-full p-6 rounded-2xl bg-white dark:bg-[#121524] border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 flex items-center justify-center shadow-sm mb-3.5">
              <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-wide">
              {t("ui.e4de3034c336")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">
              {t("ui.eaabcbf7b24c")}
            </p>
            <div className="flex items-center gap-2 mt-5 w-full">
              <button
                type="button"
                onClick={() => {
                  handleUpdateClose();
                  setInitModalOpen(true);
                }}
                className="flex-1 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck size={14} />
                <span>{t("ui.3887b87b3595")}</span>
              </button>
              <button
                type="button"
                onClick={handleUpdateClose}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-colors cursor-pointer"
              >
                {t("ui.c1d10d49d526")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 阶段 2：启动凭据初次校验恢复微过渡 ── */}
      {isBootCheckComplete && updatePhase === "idle" && !isAuthReady && (
        <div className="fixed inset-0 top-11 z-50 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-md select-none">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-500/10 mb-3">
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
          <p className="text-xs text-slate-300 font-medium tracking-wide">
            {t("ui.af86d1dca633")}
          </p>
        </div>
      )}

      <TopupDialog
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onRefreshWallet={refreshWallet}
      />

      {/* ── 全局 Toast 通知 ── */}
      <Toaster
        position="top-center"
        offset={56}
        toastOptions={{
          style: isDark
            ? {
                background: "rgba(18, 21, 34, 0.95)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                backdropFilter: "blur(16px)",
                color: "#f1f5f9",
                fontSize: "12px",
                borderRadius: "12px",
                boxShadow: "0 10px 35px -5px rgba(0,0,0,0.5)",
              }
            : {
                background: "rgba(255, 255, 255, 0.95)",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                backdropFilter: "blur(16px)",
                color: "#0f172a",
                fontSize: "12px",
                borderRadius: "12px",
                boxShadow: "0 10px 35px -5px rgba(0,0,0,0.1)",
              },
        }}
      />
    </AuroraBackground>
  );
}
