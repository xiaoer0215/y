import { t, useLocale } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FolderGit2,
  RefreshCw,
  Search,
  FolderOpen,
  Play,
  Save,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Loader2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  DownloadCloud,
  Store,
  Globe,
} from "lucide-react";
import {
  ClaudeIcon,
  OpenAIIcon,
  WorkbuddyIcon,
  AccioWorkIcon,
} from "./BrandIcons";
import {
  browseAppPath,
  checkAppProcessStatus,
  detectAllAppPaths,
  detectAppPath,
  executeInTerminal,
  getAppPaths,
  openUrl,
  restartTargetApp,
  saveAppPaths,
  downloadInstallerFile,
  runInstallerFile,
  showFileInFolder,
  openSystemUri,
} from "../lib/api";
import { cn } from "../lib/utils";
import type {
  AppPathsConfig,
  DetectedPathInfo,
  AppDownloadEvent,
} from "../types";
import { SpotlightCard } from "./react-bits/SpotlightCard";
import { ButtonToLoaderToSuccess } from "./ui/ButtonToLoaderToSuccess";

export interface CliInstallOption {
  id: string;
  name: string;
  badge?: string;
  command: string;
  desc: string;
  recommended?: boolean;
}

export const CLAUDE_INSTALL_OPTIONS: CliInstallOption[] = [
  {
    id: "npm_latest",
    get name() {
      return t("ui.0691be444440");
    },
    get badge() {
      return t("ui.62b46f24ae40");
    },
    command: "npm i -g @anthropic-ai/claude-code",
    get desc() {
      return t("ui.7e1eb0203dd6");
    },
    recommended: true,
  },
  {
    id: "curl_native",
    get name() {
      return t("ui.21a830b06cdf");
    },
    command: "curl -fsSL https://claude.ai/install.sh | bash",
    get desc() {
      return t("ui.47310a580def");
    },
  },
];

export const CODEX_INSTALL_OPTIONS: CliInstallOption[] = [
  {
    id: "npm_latest",
    get name() {
      return t("ui.0691be444440");
    },
    get badge() {
      return t("ui.62b46f24ae40");
    },
    command: "npm i -g @openai/codex",
    get desc() {
      return t("ui.960c5b84e690");
    },
    recommended: true,
  },
  {
    id: "brew_mac",
    name: "macOS Homebrew",
    command: "brew install codex",
    get desc() {
      return t("ui.1ce9eb3b8c44");
    },
  },
];

export const NODE_CHECK_COMMANDS = [
  {
    id: "node_version",
    get name() {
      return t("ui.e1b062725ac7");
    },
    command: "node -v",
    get desc() {
      return t("ui.25e2fe30279e");
    },
  },
  {
    id: "npm_version",
    get name() {
      return t("ui.0c8bb0d9b2dd");
    },
    command: "npm -v",
    get desc() {
      return t("ui.d62b9042c885");
    },
  },
];

export function AppPathsPanel() {
  useLocale();
  const [loading, setLoading] = useState(true);
  const [detectingAll, setDetectingAll] = useState(false);

  // 路径状态
  const [claudePath, setClaudePath] = useState("");
  const [codexPath, setCodexPath] = useState("");
  const [chatgptPath, setChatgptPath] = useState("");
  const [workbuddyPath, setWorkbuddyPath] = useState("");
  const [accioPath, setAccioPath] = useState("");

  // 运行与探测状态
  const [claudeInfo, setClaudeInfo] = useState<DetectedPathInfo | null>(null);
  const [codexInfo, setCodexInfo] = useState<DetectedPathInfo | null>(null);
  const [chatgptInfo, setChatgptInfo] = useState<DetectedPathInfo | null>(null);
  const [workbuddyInfo, setWorkbuddyInfo] = useState<DetectedPathInfo | null>(
    null,
  );
  const [accioInfo, setAccioInfo] = useState<DetectedPathInfo | null>(null);

  const [claudeRunning, setClaudeRunning] = useState(false);
  const [codexRunning, setCodexRunning] = useState(false);
  const [chatgptRunning, setChatgptRunning] = useState(false);
  const [workbuddyRunning, setWorkbuddyRunning] = useState(false);
  const [accioRunning, setAccioRunning] = useState(false);

  const [detectingType, setDetectingType] = useState<string | null>(null);
  const [launchingType, setLaunchingType] = useState<string | null>(null);

  // 手动安装与命令管理状态
  const [showManualInstallGuide, setShowManualInstallGuide] = useState(false);
  const [guideActiveTab, setGuideActiveTab] = useState<
    "claude" | "codex" | "nodejs"
  >("claude");
  const [expandedCardInstall, setExpandedCardInstall] = useState<
    "claude" | "codex" | "chatgpt" | null
  >(null);
  const [claudeSelectedInstallOption, setClaudeSelectedInstallOption] =
    useState("npm_latest");
  const [codexSelectedInstallOption, setCodexSelectedInstallOption] =
    useState("npm_latest");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningCmd, setRunningCmd] = useState<string | null>(null);

  // 客户端安装包下载与安装向导状态（按应用类型独立维护，支持并发下载）
  const [downloadingApps, setDownloadingApps] = useState<
    Record<string, boolean>
  >({});
  const [downloadProgress, setDownloadProgress] = useState<
    Record<
      string,
      {
        percent: number;
        downloaded: number;
        totalBytes: number;
        fileName: string;
      }
    >
  >({});
  const [downloadedFiles, setDownloadedFiles] = useState<
    Record<string, string>
  >({});

  const refreshTimersRef = useRef<Record<string, number>>({});
  const topGuideRef = useRef<HTMLDivElement>(null);
  const claudeDrawerRef = useRef<HTMLDivElement>(null);
  const codexDrawerRef = useRef<HTMLDivElement>(null);
  const chatgptDrawerRef = useRef<HTMLDivElement>(null);

  // 展开抽屉时自动平滑滚动以确保完整命令面板可见，避免被视口截断
  useEffect(() => {
    if (expandedCardInstall === "claude") {
      requestAnimationFrame(() => {
        claudeDrawerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    } else if (expandedCardInstall === "codex") {
      requestAnimationFrame(() => {
        codexDrawerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    } else if (expandedCardInstall === "chatgpt") {
      requestAnimationFrame(() => {
        chatgptDrawerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    }
  }, [expandedCardInstall]);

  useEffect(() => {
    if (showManualInstallGuide) {
      requestAnimationFrame(() => {
        topGuideRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    }
  }, [showManualInstallGuide]);

  // 加载已保存配置与探测运行状态
  const loadInitialData = async () => {
    setLoading(true);
    try {
      const saved = await getAppPaths();
      setClaudePath(saved.claude_cli_path || "");
      setCodexPath(saved.codex_cli_path || "");
      setChatgptPath(saved.chatgpt_client_path || "");
      setWorkbuddyPath(saved.workbuddy_client_path || "");
      setAccioPath(saved.accio_client_path || "");

      // 并发检查当前运行状态
      const [cRun, xRun, gRun, wbRun, accioRun] = await Promise.all([
        checkAppProcessStatus("claude").catch(() => false),
        checkAppProcessStatus("codex").catch(() => false),
        checkAppProcessStatus("chatgpt").catch(() => false),
        checkAppProcessStatus("workbuddy").catch(() => false),
        checkAppProcessStatus("acciowork").catch(() => false),
      ]);
      setClaudeRunning(cRun);
      setCodexRunning(xRun);
      setChatgptRunning(gRun);
      setWorkbuddyRunning(wbRun);
      setAccioRunning(accioRun);
    } catch (err) {
      toast.error(t("ui.a4e66c9003ad", { v0: err }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInitialData();
    return () => {
      Object.values(refreshTimersRef.current).forEach((id) => clearTimeout(id));
      refreshTimersRef.current = {};
    };
  }, []);

  // 单项自动探测
  const handleDetectSingle = async (
    type: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
  ) => {
    setDetectingType(type);
    try {
      const info = await detectAppPath(type);
      if (type === "claude") {
        setClaudeInfo(info);
        if (info.path) setClaudePath(info.path);
        setClaudeRunning(info.is_running);
      } else if (type === "codex") {
        setCodexInfo(info);
        if (info.path) setCodexPath(info.path);
        setCodexRunning(info.is_running);
      } else if (type === "chatgpt") {
        setChatgptInfo(info);
        if (info.path) setChatgptPath(info.path);
        setChatgptRunning(info.is_running);
      } else if (type === "workbuddy") {
        setWorkbuddyInfo(info);
        if (info.path) setWorkbuddyPath(info.path);
        setWorkbuddyRunning(info.is_running);
      } else if (type === "acciowork") {
        setAccioInfo(info);
        if (info.path) setAccioPath(info.path);
        setAccioRunning(info.is_running);
      }

      if (info.exists && info.path) {
        if (downloadedFiles[type]) {
          toast.success(t("ui.6120e75fd4cb", { v0: type.toUpperCase() }));
        } else {
          toast.success(
            t("ui.679674d18d1a", {
              v0: type.toUpperCase(),
              v1: info.extra_info || t("ui.f2afde8960a6"),
            }),
          );
        }
      } else {
        toast.warning(t("ui.6cd09b2a0466", { v0: type.toUpperCase() }));
      }
    } catch (err) {
      toast.error(t("ui.1a99f16da997", { v0: err }));
    } finally {
      setDetectingType(null);
    }
  };

  // 全量一键自动探测
  const handleDetectAll = async () => {
    setDetectingAll(true);
    try {
      const results = await detectAllAppPaths();
      for (const info of results) {
        if (info.app_type === "claude") {
          setClaudeInfo(info);
          if (info.path) setClaudePath(info.path);
          setClaudeRunning(info.is_running);
        } else if (info.app_type === "codex") {
          setCodexInfo(info);
          if (info.path) setCodexPath(info.path);
          setCodexRunning(info.is_running);
        } else if (info.app_type === "chatgpt") {
          setChatgptInfo(info);
          if (info.path) setChatgptPath(info.path);
          setChatgptRunning(info.is_running);
        } else if (info.app_type === "workbuddy") {
          setWorkbuddyInfo(info);
          if (info.path) setWorkbuddyPath(info.path);
          setWorkbuddyRunning(info.is_running);
        } else if (info.app_type === "acciowork") {
          setAccioInfo(info);
          if (info.path) setAccioPath(info.path);
          setAccioRunning(info.is_running);
        }
      }
      toast.success(t("ui.f78d6add2a90"));
    } catch (err) {
      toast.error(t("ui.439c3fd314f2", { v0: err }));
    } finally {
      setDetectingAll(false);
    }
  };

  // 浏览选择文件
  const handleBrowse = async (
    type: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
  ) => {
    try {
      const selected = await browseAppPath(type);
      if (selected) {
        if (type === "claude") setClaudePath(selected);
        if (type === "codex") setCodexPath(selected);
        if (type === "chatgpt") setChatgptPath(selected);
        if (type === "workbuddy") setWorkbuddyPath(selected);
        if (type === "acciowork") setAccioPath(selected);
        toast.success(t("ui.92ae324affe2", { v0: selected }));
      }
    } catch (err) {
      toast.error(t("ui.26d056b9953c", { v0: err }));
    }
  };

  // 保存所有路径配置
  const handleSaveAll = async () => {
    const cfg: AppPathsConfig = {
      claude_cli_path: claudePath.trim() || null,
      codex_cli_path: codexPath.trim() || null,
      chatgpt_client_path: chatgptPath.trim() || null,
      workbuddy_client_path: workbuddyPath.trim() || null,
      accio_client_path: accioPath.trim() || null,
    };
    try {
      await saveAppPaths(cfg);
    } catch (err) {
      toast.error(t("ui.f5e359e15459", { v0: err }));
      throw err;
    }
  };

  // 测试启动 / 重启目标
  const handleLaunchOrRestart = async (
    type: "claude" | "codex" | "chatgpt" | "workbuddy" | "acciowork",
  ) => {
    setLaunchingType(type);
    try {
      const custom =
        type === "claude"
          ? claudePath
          : type === "codex"
            ? codexPath
            : type === "workbuddy"
              ? workbuddyPath
              : type === "acciowork"
                ? accioPath
                : chatgptPath;

      const result = await restartTargetApp(type, custom || undefined);
      toast.success(result);

      // 清理旧计时器并稍后刷新运行状态
      if (refreshTimersRef.current[type]) {
        clearTimeout(refreshTimersRef.current[type]);
      }

      refreshTimersRef.current[type] = window.setTimeout(async () => {
        const isRun = await checkAppProcessStatus(type).catch(() => false);
        if (type === "claude") setClaudeRunning(isRun);
        if (type === "codex") setCodexRunning(isRun);
        if (type === "chatgpt") setChatgptRunning(isRun);
        if (type === "workbuddy") setWorkbuddyRunning(isRun);
        if (type === "acciowork") setAccioRunning(isRun);
        delete refreshTimersRef.current[type];
      }, 1000);
    } catch (err) {
      toast.error(t("ui.0efbf659cf05", { v0: err }));
    } finally {
      setLaunchingType(null);
    }
  };

  // 复制安装命令至剪贴板
  const handleCopyCommand = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success(t("ui.97e12e5729f1", { v0: label }));
      setTimeout(() => {
        setCopiedId((curr) => (curr === id ? null : curr));
      }, 2000);
    } catch (err) {
      toast.error(t("ui.6163c0a0eac8", { v0: err }));
    }
  };

  // 在独立终端窗口中自动运行安装命令
  const handleRunInTerminal = async (command: string, label: string) => {
    setRunningCmd(command);
    try {
      toast.info(t("ui.9abb0b7cf309", { v0: label }));
      const res = await executeInTerminal(command);
      toast.success(res);
    } catch (err) {
      toast.error(t("ui.3c60d72482fb", { v0: err }));
    } finally {
      setRunningCmd(null);
    }
  };

  // 格式化文件字节大小
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // 下载客户端官方最新安装包
  const handleDownloadPackage = async (type: "workbuddy" | "acciowork") => {
    if (downloadingApps[type]) return;
    setDownloadingApps((prev) => ({ ...prev, [type]: true }));
    const label = type === "workbuddy" ? "WorkBuddy" : "Accio Work";
    toast.info(t("ui.b1ee17bcee06", { v0: label }));

    try {
      const savedPath = await downloadInstallerFile(
        type,
        (event: AppDownloadEvent) => {
          if (event.event === "Started") {
            setDownloadProgress((prev) => ({
              ...prev,
              [type]: {
                percent: 0,
                downloaded: 0,
                totalBytes: event.data.totalBytes || 0,
                fileName: event.data.fileName,
              },
            }));
          } else if (event.event === "Progress") {
            setDownloadProgress((prev) => ({
              ...prev,
              [type]: {
                percent: event.data.percent,
                downloaded: event.data.downloaded,
                totalBytes: event.data.totalBytes,
                fileName: prev[type]?.fileName || `${type}-setup.exe`,
              },
            }));
          } else if (event.event === "Finished") {
            setDownloadedFiles((prev) => ({
              ...prev,
              [type]: event.data.filePath,
            }));
            toast.success(t("ui.28afef8a78a6", { v0: label }));
          } else if (event.event === "Error") {
            // 仅记录控制台日志，界面错误通知统一由外层 catch 显示，避免双重弹窗
            console.error(
              t("ui.78fe130790e3", { v0: label }),
              event.data.message,
            );
          }
        },
      );

      setDownloadedFiles((prev) => ({
        ...prev,
        [type]: savedPath,
      }));
    } catch (err) {
      toast.error(t("ui.d1aa13d7bed3", { v0: label, v1: err }));
    } finally {
      setDownloadingApps((prev) => ({ ...prev, [type]: false }));
    }
  };

  // 运行已下载的安装程序
  const handleRunInstaller = async (filePath: string, appName: string) => {
    try {
      await runInstallerFile(filePath);
      toast.success(t("ui.26ea03423d2a", { v0: appName }));
    } catch (err) {
      toast.error(t("ui.5d589383948c", { v0: err }));
    }
  };

  // 在资源管理器中定位高亮安装包
  const handleShowInFolder = async (filePath: string) => {
    try {
      await showFileInFolder(filePath);
    } catch (err) {
      toast.error(t("ui.eb9c43d8ca79", { v0: err }));
    }
  };

  // ChatGPT 官方分发方式处理
  const handleChatgptInstall = async (method: "store" | "winget" | "web") => {
    if (method === "store") {
      try {
        toast.info(t("ui.3b92babe07ef"));
        await openSystemUri("ms-windows-store://pdp/?productid=9NT1R1C2HH7J");
      } catch (err) {
        toast.error(t("ui.c3756bcf22a6", { v0: err }));
        void openUrl("https://apps.microsoft.com/detail/9NT1R1C2HH7J");
      }
    } else if (method === "winget") {
      void handleRunInTerminal(
        "winget install --id=9NT1R1C2HH7J --source=msstore --accept-package-agreements --accept-source-agreements",
        t("ui.775eea36e29d"),
      );
    } else {
      void openUrl("https://chatgpt.com/download");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[300px] gap-3">
        <Loader2 className="animate-spin text-blue-500" size={36} />
        <span className="text-xs text-slate-500 dark:text-gray-400 animate-pulse">
          {t("ui.d571523835fc")}
        </span>
      </div>
    );
  }

  return (
    <div className="paths-panel w-full flex-1 flex flex-col gap-5">
      {/* ── 顶部面板标题栏与快速概览 ── */}
      <div className="paths-panel-header grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 pb-3.5 border-b border-slate-200/80 dark:border-white/10 flex-shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 border border-teal-200 dark:bg-teal-500/20 dark:text-teal-400 dark:border-teal-500/30 flex items-center justify-center flex-shrink-0 shadow-xs">
            <FolderGit2 size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">
                {t("paths.heading")}
              </h1>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
              {t("ui.e83e80632a70")}
            </p>
          </div>
        </div>

        <div className="paths-panel-actions flex items-center justify-end gap-2 [&>button]:h-9 [&>button]:shrink-0 [&>button]:whitespace-nowrap [&_svg]:shrink-0">
          <button
            type="button"
            onClick={() => setShowManualInstallGuide((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shadow-2xs cursor-pointer",
              showManualInstallGuide
                ? "bg-purple-600 text-white border-purple-600 dark:bg-purple-600"
                : "bg-purple-50 hover:bg-purple-100/80 border-purple-200 text-purple-700 dark:bg-purple-500/10 dark:hover:bg-purple-500/20 dark:border-purple-500/30 dark:text-purple-300",
            )}
            title={t("ui.6a59f31119bd")}
          >
            <Terminal size={13} />
            <span>{t("paths.install")}</span>
            {showManualInstallGuide ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
          <button
            type="button"
            onClick={handleDetectAll}
            disabled={detectingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-teal-50 hover:bg-teal-100/80 border-teal-200 text-teal-700 dark:bg-teal-500/10 dark:hover:bg-teal-500/20 dark:border-teal-500/30 dark:text-teal-300 shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title={t("ui.62eabfe51631")}
          >
            <Search size={13} className={detectingAll ? "animate-spin" : ""} />
            <span>
              {detectingAll ? t("ui.a0e24587c944") : t("paths.detect")}
            </span>
          </button>
          <button
            type="button"
            onClick={loadInitialData}
            disabled={loading || detectingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:text-gray-300 shadow-2xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            title={t("ui.998d785e136a")}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span>{loading ? t("ui.196670911277") : t("common.reload")}</span>
          </button>
        </div>
      </div>

      {/* ── 主配置列表 ── */}
      <div className="w-full flex-1 flex flex-col gap-4">
        {/* ── CLI 手动安装与更新命令中心 ── */}
        {showManualInstallGuide && (
          <div ref={topGuideRef} className="flex-shrink-0 min-h-fit">
            <SpotlightCard
              className="p-5 rounded-2xl border border-purple-300/80 dark:border-purple-500/30 bg-purple-50/30 dark:bg-[#15132a]/80 shadow-md animate-fade-in flex-shrink-0 min-h-fit"
              spotlightColor="rgba(168, 85, 247, 0.15)"
            >
              <div className="flex flex-col gap-4">
                {/* 标题栏 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-purple-200/60 dark:border-purple-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                      <Terminal size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {t("ui.afd45fc57a77")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
                        {t("ui.93536c188dcc")}
                      </p>
                    </div>
                  </div>

                  {/* 选项卡切换: Claude / Codex / Node.js 运行环境 */}
                  <div className="flex items-center gap-1 p-0.5 rounded-xl bg-purple-100/60 dark:bg-black/40 border border-purple-200/60 dark:border-white/10 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setGuideActiveTab("claude")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                        guideActiveTab === "claude"
                          ? "bg-purple-600 text-white shadow-xs"
                          : "text-slate-700 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/5",
                      )}
                    >
                      Claude Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuideActiveTab("codex")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                        guideActiveTab === "codex"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-700 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/5",
                      )}
                    >
                      Codex CLI
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuideActiveTab("nodejs")}
                      className={cn(
                        "px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer",
                        guideActiveTab === "nodejs"
                          ? "bg-teal-600 text-white shadow-xs"
                          : "text-slate-700 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-white/5",
                      )}
                    >
                      {t("ui.fe9549091c36")}
                    </button>
                  </div>
                </div>

                {/* 选项卡内容: Claude Code */}
                {guideActiveTab === "claude" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                      <span>
                        {t("ui.0ba5cb910d3c")}{" "}
                        <code className="font-mono text-purple-600 dark:text-purple-400 select-text">
                          @anthropic-ai/claude-code
                        </code>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDetectSingle("claude")}
                        disabled={detectingType === "claude"}
                        className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <Search
                          size={11}
                          className={
                            detectingType === "claude" ? "animate-spin" : ""
                          }
                        />
                        <span>{t("ui.9f89a112a01a")}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {CLAUDE_INSTALL_OPTIONS.map((opt) => (
                        <div
                          key={opt.id}
                          className="p-2.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/70 dark:bg-black/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {opt.name}
                              </span>
                              {opt.badge && (
                                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30">
                                  {opt.badge}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                                {opt.desc}
                              </span>
                            </div>
                            <div className="px-2 py-1 rounded-lg bg-slate-900 dark:bg-black/70 text-purple-300 font-mono text-xs overflow-x-auto select-text">
                              <code>{opt.command}</code>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0 justify-end self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  opt.command,
                                  `guide_claude_${opt.id}`,
                                  t("ui.7d0e254f97ca"),
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-700 dark:text-gray-200 flex items-center gap-1 transition-colors cursor-pointer"
                              title={t("ui.5a3a2ba5cc21")}
                            >
                              {copiedId === `guide_claude_${opt.id}` ? (
                                <>
                                  <Check
                                    size={12}
                                    className="text-emerald-500"
                                  />
                                  <span className="text-emerald-500">
                                    {t("ui.e381a5763d5f")}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>{t("ui.4edd1d00875d")}</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRunInTerminal(
                                  opt.command,
                                  t("ui.7d0e254f97ca"),
                                )
                              }
                              disabled={runningCmd === opt.command}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                              title={t("ui.91bf3b71765d")}
                            >
                              <Play
                                size={11}
                                className={
                                  runningCmd === opt.command
                                    ? "animate-spin"
                                    : ""
                                }
                              />
                              <span>{t("ui.2f8bdc585040")}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 选项卡内容: Codex CLI */}
                {guideActiveTab === "codex" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                      <span>
                        {t("ui.0ba5cb910d3c")}{" "}
                        <code className="font-mono text-blue-600 dark:text-blue-400 select-text">
                          @openai/codex
                        </code>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDetectSingle("codex")}
                        disabled={detectingType === "codex"}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-60"
                      >
                        <Search
                          size={11}
                          className={
                            detectingType === "codex" ? "animate-spin" : ""
                          }
                        />
                        <span>{t("ui.9f89a112a01a")}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {CODEX_INSTALL_OPTIONS.map((opt) => (
                        <div
                          key={opt.id}
                          className="p-2.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/70 dark:bg-black/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {opt.name}
                              </span>
                              {opt.badge && (
                                <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30">
                                  {opt.badge}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                                {opt.desc}
                              </span>
                            </div>
                            <div className="px-2 py-1 rounded-lg bg-slate-900 dark:bg-black/70 text-blue-300 font-mono text-xs overflow-x-auto select-text">
                              <code>{opt.command}</code>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0 justify-end self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  opt.command,
                                  `guide_codex_${opt.id}`,
                                  t("ui.2ae4f69bd5cc"),
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium text-slate-700 dark:text-gray-200 flex items-center gap-1 transition-colors cursor-pointer"
                              title={t("ui.5a3a2ba5cc21")}
                            >
                              {copiedId === `guide_codex_${opt.id}` ? (
                                <>
                                  <Check
                                    size={12}
                                    className="text-emerald-500"
                                  />
                                  <span className="text-emerald-500">
                                    {t("ui.e381a5763d5f")}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>{t("ui.4edd1d00875d")}</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRunInTerminal(
                                  opt.command,
                                  t("ui.2ae4f69bd5cc"),
                                )
                              }
                              disabled={runningCmd === opt.command}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                              title={t("ui.91bf3b71765d")}
                            >
                              <Play
                                size={11}
                                className={
                                  runningCmd === opt.command
                                    ? "animate-spin"
                                    : ""
                                }
                              />
                              <span>{t("ui.2f8bdc585040")}</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 选项卡内容: Node.js 运行环境 */}
                {guideActiveTab === "nodejs" && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl border border-teal-200 dark:border-teal-500/20 bg-teal-50/40 dark:bg-teal-950/20 text-xs text-slate-700 dark:text-gray-300 space-y-1.5">
                      <div className="font-semibold text-teal-800 dark:text-teal-300 flex items-center gap-1.5">
                        <span>{t("ui.cc5744be5e59")}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {t("ui.7346dc520e6b")}{" "}
                        <strong>{t("ui.11fedc99f710")}</strong>
                        {t("ui.d77fb1b4503e")}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {NODE_CHECK_COMMANDS.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-black/30 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-white">
                              {item.name}
                            </div>
                            <code className="text-xs font-mono text-teal-600 dark:text-teal-400 select-text">
                              {item.command}
                            </code>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyCommand(
                                  item.command,
                                  item.id,
                                  item.name,
                                )
                              }
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 cursor-pointer"
                              title={t("ui.b3d9723d0c1d")}
                            >
                              {copiedId === item.id ? (
                                <Check size={12} className="text-emerald-500" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleRunInTerminal(
                                  item.command,
                                  item.name,
                                )
                              }
                              className="p-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                              title={t("ui.1aad56eee7d1")}
                            >
                              <Play size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-slate-500 dark:text-gray-400">
                        {t("ui.65a5aa7df5f3")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void openUrl("https://nodejs.org/")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        <span>{t("ui.7e2f83c514ac")}</span>
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </SpotlightCard>
          </div>
        )}

        {/* 卡片 1: Claude Code CLI */}
        <SpotlightCard
          className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex-shrink-0 min-h-fit"
          spotlightColor="rgba(168, 85, 247, 0.12)"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                  <ClaudeIcon size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t("ui.fdea96783883")}
                    </span>
                    {claudeRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        {t("ui.594249700590")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono">
                    {t("ui.051ba2d68119")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {claudePath ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    <span>{t("ui.f2afde8960a6")}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>{t("ui.516527377e6a")}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 路径输入框与操作按键 */}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={claudePath}
                  onChange={(e) => setClaudePath(e.target.value)}
                  placeholder={t("ui.a9bcc2f85cc9")}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/30 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCardInstall((v) =>
                      v === "claude" ? null : "claude",
                    )
                  }
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors",
                    expandedCardInstall === "claude"
                      ? "bg-purple-600 text-white border-purple-600 shadow-2xs"
                      : "border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300",
                  )}
                  title={t("ui.608410bf88b1")}
                >
                  <DownloadCloud size={12} />
                  <span>{t("ui.5ff833d6f6b6")}</span>
                  {expandedCardInstall === "claude" ? (
                    <ChevronUp size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDetectSingle("claude")}
                  disabled={detectingType === "claude"}
                  className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.a3b775e4ba58")}
                >
                  <Search
                    size={12}
                    className={detectingType === "claude" ? "animate-spin" : ""}
                  />
                  <span>{t("ui.b5ef40a22d53")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleBrowse("claude")}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title={t("ui.a6dd9b4707ff")}
                >
                  <FolderOpen size={12} />
                  <span>{t("ui.ef23ea67b002")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLaunchOrRestart("claude")}
                  disabled={launchingType === "claude"}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.f2070f57576c")}
                >
                  <Play
                    size={12}
                    className={launchingType === "claude" ? "animate-spin" : ""}
                  />
                  <span>{t("ui.c1fa2742d8ee")}</span>
                </button>
              </div>
            </div>

            {/* Claude 卡片专属手动安装命令抽屉 */}
            {expandedCardInstall === "claude" && (
              <div
                ref={claudeDrawerRef}
                className="p-3.5 rounded-xl border border-purple-200/80 dark:border-purple-500/20 bg-purple-50/40 dark:bg-purple-950/20 space-y-3 animate-fade-in"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-900 dark:text-purple-300">
                    <Terminal
                      size={13}
                      className="text-purple-600 dark:text-purple-400"
                    />
                    <span>{t("ui.f4c7b64a5fd0")}</span>
                  </div>
                </div>

                {/* 安装方式切换胶囊 */}
                <div className="flex flex-wrap gap-1.5">
                  {CLAUDE_INSTALL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setClaudeSelectedInstallOption(opt.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1",
                        claudeSelectedInstallOption === opt.id
                          ? "bg-purple-600 text-white shadow-xs"
                          : "bg-white/80 dark:bg-white/5 border border-purple-200/60 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-purple-100/50 dark:hover:bg-white/10",
                      )}
                    >
                      <span>{opt.name}</span>
                      {opt.badge && (
                        <span
                          className={cn(
                            "text-[9px] px-1 py-0.2 rounded",
                            claudeSelectedInstallOption === opt.id
                              ? "bg-purple-700 text-white"
                              : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
                          )}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 选中的命令展示与终端执行 */}
                {(() => {
                  const selected =
                    CLAUDE_INSTALL_OPTIONS.find(
                      (o) => o.id === claudeSelectedInstallOption,
                    ) || CLAUDE_INSTALL_OPTIONS[0];
                  return (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-600 dark:text-gray-400">
                        {selected.desc}
                      </p>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl bg-slate-900 dark:bg-black/60 border border-slate-700/60 text-slate-100">
                        <div className="flex-1 font-mono text-xs overflow-x-auto py-1 px-1.5 text-purple-300 select-text">
                          <code>{selected.command}</code>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0 justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyCommand(
                                selected.command,
                                `card_claude_${selected.id}`,
                                t("ui.7d0e254f97ca"),
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title={t("ui.f3679748d6e1")}
                          >
                            {copiedId === `card_claude_${selected.id}` ? (
                              <>
                                <Check size={12} className="text-emerald-400" />
                                <span className="text-emerald-400">
                                  {t("ui.e381a5763d5f")}
                                </span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>{t("ui.4edd1d00875d")}</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleRunInTerminal(
                                selected.command,
                                t("ui.7d0e254f97ca"),
                              )
                            }
                            disabled={runningCmd === selected.command}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                            title={t("ui.b87523f46f33")}
                          >
                            <Play
                              size={11}
                              className={
                                runningCmd === selected.command
                                  ? "animate-spin"
                                  : ""
                              }
                            />
                            <span>{t("ui.2f8bdc585040")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDetectSingle("claude")}
                            disabled={detectingType === "claude"}
                            className="px-2.5 py-1 rounded-lg border border-purple-400/40 hover:bg-purple-500/20 text-purple-300 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                            title={t("ui.e13414c7cb40")}
                          >
                            <Search
                              size={11}
                              className={
                                detectingType === "claude" ? "animate-spin" : ""
                              }
                            />
                            <span>{t("ui.0f9f281cc653")}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {claudeInfo?.extra_info && (
              <div className="text-[11px] text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-100 dark:border-purple-500/20">
                💡 {claudeInfo.extra_info}
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* 卡片 2: Codex CLI */}
        <SpotlightCard
          className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex-shrink-0 min-h-fit"
          spotlightColor="rgba(59, 130, 246, 0.12)"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Terminal size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t("ui.4a212fab0f5e")}
                    </span>
                    {codexRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.2 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        {t("ui.594249700590")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono">
                    {t("ui.450c8c0fb06a")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {codexPath ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    <span>{t("ui.f2afde8960a6")}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>{t("ui.516527377e6a")}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 路径输入框与操作按键 */}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={codexPath}
                  onChange={(e) => setCodexPath(e.target.value)}
                  placeholder={t("ui.01dc5b4e820e")}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/30 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCardInstall((v) =>
                      v === "codex" ? null : "codex",
                    )
                  }
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors",
                    expandedCardInstall === "codex"
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : "border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
                  )}
                  title={t("ui.b5ced9acc845")}
                >
                  <DownloadCloud size={12} />
                  <span>{t("ui.5ff833d6f6b6")}</span>
                  {expandedCardInstall === "codex" ? (
                    <ChevronUp size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDetectSingle("codex")}
                  disabled={detectingType === "codex"}
                  className="px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.6eed57c89779")}
                >
                  <Search
                    size={12}
                    className={detectingType === "codex" ? "animate-spin" : ""}
                  />
                  <span>{t("ui.b5ef40a22d53")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleBrowse("codex")}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title={t("ui.a6dd9b4707ff")}
                >
                  <FolderOpen size={12} />
                  <span>{t("ui.ef23ea67b002")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLaunchOrRestart("codex")}
                  disabled={launchingType === "codex"}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.f2070f57576c")}
                >
                  <Play
                    size={12}
                    className={launchingType === "codex" ? "animate-spin" : ""}
                  />
                  <span>{t("ui.c1fa2742d8ee")}</span>
                </button>
              </div>
            </div>

            {/* Codex 卡片专属手动安装命令抽屉 */}
            {expandedCardInstall === "codex" && (
              <div
                ref={codexDrawerRef}
                className="p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-500/20 bg-blue-50/40 dark:bg-blue-950/20 space-y-3 animate-fade-in"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-300">
                    <Terminal
                      size={13}
                      className="text-blue-600 dark:text-blue-400"
                    />
                    <span>{t("ui.c8ea948b5b87")}</span>
                  </div>
                </div>

                {/* 安装方式切换胶囊 */}
                <div className="flex flex-wrap gap-1.5">
                  {CODEX_INSTALL_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCodexSelectedInstallOption(opt.id)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1",
                        codexSelectedInstallOption === opt.id
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white/80 dark:bg-white/5 border border-blue-200/60 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-blue-100/50 dark:hover:bg-white/10",
                      )}
                    >
                      <span>{opt.name}</span>
                      {opt.badge && (
                        <span
                          className={cn(
                            "text-[9px] px-1 py-0.2 rounded",
                            codexSelectedInstallOption === opt.id
                              ? "bg-blue-700 text-white"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
                          )}
                        >
                          {opt.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 选中的命令展示与终端执行 */}
                {(() => {
                  const selected =
                    CODEX_INSTALL_OPTIONS.find(
                      (o) => o.id === codexSelectedInstallOption,
                    ) || CODEX_INSTALL_OPTIONS[0];
                  return (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-600 dark:text-gray-400">
                        {selected.desc}
                      </p>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-xl bg-slate-900 dark:bg-black/60 border border-slate-700/60 text-slate-100">
                        <div className="flex-1 font-mono text-xs overflow-x-auto py-1 px-1.5 text-blue-300 select-text">
                          <code>{selected.command}</code>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0 justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyCommand(
                                selected.command,
                                `card_codex_${selected.id}`,
                                t("ui.2ae4f69bd5cc"),
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                            title={t("ui.f3679748d6e1")}
                          >
                            {copiedId === `card_codex_${selected.id}` ? (
                              <>
                                <Check size={12} className="text-emerald-400" />
                                <span className="text-emerald-400">
                                  {t("ui.e381a5763d5f")}
                                </span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>{t("ui.4edd1d00875d")}</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleRunInTerminal(
                                selected.command,
                                t("ui.2ae4f69bd5cc"),
                              )
                            }
                            disabled={runningCmd === selected.command}
                            className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                            title={t("ui.b87523f46f33")}
                          >
                            <Play
                              size={11}
                              className={
                                runningCmd === selected.command
                                  ? "animate-spin"
                                  : ""
                              }
                            />
                            <span>{t("ui.2f8bdc585040")}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleDetectSingle("codex")}
                            disabled={detectingType === "codex"}
                            className="px-2.5 py-1 rounded-lg border border-blue-400/40 hover:bg-blue-500/20 text-blue-300 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                            title={t("ui.e13414c7cb40")}
                          >
                            <Search
                              size={11}
                              className={
                                detectingType === "codex" ? "animate-spin" : ""
                              }
                            />
                            <span>{t("ui.0f9f281cc653")}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {codexInfo?.extra_info && (
              <div className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-100 dark:border-blue-500/20">
                💡 {codexInfo.extra_info}
              </div>
            )}

            <div className="text-[11px] text-slate-500 dark:text-gray-400 bg-slate-50/60 dark:bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-white/5 flex items-start gap-1.5">
              <span className="text-blue-500 font-bold">ℹ️</span>
              <span>
                {t("ui.663288575ea2")}{" "}
                <code className="px-1 py-0.5 rounded bg-slate-200/60 dark:bg-white/10 font-mono text-[10px] text-blue-600 dark:text-blue-400">
                  codex --no-daemon
                </code>
                {t("ui.4b642c0511a1")}
              </span>
            </div>
          </div>
        </SpotlightCard>

        {/* 卡片 3: ChatGPT 桌面客户端 */}
        <SpotlightCard
          className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex-shrink-0 min-h-fit"
          spotlightColor="rgba(16, 185, 129, 0.12)"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <OpenAIIcon size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t("ui.62c5503abfdf")}
                    </span>
                    {chatgptRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t("ui.594249700590")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono">
                    {t("ui.ca1ea3171811")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {chatgptPath ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    <span>{t("ui.f2afde8960a6")}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>{t("ui.516527377e6a")}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 路径输入框与操作按键 */}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={chatgptPath}
                  onChange={(e) => setChatgptPath(e.target.value)}
                  placeholder={t("ui.00667579b086")}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/30 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                {/* ChatGPT 官方安装方式选择 */}
                <button
                  type="button"
                  onClick={() =>
                    setExpandedCardInstall((v) =>
                      v === "chatgpt" ? null : "chatgpt",
                    )
                  }
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors",
                    expandedCardInstall === "chatgpt"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                      : "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                  )}
                  title={t("ui.5534aa882dd8")}
                >
                  <DownloadCloud size={12} />
                  <span>{t("ui.c06b2f3deda2")}</span>
                  {expandedCardInstall === "chatgpt" ? (
                    <ChevronUp size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDetectSingle("chatgpt")}
                  disabled={detectingType === "chatgpt"}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.d51f1cfca7a9")}
                >
                  <Search
                    size={12}
                    className={
                      detectingType === "chatgpt" ? "animate-spin" : ""
                    }
                  />
                  <span>{t("ui.b5ef40a22d53")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleBrowse("chatgpt")}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title={t("ui.a6dd9b4707ff")}
                >
                  <FolderOpen size={12} />
                  <span>{t("ui.ef23ea67b002")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLaunchOrRestart("chatgpt")}
                  disabled={launchingType === "chatgpt"}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.e9764fd23590")}
                >
                  <Play
                    size={12}
                    className={
                      launchingType === "chatgpt" ? "animate-spin" : ""
                    }
                  />
                  <span>
                    {chatgptRunning
                      ? t("ui.5dec716e29e4")
                      : t("ui.0077fd903088")}
                  </span>
                </button>
              </div>
            </div>

            {/* ChatGPT 卡片专属官方安装渠道抽屉 */}
            {expandedCardInstall === "chatgpt" && (
              <div
                ref={chatgptDrawerRef}
                className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3 animate-fade-in"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-300">
                    <DownloadCloud
                      size={13}
                      className="text-emerald-600 dark:text-emerald-400"
                    />
                    <span>{t("ui.f88c16f1c231")}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-gray-500 font-mono">
                    {t("ui.56b12ff3b6a0")}
                  </span>
                </div>

                {/* 3 大官方安装渠道展示网格 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* 方式 1: 微软应用商店 (推荐) */}
                  <div className="p-3 rounded-xl bg-white/90 dark:bg-[#151928] border border-emerald-200/80 dark:border-emerald-500/20 flex flex-col justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
                          <Store
                            size={13}
                            className="text-emerald-600 dark:text-emerald-400 flex-shrink-0"
                          />
                          {t("ui.339665096432")}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-semibold">
                          {t("ui.62b46f24ae40")}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed">
                        {t("ui.c581b3b79f25")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleChatgptInstall("store")}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <ExternalLink size={12} />
                      <span>{t("ui.30aecca80e98")}</span>
                    </button>
                  </div>

                  {/* 方式 2: WinGet 终端静默安装 */}
                  <div className="p-3 rounded-xl bg-white/90 dark:bg-[#151928] border border-blue-200/80 dark:border-blue-500/20 flex flex-col justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
                          <Terminal
                            size={13}
                            className="text-blue-600 dark:text-blue-400 flex-shrink-0"
                          />
                          {t("ui.c75eecfd3d27")}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 font-medium font-mono">
                          CLI
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed">
                        {t("ui.be363838f67e")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleChatgptInstall("winget")}
                        disabled={
                          runningCmd ===
                          "winget install --id=9NT1R1C2HH7J --source=msstore --accept-package-agreements --accept-source-agreements"
                        }
                        className="flex-1 py-1.5 px-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <Play
                          size={11}
                          className={
                            runningCmd ===
                            "winget install --id=9NT1R1C2HH7J --source=msstore --accept-package-agreements --accept-source-agreements"
                              ? "animate-spin"
                              : ""
                          }
                        />
                        <span>{t("ui.2f8bdc585040")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopyCommand(
                            "winget install --id=9NT1R1C2HH7J --source=msstore --accept-package-agreements --accept-source-agreements",
                            "chatgpt_winget",
                            t("ui.ec676c088c50"),
                          )
                        }
                        className="py-1.5 px-2 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-gray-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        title={t("ui.c49caf1b9196")}
                      >
                        {copiedId === "chatgpt_winget" ? (
                          <Check size={12} className="text-emerald-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 方式 3: OpenAI 官方下载站 */}
                  <div className="p-3 rounded-xl bg-white/90 dark:bg-[#151928] border border-slate-200/90 dark:border-white/10 flex flex-col justify-between gap-3 shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-xs text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
                          <Globe
                            size={13}
                            className="text-slate-600 dark:text-gray-400 flex-shrink-0"
                          />
                          {t("ui.e3fd7cbc892c")}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-300 font-medium">
                          Web
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed">
                        {t("ui.d6d4f75ab733")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleChatgptInstall("web")}
                      className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-800 dark:text-gray-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink size={12} />
                      <span>{t("ui.e6b8b4bad966")}</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-200/40 dark:border-white/5 text-[11px] text-slate-500 dark:text-gray-400">
                  <span>{t("ui.428c6330c457")}</span>
                  <button
                    type="button"
                    onClick={() => void handleDetectSingle("chatgpt")}
                    disabled={detectingType === "chatgpt"}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Search
                      size={11}
                      className={
                        detectingType === "chatgpt" ? "animate-spin" : ""
                      }
                    />
                    <span>{t("ui.f41ff47791b2")}</span>
                  </button>
                </div>
              </div>
            )}

            {chatgptInfo?.extra_info && (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                💡 {chatgptInfo.extra_info}
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* 卡片 4: WorkBuddy 客户端 */}
        <SpotlightCard
          className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex-shrink-0 min-h-fit"
          spotlightColor="rgba(16, 185, 129, 0.12)"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <WorkbuddyIcon size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t("ui.937f22fef8c4")}
                    </span>
                    {workbuddyRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {t("ui.594249700590")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono">
                    {t("ui.31dac508ef20")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {workbuddyPath ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    <span>{t("ui.f2afde8960a6")}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>{t("ui.516527377e6a")}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 路径输入框与操作按键 */}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={workbuddyPath}
                  onChange={(e) => setWorkbuddyPath(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/30 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                {/* 下载安装包 / 运行安装 */}
                {downloadedFiles["workbuddy"] ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void handleRunInstaller(
                          downloadedFiles["workbuddy"],
                          "WorkBuddy",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title={t("ui.beb441064da0")}
                    >
                      <Play size={12} />
                      <span>{t("ui.0a1cb54d614b")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleShowInFolder(downloadedFiles["workbuddy"])
                      }
                      className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs text-slate-700 dark:text-gray-300 flex items-center cursor-pointer transition-colors"
                      title={t("ui.a53eeb3e8672")}
                    >
                      <FolderOpen size={12} />
                    </button>
                  </div>
                ) : downloadingApps["workbuddy"] ? (
                  <button
                    type="button"
                    disabled
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300 text-xs font-medium flex items-center gap-1.5 cursor-wait"
                  >
                    <Loader2
                      size={12}
                      className="animate-spin text-emerald-500"
                    />
                    <span>
                      {t("message.e9f79d182781", {
                        v0: Math.round(
                          downloadProgress["workbuddy"]?.percent || 0,
                        ),
                      })}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDownloadPackage("workbuddy")}
                    disabled={Boolean(downloadingApps["workbuddy"])}
                    className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    title={t("ui.2787fb23dbd9")}
                  >
                    <DownloadCloud size={12} />
                    <span>{t("ui.961af3916f8e")}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleDetectSingle("workbuddy")}
                  disabled={detectingType === "workbuddy"}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.0ab9fe8789ba")}
                >
                  <Search
                    size={12}
                    className={
                      detectingType === "workbuddy" ? "animate-spin" : ""
                    }
                  />
                  <span>{t("ui.b5ef40a22d53")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleBrowse("workbuddy")}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title={t("ui.a6dd9b4707ff")}
                >
                  <FolderOpen size={12} />
                  <span>{t("ui.ef23ea67b002")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLaunchOrRestart("workbuddy")}
                  disabled={launchingType === "workbuddy"}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.e9764fd23590")}
                >
                  <Play
                    size={12}
                    className={
                      launchingType === "workbuddy" ? "animate-spin" : ""
                    }
                  />
                  <span>
                    {workbuddyRunning
                      ? t("ui.5dec716e29e4")
                      : t("ui.0077fd903088")}
                  </span>
                </button>
              </div>
            </div>

            {/* WorkBuddy 下载进度展示条 */}
            {downloadingApps["workbuddy"] && downloadProgress["workbuddy"] && (
              <div className="p-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-emerald-800 dark:text-emerald-300 truncate max-w-[260px]">
                    {downloadProgress["workbuddy"].fileName}
                  </span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                    {formatBytes(downloadProgress["workbuddy"].downloaded)} /{" "}
                    {formatBytes(downloadProgress["workbuddy"].totalBytes)} (
                    {Math.round(downloadProgress["workbuddy"].percent)}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-200 ease-out"
                    style={{
                      width: `${Math.max(5, downloadProgress["workbuddy"].percent)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {downloadedFiles["workbuddy"] && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-500/20 flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span>🎉</span>
                  <span>{t("ui.1b69faceacc2")}</span>
                </div>
              </div>
            )}

            {workbuddyInfo?.extra_info && (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                💡 {workbuddyInfo.extra_info}
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* 卡片 5: Accio Work 桌面客户端 */}
        <SpotlightCard
          className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex-shrink-0 min-h-fit"
          spotlightColor="rgba(255, 106, 0, 0.12)"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
                  <AccioWorkIcon size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {t("ui.2c81988a3127")}
                    </span>
                    {accioRunning && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.2 rounded-md bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        {t("ui.594249700590")}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-gray-500 font-mono">
                    {t("ui.d13a8a2fb1ee")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {accioPath ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={13} />
                    <span>{t("ui.f2afde8960a6")}</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertCircle size={13} />
                    <span>{t("ui.516527377e6a")}</span>
                  </span>
                )}
              </div>
            </div>

            {/* 路径输入框与操作按键 */}
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={accioPath}
                  onChange={(e) => setAccioPath(e.target.value)}
                  placeholder={t("ui.2695b459a994")}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/30 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                {/* 下载安装包 / 运行安装 */}
                {downloadedFiles["acciowork"] ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void handleRunInstaller(
                          downloadedFiles["acciowork"],
                          "Accio Work",
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title={t("ui.fca6a5a7cc73")}
                    >
                      <Play size={12} />
                      <span>{t("ui.0a1cb54d614b")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleShowInFolder(downloadedFiles["acciowork"])
                      }
                      className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs text-slate-700 dark:text-gray-300 flex items-center cursor-pointer transition-colors"
                      title={t("ui.a53eeb3e8672")}
                    >
                      <FolderOpen size={12} />
                    </button>
                  </div>
                ) : downloadingApps["acciowork"] ? (
                  <button
                    type="button"
                    disabled
                    className="px-2.5 py-1.5 rounded-lg border border-orange-400 text-orange-700 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-300 text-xs font-medium flex items-center gap-1.5 cursor-wait"
                  >
                    <Loader2
                      size={12}
                      className="animate-spin text-orange-500"
                    />
                    <span>
                      {t("message.e9f79d182781", {
                        v0: Math.round(
                          downloadProgress["acciowork"]?.percent || 0,
                        ),
                      })}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleDownloadPackage("acciowork")}
                    disabled={Boolean(downloadingApps["acciowork"])}
                    className="px-2.5 py-1.5 rounded-lg border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    title={t("ui.eddae072c1f1")}
                  >
                    <DownloadCloud size={12} />
                    <span>{t("ui.961af3916f8e")}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleDetectSingle("acciowork")}
                  disabled={detectingType === "acciowork"}
                  className="px-2.5 py-1.5 rounded-lg border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.3621ab7c68d4")}
                >
                  <Search
                    size={12}
                    className={
                      detectingType === "acciowork" ? "animate-spin" : ""
                    }
                  />
                  <span>{t("ui.b5ef40a22d53")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleBrowse("acciowork")}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors"
                  title={t("ui.a6dd9b4707ff")}
                >
                  <FolderOpen size={12} />
                  <span>{t("ui.ef23ea67b002")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleLaunchOrRestart("acciowork")}
                  disabled={launchingType === "acciowork"}
                  className="px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title={t("ui.2a68ef60e848")}
                >
                  <Play
                    size={12}
                    className={
                      launchingType === "acciowork" ? "animate-spin" : ""
                    }
                  />
                  <span>
                    {accioRunning ? t("ui.5dec716e29e4") : t("ui.0077fd903088")}
                  </span>
                </button>
              </div>
            </div>

            {/* Accio Work 下载进度展示条 */}
            {downloadingApps["acciowork"] && downloadProgress["acciowork"] && (
              <div className="p-2.5 rounded-xl border border-orange-200/80 dark:border-orange-500/20 bg-orange-50/50 dark:bg-orange-950/20 space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-mono text-orange-800 dark:text-orange-300 truncate max-w-[260px]">
                    {downloadProgress["acciowork"].fileName}
                  </span>
                  <span className="font-mono text-orange-700 dark:text-orange-400 font-semibold">
                    {formatBytes(downloadProgress["acciowork"].downloaded)} /{" "}
                    {formatBytes(downloadProgress["acciowork"].totalBytes)} (
                    {Math.round(downloadProgress["acciowork"].percent)}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full transition-all duration-200 ease-out"
                    style={{
                      width: `${Math.max(5, downloadProgress["acciowork"].percent)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {downloadedFiles["acciowork"] && (
              <div className="text-[11px] text-orange-700 dark:text-orange-300 bg-orange-50/80 dark:bg-orange-500/10 px-2.5 py-1.5 rounded-lg border border-orange-200/80 dark:border-orange-500/20 flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <span>🎉</span>
                  <span>{t("ui.bfc8f268bb73")}</span>
                </div>
              </div>
            )}

            {accioInfo?.extra_info && (
              <div className="text-[11px] text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-100 dark:border-orange-500/20">
                💡 {accioInfo.extra_info}
              </div>
            )}

            <div className="text-[11px] text-slate-500 dark:text-gray-400 bg-slate-50/60 dark:bg-white/[0.03] px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-white/5 flex items-start gap-1.5">
              <span className="text-orange-500 font-bold">ℹ️</span>
              <span>{t("ui.86aab1dcb822")}</span>
            </div>
          </div>
        </SpotlightCard>
      </div>

      {/* ── 底部保存栏 (苹果风毛玻璃悬浮 Dock 栏) ── */}
      <div className="sticky bottom-0 z-20 mt-auto overflow-visible py-2.5 px-4 rounded-2xl bg-white/45 dark:bg-[#0c0e18]/45 backdrop-blur-xl backdrop-saturate-150 border border-white/60 dark:border-white/10 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_4px_24px_-2px_rgba(0,0,0,0.3),inset_0_1px_1px_0_rgba(255,255,255,0.08)] flex-shrink-0 transition-all">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11px] text-slate-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span>{t("ui.4eece5b964eb")}</span>
          </div>

          <ButtonToLoaderToSuccess
            accent="teal"
            className="min-w-[210px]"
            idleLabel={
              <>
                <Save size={14} className="text-white" />
                <span>{t("ui.196c0282f1ee")}</span>
              </>
            }
            successLabel={t("ui.8cbd848eb202")}
            onAction={handleSaveAll}
          />
        </div>
      </div>
    </div>
  );
}

export default AppPathsPanel;
