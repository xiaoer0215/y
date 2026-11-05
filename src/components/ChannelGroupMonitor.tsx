import { BRAND } from "../lib/brand";
import { t, useLocale, getLocale } from "../lib/i18n";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  Layers,
  Search,
  Info,
  ShieldCheck,
  Check,
  Sparkles,
  KeyRound,
  RotateCcw,
  Maximize2,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  X,
  Eye,
  Loader2,
} from "lucide-react";
import gsap from "gsap";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { useAuth } from "../lib/useAuth";
import { useGroupDisplayName } from "../lib/site-content";
import {
  getChannelGroupOverview,
  openUrl,
  getUserTokens,
  updateUserTokenGroup,
  getTokenKey,
  applyApiKeyToAgents,
} from "../lib/api";
import type { ChannelGroupOverview, TokenItem } from "../types";
import { HealthTrendVisualizer } from "./HealthTrendVisualizer";
import { ButtonToLoaderToSuccess } from "./ui/ButtonToLoaderToSuccess";

export interface ChannelGroupMonitorProps {
  currentGroupName?: string | null;
  toolName?: string;
  toolId?: string;
  accentColor?: "blue" | "purple" | "emerald" | "orange";
  onSelectGroup?: (groupName: string) => void;
  onOpenTokenSelect?: () => void;
  className?: string;
}

export interface ToolExclusiveGuide {
  title: string;
  tag: string;
  desc: string;
  technicalNote: string;
  recommendedKeywords: string[];
}

export const TOOL_EXCLUSIVE_GUIDES: Record<string, ToolExclusiveGuide> = {
  chatgpt: {
    get title() {
      return t("ui.741c06108446");
    },
    get tag() {
      return t("ui.08c8efb811cf");
    },
    get desc() {
      return t("ui.1866364318f0");
    },
    get technicalNote() {
      return t("ui.017eebf758fa");
    },
    recommendedKeywords: ["codex", "svip-codex", "openai", "gpt"],
  },
  claude: {
    get title() {
      return t("ui.757f3e71c5ff");
    },
    get tag() {
      return t("ui.d5b36f5a696e");
    },
    get desc() {
      return t("ui.2b20bfe51a40");
    },
    get technicalNote() {
      return t("ui.572a51ab94e4");
    },
    recommendedKeywords: ["claude", "kiro", "anthropic"],
  },
  workbuddy: {
    get title() {
      return t("ui.4a47187eb0b8");
    },
    get tag() {
      return t("ui.4bbc3af2337c");
    },
    get desc() {
      return t("ui.517a2cf0ca07");
    },
    get technicalNote() {
      return t("ui.a1d5fbcf04d3");
    },
    recommendedKeywords: ["workbuddy", "all", "svip", "default"],
  },
  acciowork: {
    get title() {
      return t("ui.f02d42cfa106");
    },
    get tag() {
      return t("ui.248225cc098d");
    },
    get desc() {
      return t("ui.a0d644825863");
    },
    get technicalNote() {
      return t("ui.04be135d738c");
    },
    recommendedKeywords: ["accio", "bridge", "enterprise", "svip", "default"],
  },
};

function formatSuccessRate(group: ChannelGroupOverview): string {
  return group.total_requests > 0 ? `${group.success_rate.toFixed(1)}%` : "-";
}

function formatLatency(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "-";
  if (seconds < 1) {
    const ms = Math.round(seconds * 1000);
    return ms > 0 ? `${ms}ms` : "<1s";
  }
  return `${seconds.toFixed(2)}s`;
}

const SITE_WIDE_GROUP_NAME = "__site_wide__";

function buildSiteWideOverview(
  groups: ChannelGroupOverview[],
): ChannelGroupOverview | null {
  if (groups.length === 0) return null;

  const totalRequests = groups.reduce(
    (sum, group) => sum + Math.max(0, group.total_requests || 0),
    0,
  );
  const failedRequests = groups.reduce(
    (sum, group) => sum + Math.max(0, group.failed_requests || 0),
    0,
  );
  const totalLatency = groups.reduce(
    (sum, group) =>
      sum +
      (group.total_requests > 0
        ? group.avg_response_time * group.total_requests
        : 0),
    0,
  );
  const pointCount = Math.max(
    ...groups.map((group) => group.trend_points?.length || 0),
    0,
  );
  const trendPoints = Array.from({ length: pointCount }, (_, index) => {
    const points = groups
      .map((group) => group.trend_points?.[index])
      .filter((point): point is NonNullable<typeof point> => Boolean(point));
    const total = points.reduce(
      (sum, point) => sum + Math.max(0, point.total_requests || 0),
      0,
    );
    const failed = points.reduce(
      (sum, point) => sum + Math.max(0, point.failed_requests || 0),
      0,
    );
    const weightedLatency = points.reduce(
      (sum, point) =>
        sum +
        (point.total_requests > 0
          ? point.avg_response_time * point.total_requests
          : 0),
      0,
    );
    const firstTimestamp =
      points.find((point) => point.timestamp)?.timestamp || 0;
    return {
      timestamp: firstTimestamp,
      success_rate:
        total > 0 ? (Math.max(0, total - failed) / total) * 100 : 100,
      avg_response_time: total > 0 ? weightedLatency / total : 0,
      has_data: total > 0,
      total_requests: total,
      failed_requests: failed,
    };
  });

  return {
    group_name: SITE_WIDE_GROUP_NAME,
    success_rate:
      totalRequests > 0
        ? (Math.max(0, totalRequests - failedRequests) / totalRequests) * 100
        : 100,
    avg_response_time: totalRequests > 0 ? totalLatency / totalRequests : 0,
    has_successful_requests: totalRequests > failedRequests,
    total_requests: totalRequests,
    failed_requests: failedRequests,
    trend_points: trendPoints,
  };
}

export function ChannelGroupMonitor({
  currentGroupName,
  toolName = t("ui.3239502ee7fe"),
  toolId,
  accentColor = "blue",
  onSelectGroup,
  onOpenTokenSelect,
  className,
}: ChannelGroupMonitorProps) {
  useLocale();
  const { authState, setLoginModalOpen } = useAuth();
  const groupName = useGroupDisplayName();

  const [hours, setHours] = useState<number>(3);
  const [groups, setGroups] = useState<ChannelGroupOverview[]>([]);
  const [monitoringAvailable, setMonitoringAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const lastUpdated =
    updatedAt === null
      ? ""
      : new Date(updatedAt).toLocaleTimeString(getLocale(), {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
  const [selectedGroupOverride, setSelectedGroupOverride] = useState<
    string | null
  >(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [filterTab, setFilterTab] = useState<"all" | "recommended" | "high">(
    "all",
  );
  const [sortBy, setSortBy] = useState<"default" | "rate_desc" | "latency_asc">(
    "default",
  );
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const refreshIconRef = useRef<SVGSVGElement>(null);

  // 计算归一化的 tool 标识
  const effectiveToolId = useMemo(() => {
    if (toolId) return toolId.toLowerCase();
    const tname = toolName.toLowerCase();
    if (tname.includes("chatgpt") || tname.includes("codex")) return "chatgpt";
    if (tname.includes("claude")) return "claude";
    if (tname.includes("workbuddy")) return "workbuddy";
    if (tname.includes("accio")) return "acciowork";
    return "default";
  }, [toolId, toolName, getLocale()]);

  // 从本地存储中尝试读取当前工具绑定的 token 记录
  const [boundTokenInfo, setBoundTokenInfo] = useState<{
    id?: number;
    name?: string;
    group?: string | null;
  } | null>(() => {
    try {
      const storageKey = `bound_token_${effectiveToolId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // 监听并同步全局全套同步与分组变更事件
  useEffect(() => {
    const handleSyncEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        id: number;
        name: string;
        key?: string;
        group?: string | null;
        targets?: string[];
      }>;
      if (
        customEvent.detail?.targets &&
        !customEvent.detail.targets.includes(effectiveToolId)
      )
        return;
      if (customEvent.detail) {
        setBoundTokenInfo({
          id: customEvent.detail.id,
          name: customEvent.detail.name,
          group: customEvent.detail.group,
        });
      }
    };
    const handleGroupUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{
        toolId?: string;
        tokenId?: number;
        group: string;
      }>;
      if (customEvent.detail) {
        setBoundTokenInfo((prev) => {
          if (!prev) return prev;
          if (
            customEvent.detail.tokenId &&
            prev.id &&
            prev.id !== customEvent.detail.tokenId
          ) {
            return prev;
          }
          if (
            customEvent.detail.toolId &&
            customEvent.detail.toolId !== effectiveToolId
          ) {
            return prev;
          }
          const updated = { ...prev, group: customEvent.detail.group };
          try {
            localStorage.setItem(
              `bound_token_${effectiveToolId}`,
              JSON.stringify(updated),
            );
          } catch {}
          return updated;
        });
      }
    };
    window.addEventListener("ai_helper_sync_all_tokens", handleSyncEvent);
    window.addEventListener("ai_helper_group_updated", handleGroupUpdated);
    return () => {
      window.removeEventListener("ai_helper_sync_all_tokens", handleSyncEvent);
      window.removeEventListener("ai_helper_group_updated", handleGroupUpdated);
    };
  }, [effectiveToolId]);

  // 计算当前工具绑定的生效分组
  const resolvedCurrentGroup = useMemo(() => {
    if (currentGroupName) return currentGroupName;
    if (boundTokenInfo?.group) return boundTokenInfo.group.trim();
    return null;
  }, [currentGroupName, boundTokenInfo, getLocale()]);

  // 专属工具指南说明
  const guide = useMemo(() => {
    return TOOL_EXCLUSIVE_GUIDES[effectiveToolId] || null;
  }, [effectiveToolId, getLocale()]);

  // 主题配色系统
  const theme = useMemo(() => {
    switch (accentColor) {
      case "purple":
        return {
          bannerBg:
            "bg-purple-50/80 dark:bg-purple-950/25 border-purple-200/70 dark:border-purple-900/30 text-purple-900 dark:text-purple-200",
          bannerIcon: "text-purple-600 dark:text-purple-400",
          bannerTitle: "text-purple-950 dark:text-purple-100",
          bannerTag:
            "bg-purple-100/90 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-500/30",
          topIconBg:
            "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
          btnPrimary:
            "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-500/20",
          boundBadge:
            "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300 border-purple-200/60 dark:border-purple-500/30",
          accentText: "text-purple-600 dark:text-purple-400",
          accentIconColor: "text-purple-500",
          focusRing: "focus:ring-purple-500",
          drawerActive:
            "border-purple-500/80 bg-purple-50/80 dark:bg-purple-500/15 shadow-2xs font-semibold",
          drawerCheck: "text-purple-500",
        };
      case "emerald":
        return {
          bannerBg:
            "bg-emerald-50/80 dark:bg-emerald-950/25 border-emerald-200/70 dark:border-emerald-900/30 text-emerald-900 dark:text-emerald-200",
          bannerIcon: "text-emerald-600 dark:text-emerald-400",
          bannerTitle: "text-emerald-950 dark:text-emerald-100",
          bannerTag:
            "bg-emerald-100/90 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
          topIconBg:
            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          btnPrimary:
            "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20",
          boundBadge:
            "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-500/30",
          accentText: "text-emerald-600 dark:text-emerald-400",
          accentIconColor: "text-emerald-500",
          focusRing: "focus:ring-emerald-500",
          drawerActive:
            "border-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-500/15 shadow-2xs font-semibold",
          drawerCheck: "text-emerald-500",
        };
      case "orange":
        return {
          bannerBg:
            "bg-orange-50/80 dark:bg-orange-950/25 border-orange-200/70 dark:border-orange-900/30 text-orange-900 dark:text-orange-200",
          bannerIcon: "text-orange-600 dark:text-orange-400",
          bannerTitle: "text-orange-950 dark:text-orange-100",
          bannerTag:
            "bg-orange-100/90 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
          topIconBg:
            "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
          btnPrimary:
            "bg-orange-600 hover:bg-orange-700 text-white shadow-orange-500/20",
          boundBadge:
            "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300 border-orange-200/60 dark:border-orange-500/30",
          accentText: "text-orange-600 dark:text-orange-400",
          accentIconColor: "text-orange-500",
          focusRing: "focus:ring-orange-500",
          drawerActive:
            "border-orange-500/80 bg-orange-50/80 dark:bg-orange-500/15 shadow-2xs font-semibold",
          drawerCheck: "text-orange-500",
        };
      case "blue":
      default:
        return {
          bannerBg:
            "bg-blue-50/80 dark:bg-blue-950/25 border-blue-200/70 dark:border-blue-900/30 text-blue-900 dark:text-blue-200",
          bannerIcon: "text-blue-600 dark:text-blue-400",
          bannerTitle: "text-blue-950 dark:text-blue-100",
          bannerTag:
            "bg-blue-100/90 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
          topIconBg:
            "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
          btnPrimary:
            "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20",
          boundBadge:
            "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 border-blue-200/60 dark:border-blue-500/30",
          accentText: "text-blue-600 dark:text-blue-400",
          accentIconColor: "text-blue-500",
          focusRing: "focus:ring-blue-500",
          drawerActive:
            "border-blue-500/80 bg-blue-50/80 dark:bg-blue-500/15 shadow-2xs font-semibold",
          drawerCheck: "text-blue-500",
        };
    }
  }, [accentColor, getLocale()]);

  // 加载监控数据
  const loadData = useCallback(
    async (silent = false) => {
      if (!authState.is_logged_in) {
        return;
      }
      if (!silent) setLoading(true);
      setErrorMsg(null);
      try {
        const data = await getChannelGroupOverview(hours);
        setGroups(data.groups);
        setMonitoringAvailable(data.monitoring_available);
        setUpdatedAt(Date.now());
      } catch (err: unknown) {
        const msg = typeof err === "string" ? err : t("ui.c7d155020edb");
        setErrorMsg(msg);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [authState.is_logged_in, hours],
  );

  useEffect(() => {
    if (!authState.is_logged_in) return;
    void loadData();
    const interval = setInterval(() => {
      void loadData(true);
    }, 90000);
    return () => clearInterval(interval);
  }, [loadData, authState.is_logged_in]);

  // 点击刷新按钮触发旋转
  const handleRefresh = () => {
    if (refreshIconRef.current) {
      gsap.to(refreshIconRef.current, {
        rotation: "+=360",
        duration: 0.6,
        ease: "power2.inOut",
      });
    }
    void loadData();
  };

  // ── 改分组弹窗状态与核心操作逻辑 ──
  const [switchModalState, setSwitchModalState] = useState<{
    open: boolean;
    targetGroupName: string;
    targetGroupItem?: ChannelGroupOverview | null;
    selectedTokenId?: number;
    tokensList: TokenItem[];
    loadingTokens: boolean;
    syncToAllAgents: boolean;
    isSubmitting: boolean;
    errorMessage?: string | null;
  }>({
    open: false,
    targetGroupName: "",
    targetGroupItem: null,
    selectedTokenId: undefined,
    tokensList: [],
    loadingTokens: false,
    syncToAllAgents: false,
    isSubmitting: false,
    errorMessage: null,
  });

  const handleInitiateSwitchGroup = async (groupName: string) => {
    if (!authState.is_logged_in) {
      toast.info(t("ui.7262efad5178"));
      setLoginModalOpen(true);
      return;
    }

    const targetItem = groups.find((g) => g.group_name === groupName) || null;

    setSwitchModalState((prev) => ({
      ...prev,
      open: true,
      targetGroupName: groupName,
      targetGroupItem: targetItem,
      loadingTokens: true,
      errorMessage: null,
      isSubmitting: false,
    }));

    try {
      const userTokens = await getUserTokens();
      let defaultId = boundTokenInfo?.id;
      if (!defaultId || !userTokens.some((t) => t.id === defaultId)) {
        if (
          authState.selected_token_id &&
          userTokens.some((t) => t.id === authState.selected_token_id)
        ) {
          defaultId = authState.selected_token_id;
        } else if (userTokens.length > 0) {
          defaultId = userTokens[0].id;
        }
      }

      setSwitchModalState((prev) => ({
        ...prev,
        tokensList: userTokens,
        selectedTokenId: defaultId,
        loadingTokens: false,
      }));
    } catch (err: unknown) {
      setSwitchModalState((prev) => ({
        ...prev,
        loadingTokens: false,
        errorMessage: typeof err === "string" ? err : t("ui.1566151a9581"),
      }));
    }
  };

  const handleConfirmSwitchGroup = async () => {
    const { targetGroupName, selectedTokenId, tokensList, syncToAllAgents } =
      switchModalState;
    if (!selectedTokenId) {
      toast.error(t("ui.14eb1fe3fe6d"));
      throw new Error(t("ui.14eb1fe3fe6d"));
    }

    const tokenToUpdate = tokensList.find((t) => t.id === selectedTokenId);
    const tokenName = tokenToUpdate?.name || t("ui.7585957d978e");

    setSwitchModalState((prev) => ({ ...prev, errorMessage: null }));

    try {
      const updated = await updateUserTokenGroup(
        selectedTokenId,
        targetGroupName,
      );

      // 更新当前工具的绑定状态
      const newBound = {
        id: updated.id,
        name: updated.name,
        group: targetGroupName,
      };
      localStorage.setItem(
        `bound_token_${effectiveToolId}`,
        JSON.stringify(newBound),
      );
      setBoundTokenInfo(newBound);
      setSelectedGroupOverride(null);
      if (onSelectGroup) onSelectGroup(targetGroupName);

      // 如果勾选了同步到所有工具
      if (syncToAllAgents) {
        let plainKey = "";
        try {
          plainKey = await getTokenKey(selectedTokenId);
          await applyApiKeyToAgents(plainKey);
        } catch {}

        ["chatgpt", "claude", "workbuddy", "acciowork", "default"].forEach(
          (tid) => {
            try {
              localStorage.setItem(
                `bound_token_${tid}`,
                JSON.stringify(newBound),
              );
            } catch {}
          },
        );
        window.dispatchEvent(
          new CustomEvent("ai_helper_sync_all_tokens", {
            detail: {
              id: updated.id,
              name: updated.name,
              key: plainKey || updated.key,
              group: targetGroupName,
            },
          }),
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("ai_helper_group_updated", {
            detail: {
              toolId: effectiveToolId,
              tokenId: updated.id,
              group: targetGroupName,
            },
          }),
        );
      }

      toast.success(
        t("ui.2257e351ad8c", { v0: tokenName, v1: targetGroupName }),
      );
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : t("ui.eb906d85fcb9");
      setSwitchModalState((prev) => ({ ...prev, errorMessage: msg }));
      throw err;
    }
  };

  // 根据工具关键词优先计算推荐的默认分组
  const recommendedDefaultGroup = useMemo(() => {
    if (groups.length === 0) return null;
    if (guide?.recommendedKeywords) {
      for (const kw of guide.recommendedKeywords) {
        const found = groups.find((g) =>
          g.group_name.toLowerCase().includes(kw),
        );
        if (found) return found.group_name;
      }
    }
    return groups[0]?.group_name || null;
  }, [groups, guide, getLocale()]);

  // 计算当前聚焦的目标分组名称
  const effectiveGroupName = useMemo(() => {
    if (selectedGroupOverride) return selectedGroupOverride;
    if (resolvedCurrentGroup) return resolvedCurrentGroup;
    return recommendedDefaultGroup;
  }, [
    selectedGroupOverride,
    resolvedCurrentGroup,
    recommendedDefaultGroup,
    getLocale(),
  ]);

  const activeGroup = useMemo(() => {
    const siteWideGroup = buildSiteWideOverview(groups);
    if (!selectedGroupOverride && siteWideGroup) return siteWideGroup;
    if (!effectiveGroupName) return null;
    return (
      groups.find(
        (g) => g.group_name.toLowerCase() === effectiveGroupName.toLowerCase(),
      ) ||
      groups.find((g) =>
        g.group_name.toLowerCase().includes(effectiveGroupName.toLowerCase()),
      ) ||
      groups[0] ||
      null
    );
  }, [effectiveGroupName, groups, selectedGroupOverride, getLocale()]);

  const isSiteWideGroup = activeGroup?.group_name === SITE_WIDE_GROUP_NAME;

  // 状态识别判断
  const isInspectingOverride = Boolean(
    selectedGroupOverride &&
      selectedGroupOverride.toLowerCase() !==
        (resolvedCurrentGroup || "").toLowerCase(),
  );

  const isCurrentKeyGroup = Boolean(
    !isInspectingOverride &&
      resolvedCurrentGroup &&
      activeGroup &&
      activeGroup.group_name.toLowerCase() ===
        resolvedCurrentGroup.toLowerCase(),
  );

  const isUnboundRecommended = Boolean(
    !resolvedCurrentGroup && !selectedGroupOverride,
  );

  // 健康度状态判定
  const getHealthStatus = (rate: number, totalRequests: number) => {
    if (totalRequests <= 0) {
      return {
        label: t("ui.b246458f20c8"),
        colorText: "text-slate-500 dark:text-gray-400",
        bgBadge:
          "bg-slate-500/10 text-slate-600 dark:text-gray-300 border-slate-500/20",
        dotColor: "bg-slate-400",
        barColor: "#94a3b8",
        Icon: Info,
      };
    }
    if (rate >= 90) {
      return {
        label: t("ui.ee754383c624"),
        colorText: "text-emerald-600 dark:text-emerald-400",
        bgBadge:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
        dotColor: "bg-emerald-500",
        barColor: "#10b981",
        Icon: CheckCircle2,
      };
    }
    if (rate > 60) {
      return {
        label: t("ui.a8350e78ca32"),
        colorText: "text-amber-600 dark:text-amber-400",
        bgBadge:
          "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
        dotColor: "bg-amber-500",
        barColor: "#f59e0b",
        Icon: AlertTriangle,
      };
    }
    return {
      label: t("ui.5078424f7e0e"),
      colorText: "text-rose-600 dark:text-rose-400",
      bgBadge:
        "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
      dotColor: "bg-rose-500",
      barColor: "#ef4444",
      Icon: AlertCircle,
    };
  };

  const currentHealth = activeGroup
    ? getHealthStatus(activeGroup.success_rate, activeGroup.total_requests)
    : null;

  // 检查某个分组是否属于此工具推荐
  const isGroupRecommended = useCallback(
    (groupName: string) => {
      if (!guide?.recommendedKeywords) return false;
      const lower = groupName.toLowerCase();
      return guide.recommendedKeywords.some((kw) => lower.includes(kw));
    },
    [guide],
  );

  // 统计信息
  const recommendedCount = useMemo(() => {
    return groups.filter((g) => isGroupRecommended(g.group_name)).length;
  }, [groups, isGroupRecommended, getLocale()]);

  const highHealthCount = useMemo(() => {
    return groups.filter((g) => g.total_requests > 0 && g.success_rate >= 90)
      .length;
  }, [groups, getLocale()]);

  // 过滤与排序后的全部分组列表
  const filteredAndSortedGroups = useMemo(() => {
    let result = [...groups];

    // 1. 过滤搜索词
    if (groupSearch.trim()) {
      const q = groupSearch.toLowerCase().trim();
      result = result.filter((g) => g.group_name.toLowerCase().includes(q));
    }

    // 2. 选项卡过滤
    if (filterTab === "recommended") {
      result = result.filter((g) => isGroupRecommended(g.group_name));
    } else if (filterTab === "high") {
      result = result.filter(
        (g) => g.total_requests > 0 && g.success_rate >= 90,
      );
    }

    // 3. 排序
    if (sortBy === "rate_desc") {
      result.sort((a, b) => b.success_rate - a.success_rate);
    } else if (sortBy === "latency_asc") {
      result.sort(
        (a, b) => (a.avg_response_time || 999) - (b.avg_response_time || 999),
      );
    }

    return result;
  }, [groups, groupSearch, filterTab, sortBy, isGroupRecommended, getLocale()]);

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300 overflow-hidden",
        "bg-white/70 dark:bg-[#101322]/70 backdrop-blur-md",
        "border-slate-200/90 dark:border-white/10 shadow-xs",
        className,
      )}
    >
      {/* ── 顶部栏：功能标题、时间范围切换、刷新与外链 ── */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap bg-slate-50/50 dark:bg-white/[0.02]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border shadow-2xs",
              theme.topIconBg,
            )}
          >
            <Activity size={14} className="animate-pulse" />
          </div>

          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-800 dark:text-gray-100 tracking-tight">
              {monitoringAvailable
                ? t("ui.d787fd08cef5")
                : t("ui.8f7fa475f2e7")}
            </span>
            {toolName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 border border-slate-200/60 dark:border-white/5 truncate max-w-[140px]">
                {toolName}
              </span>
            )}
            <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-md font-mono bg-slate-200/60 dark:bg-white/5 text-slate-500 dark:text-gray-400 border border-slate-200/40 dark:border-white/5">
              {monitoringAvailable ? "Channel Monitor" : "Groups"}
            </span>
          </div>
        </div>

        {/* 右侧控制项 */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {/* 与站点状态大盘支持的统计窗口一致 */}
          {monitoringAvailable && (
            <div className="flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 text-[10px]">
              {[3, 12, 24].map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={cn(
                    "px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                    hours === h
                      ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200",
                  )}
                  title={t("ui.bb260568047d", { v0: h })}
                >
                  {h}h
                </button>
              ))}
            </div>
          )}

          {/* 刷新按钮 */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || !authState.is_logged_in}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-200/60 dark:hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
            title={
              lastUpdated
                ? t("ui.60b7c1f86b04", { v0: lastUpdated })
                : t("ui.8525a51ce941")
            }
          >
            <RefreshCw
              ref={refreshIconRef}
              size={13}
              className={loading ? cn("animate-spin", theme.accentText) : ""}
            />
          </button>

          {/* 官方监控网页外链 */}
          <button
            type="button"
            onClick={() => void openUrl(`${BRAND.siteUrl}/status-board`)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white bg-slate-100/80 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/60 dark:border-white/10 transition-all cursor-pointer shadow-2xs"
            title={t("ui.521838087afe")}
          >
            <span>{t("ui.6dc942c35ac8")}</span>
            <ExternalLink size={11} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* ── 核心说明横幅：针对各工具深度定制的专属分组与密钥规则 ── */}
      {monitoringAvailable && (
        <div
          className={cn(
            "px-4 py-3 border-b flex items-start gap-2.5 text-xs leading-relaxed transition-colors",
            theme.bannerBg,
          )}
        >
          <Info
            size={15}
            className={cn("flex-shrink-0 mt-0.5", theme.bannerIcon)}
          />
          <div className="flex-1 space-y-1 text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("font-bold text-xs", theme.bannerTitle)}>
                {guide ? guide.title : t("ui.b86b38433d8a")}
              </span>
              {guide && (
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.2 rounded-md font-semibold border shadow-2xs",
                    theme.bannerTag,
                  )}
                >
                  {guide.tag}
                </span>
              )}
            </div>

            <p className="leading-relaxed">
              {guide ? guide.desc : t("ui.7d86d7f2d41a", { v0: toolName })}
            </p>

            <p className="text-xs leading-relaxed flex items-start gap-1 pt-0.5">
              <Sparkles size={11} className="flex-shrink-0 opacity-70" />
              <span>{guide ? guide.technicalNote : t("ui.f87081e7c327")}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── 监控核心展示区 ── */}
      <div className="p-4 space-y-3.5">
        {!authState.is_logged_in ? (
          /* 未登录状态下的引导卡片 */
          <div className="py-6 px-4 rounded-xl border border-dashed border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.015] flex flex-col items-center justify-center text-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shadow-xs",
                theme.topIconBg,
              )}
            >
              <ShieldCheck size={20} />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-xs font-semibold text-slate-800 dark:text-gray-200">
                {t("ui.a0f824b2f0da")}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed">
                {t("ui.3f48bd97feb3")}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setLoginModalOpen(true)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs active:scale-95 transition-all cursor-pointer",
                  theme.btnPrimary,
                )}
              >
                {t("ui.85bb536a8f9c")}
              </button>
              <button
                type="button"
                onClick={() =>
                  void openUrl(`${BRAND.siteUrl}/status-board`)
                }
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-medium transition-all cursor-pointer flex items-center gap-1"
              >
                <span>{t("ui.68d272eda1a7")}</span>
                <ExternalLink size={11} />
              </button>
            </div>
          </div>
        ) : loading && groups.length === 0 ? (
          /* 加载中状态 */
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-gray-500">
            <Activity
              size={22}
              className={cn("animate-spin", theme.accentText)}
            />
            <span className="text-xs">{t("ui.8b20001c9d75")}</span>
          </div>
        ) : errorMsg ? (
          /* 出错状态 */
          <div className="py-5 px-4 rounded-xl bg-rose-50/70 dark:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/20 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadData()}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 active:scale-95 transition-all cursor-pointer"
            >
              {t("ui.e2d53a6d3a6a")}
            </button>
          </div>
        ) : !monitoringAvailable ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-white/5 p-3 text-xs text-slate-600 dark:text-gray-300">
              <Info size={15} className="mt-0.5 flex-shrink-0" />
              <span>{t("ui.532716a9fd28")}</span>
            </div>
            <input
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
              placeholder={t("ui.651adfdae4ca")}
              aria-label={t("ui.651adfdae4ca")}
              className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-transparent px-3 py-2 text-xs text-slate-800 dark:text-gray-200"
            />
            {groups.length === 0 && (
              <p className="text-xs text-slate-500">{t("ui.cdd99a3b7e7d")}</p>
            )}
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {groups
                .filter((group) =>
                  group.group_name
                    .toLowerCase()
                    .includes(groupSearch.toLowerCase()),
                )
                .map((group) => {
                  const isCurrent =
                    group.group_name.toLowerCase() ===
                    resolvedCurrentGroup?.toLowerCase();
                  return (
                    <div
                      key={group.group_name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2"
                    >
                      <span className="truncate text-xs font-medium text-slate-800 dark:text-gray-200">
                        {groupName(group.group_name)}
                      </span>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() =>
                          void handleInitiateSwitchGroup(group.group_name)
                        }
                        className={cn(
                          "flex-shrink-0 rounded-lg px-3 py-1 text-xs disabled:opacity-50",
                          theme.btnPrimary,
                        )}
                      >
                        {isCurrent
                          ? t("ui.2401b106e4ec")
                          : t("ui.091c57c767b2")}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : activeGroup ? (
          /* 活跃分组指标展示 */
          <div className="space-y-3">
            {/* 分组基本信息头部 */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-xs text-slate-500 dark:text-gray-400">
                  {isSiteWideGroup
                    ? t("monitor.siteWide")
                    : isInspectingOverride
                      ? t("ui.844008bf9f20")
                      : isCurrentKeyGroup
                        ? t("ui.a2d9286ed852")
                        : t("ui.da5f0de40a04")}
                </span>

                <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white border border-slate-200/60 dark:border-white/5 truncate max-w-[200px]">
                  {isSiteWideGroup
                    ? t("monitor.siteWide")
                    : groupName(activeGroup.group_name)}
                </span>

                {isSiteWideGroup && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold border flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20">
                    <Layers size={11} />
                    <span>{t("monitor.allChannelGroups")}</span>
                  </span>
                )}

                {/* 状态指示徽标 */}
                {isCurrentKeyGroup && (
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded font-semibold border flex items-center gap-1",
                      theme.boundBadge,
                    )}
                  >
                    <Check size={11} className="stroke-[3]" />
                    {t("ui.102206a69655")}
                  </span>
                )}

                {isInspectingOverride && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      {t("ui.c08e746bf169")}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void handleInitiateSwitchGroup(activeGroup.group_name)
                      }
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-2xs cursor-pointer transition-colors active:scale-95"
                      title={t("ui.0af1e1c05ea8")}
                    >
                      <Zap size={10} className="fill-current" />
                      <span>{t("ui.441b3343fda8")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupOverride(null);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white underline cursor-pointer"
                    >
                      <RotateCcw size={10} />
                      <span>{t("ui.021ce2a9364c")}</span>
                    </button>
                  </div>
                )}

                {isUnboundRecommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-400 border border-slate-200 dark:border-white/10">
                    {t("ui.634ee14616a1")}
                  </span>
                )}
              </div>

              {/* 健康度徽标 */}
              {currentHealth && (
                <div
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border shadow-2xs",
                    currentHealth.bgBadge,
                  )}
                >
                  <currentHealth.Icon size={12} className="stroke-[2.5]" />
                  <span>
                    {t("message.e949726085d4", { v0: currentHealth.label })}
                  </span>
                  <span className="font-mono ml-0.5 font-bold">
                    ({formatSuccessRate(activeGroup)})
                  </span>
                </div>
              )}
            </div>

            {/* 核心指标卡片四宫格 */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 成功率 */}
              <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/[0.025] border border-slate-200/60 dark:border-white/5 flex flex-col justify-between">
                <span className="text-[10px] text-slate-400 dark:text-gray-400 font-medium">
                  {t("ui.ee75015b2cca")}
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span
                    className={cn(
                      "text-base font-bold font-mono tracking-tight",
                      currentHealth
                        ? currentHealth.colorText
                        : "text-slate-800 dark:text-white",
                    )}
                  >
                    {formatSuccessRate(activeGroup)}
                  </span>
                </div>
              </div>

              {/* 平均时延 */}
              <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/[0.025] border border-slate-200/60 dark:border-white/5 flex flex-col justify-between">
                <span className="text-[10px] text-slate-400 dark:text-gray-400 font-medium flex items-center gap-1">
                  <Zap size={10} className="text-amber-500" />
                  {t("ui.81dae4a7466f")}
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-base font-bold font-mono tracking-tight text-slate-800 dark:text-gray-100">
                    {formatLatency(activeGroup.avg_response_time)}
                  </span>
                </div>
              </div>
            </div>

            {/* 现代化高颜值趋势走势可视化大盘 (带微光脉冲胶囊与平滑面积曲线双模式) */}
            {activeGroup.trend_points &&
              activeGroup.trend_points.length > 0 && (
                <HealthTrendVisualizer
                  trendPoints={activeGroup.trend_points}
                  groupName={groupName(activeGroup.group_name)}
                  successRate={activeGroup.success_rate}
                  avgLatency={activeGroup.avg_response_time}
                  totalRequests={activeGroup.total_requests}
                  failedRequests={activeGroup.failed_requests}
                  hours={hours}
                  accentColor={accentColor}
                />
              )}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-slate-400">
            {t("ui.a1c5d812cedf")}
          </div>
        )}

        {/* ── 底部抽屉切换：查看与对比全部分组 ── */}
        {monitoringAvailable && groups.length > 1 && (
          <div className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowAllGroups((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors cursor-pointer py-1"
              >
                <Layers size={13} className={theme.accentIconColor} />
                <span>
                  {showAllGroups
                    ? t("ui.75a18b5b3d02")
                    : t("ui.62f125fca386", { v0: groups.length })}
                </span>
                {showAllGroups ? (
                  <ChevronUp size={13} />
                ) : (
                  <ChevronDown size={13} />
                )}
              </button>

              <div className="flex items-center gap-2">
                {/* 弹窗全景大盘对比按钮 */}
                <button
                  type="button"
                  onClick={() => setCompareModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 hover:bg-slate-200/80 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-gray-300 border border-slate-200/60 dark:border-white/10 transition-colors cursor-pointer"
                  title={t("ui.8f6f1fdb96ef")}
                >
                  <Maximize2 size={10} />
                  <span>{t("ui.1e2f8ab02ca6")}</span>
                </button>

                {onOpenTokenSelect && (
                  <button
                    type="button"
                    onClick={onOpenTokenSelect}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold transition-colors cursor-pointer",
                      theme.accentText,
                    )}
                  >
                    <KeyRound size={11} />
                    <span>{t("ui.b92035525712")}</span>
                  </button>
                )}

                {lastUpdated && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {t("message.21b85d062cff", { v0: lastUpdated })}
                  </span>
                )}
              </div>
            </div>

            {/* 折叠展开的全部分组精细列表（优化布局：支持紧凑单行流式排版、快捷分类与弹窗大盘） */}
            {showAllGroups && (
              <div className="mt-2 space-y-2.5 pt-2.5 border-t border-slate-100/80 dark:border-white/5">
                {/* 搜索与过滤控制条 */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {/* 搜索框 */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search
                      size={12}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      placeholder={t("ui.0a6a483be317")}
                      className={cn(
                        "w-full h-7 pl-7 pr-7 text-xs rounded-lg bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none focus:ring-1",
                        theme.focusRing,
                      )}
                    />
                    {groupSearch && (
                      <button
                        type="button"
                        onClick={() => setGroupSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* 过滤分类标签 */}
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setFilterTab("all")}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                        filterTab === "all"
                          ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:text-gray-400",
                      )}
                    >
                      {t("message.decb0617614c", { v0: groups.length })}
                    </button>
                    {recommendedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterTab("recommended")}
                        className={cn(
                          "px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                          filterTab === "recommended"
                            ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs font-semibold"
                            : "text-slate-500 hover:text-slate-800 dark:text-gray-400",
                        )}
                      >
                        {t("message.cd1450721299", { v0: recommendedCount })}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setFilterTab("high")}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer",
                        filterTab === "high"
                          ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:text-gray-400",
                      )}
                    >
                      {t("message.71e7cea40201", { v0: highHealthCount })}
                    </button>
                  </div>

                  {/* 视图切换 (紧凑单行列表 vs 双列卡片网格) */}
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "p-1 rounded-md transition-all cursor-pointer",
                        viewMode === "list"
                          ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs"
                          : "text-slate-400 hover:text-slate-700 dark:hover:text-gray-200",
                      )}
                      title={t("ui.a32e7c5ccb2c")}
                    >
                      <LayoutList size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "p-1 rounded-md transition-all cursor-pointer",
                        viewMode === "grid"
                          ? "bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-2xs"
                          : "text-slate-400 hover:text-slate-700 dark:hover:text-gray-200",
                      )}
                      title={t("ui.15c9c190f82f")}
                    >
                      <LayoutGrid size={12} />
                    </button>
                  </div>
                </div>

                {/* 分组列表呈现区：采用紧凑舒适的布局，绝不发生文字截断或元素切半 */}
                {filteredAndSortedGroups.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {t("ui.134090e62c0d")}
                  </div>
                ) : viewMode === "list" ? (
                  /* ── 模式 1：紧凑单行流式列表 (点击预览可直接向下就地展开详情大盘) ── */
                  <div className="space-y-1.5 pb-1">
                    {filteredAndSortedGroups.map((g) => {
                      const isCur = g.group_name === activeGroup?.group_name;
                      const isBound =
                        resolvedCurrentGroup &&
                        g.group_name.toLowerCase() ===
                          resolvedCurrentGroup.toLowerCase();
                      const isRec = isGroupRecommended(g.group_name);
                      const st = getHealthStatus(
                        g.success_rate,
                        g.total_requests,
                      );
                      const isExpanded = expandedGroup === g.group_name;

                      const handleToggleExpand = (e?: React.MouseEvent) => {
                        if (e) e.stopPropagation();
                        const next = isExpanded ? null : g.group_name;
                        setExpandedGroup(next);
                        setSelectedGroupOverride(g.group_name);
                      };

                      return (
                        <div key={g.group_name} className="flex flex-col">
                          {/* 单行主要卡片 */}
                          <div
                            onClick={handleToggleExpand}
                            className={cn(
                              "flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs transition-all cursor-pointer group",
                              isExpanded
                                ? "border-blue-500/70 bg-blue-50/80 dark:bg-blue-500/15 shadow-xs"
                                : isCur
                                  ? theme.drawerActive
                                  : "border-slate-200/70 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.015] hover:border-slate-300 dark:hover:border-white/15 hover:bg-slate-100/60 dark:hover:bg-white/[0.04]",
                            )}
                          >
                            {/* 左侧：健康圆点、分组名称与状态标签 */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span
                                className={cn(
                                  "w-2 h-2 rounded-full flex-shrink-0 shadow-2xs",
                                  st.dotColor,
                                )}
                              />

                              <span
                                className="font-mono text-xs font-semibold text-slate-800 dark:text-gray-200 truncate max-w-[260px] sm:max-w-[320px]"
                                title={groupName(g.group_name)}
                              >
                                {groupName(g.group_name)}
                              </span>

                              {isBound && (
                                <span
                                  className={cn(
                                    "text-[10px] px-1.5 py-0.2 rounded font-semibold border flex-shrink-0",
                                    theme.boundBadge,
                                  )}
                                >
                                  {t("ui.6e853bfa999b")}
                                </span>
                              )}

                              {isCur && !isBound && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 flex-shrink-0">
                                  {t("ui.727064c4264a")}
                                </span>
                              )}

                              {isRec && !isBound && (
                                <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded font-mono bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/20 flex-shrink-0">
                                  {t("ui.9c83a8a15754")}
                                </span>
                              )}
                            </div>

                            {/* 右侧：指标数值、改分组与展开按钮 */}
                            <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 text-slate-500 dark:text-gray-400 font-mono text-[11px]">
                              <span className="hidden md:inline-flex items-center gap-1 text-slate-400">
                                <Clock size={10} />
                                <span>
                                  {formatLatency(g.avg_response_time)}
                                </span>
                              </span>

                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold flex-shrink-0 shadow-2xs",
                                  st.bgBadge,
                                )}
                              >
                                {formatSuccessRate(g)} {st.label}
                              </span>

                              {/* 快捷改分组按钮 vs 当前使用指示 */}
                              {isBound ? (
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-md text-[10px] font-semibold border flex items-center gap-1 flex-shrink-0 shadow-2xs",
                                    theme.boundBadge,
                                  )}
                                  title={t("ui.77b56d94e4b7")}
                                >
                                  <Check size={11} className="stroke-[3]" />
                                  <span>{t("ui.297318c2765c")}</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleInitiateSwitchGroup(
                                      g.group_name,
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95 flex-shrink-0"
                                  title={t("ui.e4fcfed0027a", {
                                    v0: groupName(g.group_name),
                                  })}
                                >
                                  <Zap size={10} className="fill-current" />
                                  <span>{t("ui.8c5378419237")}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={handleToggleExpand}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer",
                                  isExpanded
                                    ? "bg-slate-200/80 text-slate-800 dark:bg-white/20 dark:text-gray-100"
                                    : isCur
                                      ? "bg-slate-200/80 text-slate-800 dark:bg-white/15 dark:text-gray-100"
                                      : "bg-slate-100 hover:bg-slate-200/80 text-slate-600 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400",
                                )}
                                title={
                                  isExpanded
                                    ? t("ui.4a70a3d60909")
                                    : t("ui.caaff66c2cc8")
                                }
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp size={11} />
                                    <span>{t("ui.5d5815647c76")}</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye size={11} />
                                    <span>{t("ui.de61aa8e1cbc")}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* ── 向下展开的健康状态详情抽屉卡片 ── */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: "easeOut" }}
                                className="overflow-hidden"
                              >
                                <div className="mt-1 mb-2 p-3.5 rounded-xl border border-blue-500/30 dark:border-blue-500/20 bg-white/95 dark:bg-[#111320]/95 shadow-sm space-y-3">
                                  {/* 顶部标题栏与快速切换 */}
                                  <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100 dark:border-white/5">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                        {groupName(g.group_name)}
                                      </span>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold shadow-2xs",
                                          st.bgBadge,
                                        )}
                                      >
                                        {t("message.e5042b524e1c", {
                                          v0: formatSuccessRate(g),
                                          v1: st.label,
                                        })}
                                      </span>
                                      {isBound && (
                                        <span
                                          className={cn(
                                            "text-[10px] px-1.5 py-0.2 rounded font-semibold border",
                                            theme.boundBadge,
                                          )}
                                        >
                                          {t("ui.d23c56447312")}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {!isBound ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleInitiateSwitchGroup(
                                              g.group_name,
                                            )
                                          }
                                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
                                        >
                                          <Zap
                                            size={12}
                                            className="fill-current"
                                          />
                                          <span>{t("ui.4c36c490514f")}</span>
                                        </button>
                                      ) : (
                                        <span
                                          className={cn(
                                            "text-xs px-2.5 py-1 rounded-lg font-semibold border flex items-center gap-1.5",
                                            theme.boundBadge,
                                          )}
                                        >
                                          <Check
                                            size={12}
                                            className="stroke-[3]"
                                          />
                                          <span>{t("ui.69a1229ef7e5")}</span>
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => setExpandedGroup(null)}
                                        className="text-[10px] text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 flex items-center gap-1 cursor-pointer transition-colors ml-1"
                                      >
                                        <ChevronUp size={12} />
                                        <span>{t("ui.a86af73bae23")}</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* 四宫格核心指标 */}
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                                      <div className="text-[10px] text-slate-400">
                                        {t("ui.ee75015b2cca")}
                                      </div>
                                      <div
                                        className={cn(
                                          "text-sm font-bold font-mono mt-0.5",
                                          st.colorText,
                                        )}
                                      >
                                        {formatSuccessRate(g)}
                                      </div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                                      <div className="text-[10px] text-slate-400">
                                        {t("ui.397236acf6e9")}
                                      </div>
                                      <div className="text-sm font-bold font-mono text-slate-800 dark:text-gray-200 mt-0.5">
                                        {formatLatency(g.avg_response_time)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* 全新高颜值健康状态走势大盘 */}
                                  <HealthTrendVisualizer
                                    trendPoints={g.trend_points}
                                    groupName={groupName(g.group_name)}
                                    successRate={g.success_rate}
                                    avgLatency={g.avg_response_time}
                                    totalRequests={g.total_requests}
                                    failedRequests={g.failed_requests}
                                    hours={hours}
                                    accentColor={accentColor}
                                    compact
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* ── 模式 2：双列卡片网格 (支持展开跨列查看详情) ── */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-1">
                    {filteredAndSortedGroups.map((g) => {
                      const isCur = g.group_name === activeGroup?.group_name;
                      const isBound =
                        resolvedCurrentGroup &&
                        g.group_name.toLowerCase() ===
                          resolvedCurrentGroup.toLowerCase();
                      const st = getHealthStatus(
                        g.success_rate,
                        g.total_requests,
                      );
                      const isExpanded = expandedGroup === g.group_name;

                      const handleToggleExpand = (e?: React.MouseEvent) => {
                        if (e) e.stopPropagation();
                        const next = isExpanded ? null : g.group_name;
                        setExpandedGroup(next);
                        setSelectedGroupOverride(g.group_name);
                      };

                      return (
                        <div
                          key={g.group_name}
                          className={cn(
                            "flex flex-col transition-all",
                            isExpanded && "sm:col-span-2",
                          )}
                        >
                          <div
                            onClick={handleToggleExpand}
                            className={cn(
                              "p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-2.5",
                              isExpanded
                                ? "border-blue-500/70 bg-blue-50/80 dark:bg-blue-500/15 shadow-xs"
                                : isCur
                                  ? theme.drawerActive
                                  : "border-slate-200/70 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.015] hover:border-slate-300 dark:hover:border-white/15",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate font-mono font-semibold text-slate-800 dark:text-gray-200">
                                  {groupName(g.group_name)}
                                </span>
                                {isBound && (
                                  <span className="text-[9px] px-1 py-0.2 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                    {t("ui.6aed7c48be71")}
                                  </span>
                                )}
                                {isCur && (
                                  <Check
                                    size={11}
                                    className={cn(
                                      "stroke-[3]",
                                      theme.drawerCheck,
                                    )}
                                  />
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                <span>
                                  {t("message.6d4be064a45c", {
                                    v0: formatLatency(g.avg_response_time),
                                  })}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-mono font-bold flex-shrink-0",
                                  st.bgBadge,
                                )}
                              >
                                {formatSuccessRate(g)}
                              </span>

                              {/* 快捷改分组按钮 vs 当前使用指示 */}
                              {isBound ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 flex items-center gap-0.5">
                                  <Check size={10} className="stroke-[3]" />
                                  {t("ui.e6aa2cbd7b42")}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleInitiateSwitchGroup(
                                      g.group_name,
                                    );
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-0.5 cursor-pointer shadow-2xs active:scale-95"
                                  title={t("ui.e4fcfed0027a", {
                                    v0: groupName(g.group_name),
                                  })}
                                >
                                  <Zap size={9} className="fill-current" />
                                  <span>{t("ui.25b60df68aba")}</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={handleToggleExpand}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex items-center gap-0.5 cursor-pointer",
                                  isExpanded
                                    ? "bg-slate-200/80 text-slate-800 dark:bg-white/20 dark:text-gray-100"
                                    : "bg-slate-100 hover:bg-slate-200/80 text-slate-600 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-400",
                                )}
                              >
                                {isExpanded ? (
                                  <ChevronUp size={10} />
                                ) : (
                                  <Eye size={10} />
                                )}
                                <span>
                                  {isExpanded
                                    ? t("ui.5d5815647c76")
                                    : t("ui.de61aa8e1cbc")}
                                </span>
                              </button>
                            </div>
                          </div>

                          {/* 向下展开的健康状态抽屉详情卡片 */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: "easeOut" }}
                                className="overflow-hidden"
                              >
                                <div className="mt-1 mb-2 p-3.5 rounded-xl border border-blue-500/30 dark:border-blue-500/20 bg-white/95 dark:bg-[#111320]/95 shadow-sm space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
                                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                                      {groupName(g.group_name)}
                                    </span>
                                    {!isBound ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleInitiateSwitchGroup(
                                            g.group_name,
                                          )
                                        }
                                        className="px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                      >
                                        <Zap
                                          size={10}
                                          className="fill-current"
                                        />
                                        <span>{t("ui.4c36c490514f")}</span>
                                      </button>
                                    ) : (
                                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1">
                                        <Check
                                          size={11}
                                          className="stroke-[3]"
                                        />
                                        <span>{t("ui.8b6c0fbc53d6")}</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                                      <div className="text-[10px] text-slate-400">
                                        {t("ui.ee75015b2cca")}
                                      </div>
                                      <div
                                        className={cn(
                                          "text-sm font-bold font-mono mt-0.5",
                                          st.colorText,
                                        )}
                                      >
                                        {formatSuccessRate(g)}
                                      </div>
                                    </div>
                                    <div className="p-2 rounded-lg bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                                      <div className="text-[10px] text-slate-400">
                                        {t("ui.397236acf6e9")}
                                      </div>
                                      <div className="text-sm font-bold font-mono text-slate-800 dark:text-gray-200 mt-0.5">
                                        {formatLatency(g.avg_response_time)}
                                      </div>
                                    </div>
                                  </div>

                                  <HealthTrendVisualizer
                                    trendPoints={g.trend_points}
                                    groupName={groupName(g.group_name)}
                                    successRate={g.success_rate}
                                    avgLatency={g.avg_response_time}
                                    totalRequests={g.total_requests}
                                    failedRequests={g.failed_requests}
                                    hours={hours}
                                    accentColor={accentColor}
                                    compact
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 全景对比大盘弹窗 (CompareModal) ── */}
      {monitoringAvailable &&
        compareModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 top-11 z-[85] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-md select-none animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setCompareModalOpen(false);
            }}
          >
            <div className="relative w-full max-w-[840px] max-h-[88vh] bg-white dark:bg-[#111320] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-gray-200">
              {/* 弹窗顶部栏 */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-white/[0.02] flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs",
                      theme.topIconBg,
                    )}
                  >
                    <Layers size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{t("ui.69ae7e246cdf")}</span>
                      <span className="text-xs font-mono font-normal text-slate-400 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5">
                        {t("message.6a632ac6975d", { v0: groups.length })}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                      {t("ui.94d3899441f5")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCompareModalOpen(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 弹窗检索与排序控制栏 */}
              <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 flex-wrap bg-white/40 dark:bg-white/[0.01]">
                <div className="relative flex-1 min-w-[220px]">
                  <Search
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder={t("ui.cb55845eb3ef")}
                    className={cn(
                      "w-full h-8 pl-8 pr-3 text-xs rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none focus:ring-1",
                      theme.focusRing,
                    )}
                  />
                </div>

                {/* 排序器 */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
                  <ArrowUpDown size={12} className="opacity-70" />
                  <span className="text-[11px]">{t("ui.d79728364510")}</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="h-8 px-2 text-xs rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-200 focus:outline-none cursor-pointer font-mono"
                  >
                    <option value="default">{t("ui.76809ed7e02c")}</option>
                    <option value="rate_desc">{t("ui.e30e98f61286")}</option>
                    <option value="latency_asc">{t("ui.0f5857db92a0")}</option>
                  </select>
                </div>
              </div>

              {/* 弹窗内容大盘列表 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-2">
                {filteredAndSortedGroups.map((g) => {
                  const isCur = g.group_name === activeGroup?.group_name;
                  const isBound =
                    resolvedCurrentGroup &&
                    g.group_name.toLowerCase() ===
                      resolvedCurrentGroup.toLowerCase();
                  const isRec = isGroupRecommended(g.group_name);
                  const st = getHealthStatus(g.success_rate, g.total_requests);

                  return (
                    <div
                      key={g.group_name}
                      onClick={() => {
                        setSelectedGroupOverride(g.group_name);
                        setCompareModalOpen(false);
                      }}
                      className={cn(
                        "p-3 rounded-2xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-4 group",
                        isCur
                          ? theme.drawerActive
                          : "border-slate-200/80 dark:border-white/5 bg-slate-50/40 dark:bg-white/[0.015] hover:border-slate-300 dark:hover:border-white/15 hover:bg-slate-100/50 dark:hover:bg-white/[0.03]",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span
                          className={cn(
                            "w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-xs",
                            st.dotColor,
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-900 dark:text-white truncate">
                              {groupName(g.group_name)}
                            </span>
                            {isBound && (
                              <span
                                className={cn(
                                  "text-[10px] px-2 py-0.2 rounded-md font-semibold border",
                                  theme.boundBadge,
                                )}
                              >
                                {t("ui.d23c56447312")}
                              </span>
                            )}
                            {isCur && !isBound && (
                              <span className="text-[10px] px-2 py-0.2 rounded-md font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                {t("ui.9b2b5e0f5e1a")}
                              </span>
                            )}
                            {isRec && (
                              <span className="text-[10px] px-2 py-0.2 rounded-md font-mono bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/20">
                                {t("ui.68d62d1a84ee")}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-gray-300 mt-1 flex items-center gap-3">
                            <span>
                              {t("message.f1c9d2548bb5", {
                                v0: formatLatency(g.avg_response_time),
                              })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-mono font-bold shadow-2xs",
                            st.bgBadge,
                          )}
                        >
                          {formatSuccessRate(g)} {st.label}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCompareModalOpen(false);
                            void handleInitiateSwitchGroup(g.group_name);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95",
                            isBound
                              ? "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-gray-200"
                              : theme.btnPrimary,
                          )}
                        >
                          {isBound ? (
                            <>
                              <Check size={13} className="stroke-[3]" />
                              <span>{t("ui.8b6c0fbc53d6")}</span>
                            </>
                          ) : (
                            <>
                              <Zap size={13} className="fill-current" />
                              <span>{t("ui.0e795d4d1118")}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── 核心改造：一键切换分组确认弹窗 (SwitchGroupModal) ── */}
      {switchModalState.open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 top-11 z-[90] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-md select-none animate-in fade-in duration-200"
            onClick={(e) => {
              if (
                e.target === e.currentTarget &&
                !switchModalState.isSubmitting
              ) {
                setSwitchModalState((prev) => ({ ...prev, open: false }));
              }
            }}
          >
            <div className="relative w-full max-w-[500px] bg-white dark:bg-[#111320] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-800 dark:text-gray-200 animate-in zoom-in-95 duration-200">
              {/* 弹窗头部 */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between gap-3 bg-slate-50/60 dark:bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-xs",
                      theme.topIconBg,
                    )}
                  >
                    <Zap size={16} className="fill-current text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{t("ui.d4e6dbf5cfef")}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/60 dark:border-blue-500/20">
                        {t("ui.d01b86375bbc")}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400">
                      {t("ui.4f5e9f2ccef6")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={switchModalState.isSubmitting}
                  onClick={() =>
                    setSwitchModalState((prev) => ({ ...prev, open: false }))
                  }
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 弹窗内容 */}
              <div className="p-6 space-y-4">
                {/* 目标分组预览卡片 */}
                <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/20 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-0.5">
                      {t("ui.78147dcd7d0a")}
                    </span>
                    <span className="text-sm font-bold font-mono text-slate-900 dark:text-white truncate block">
                      {groupName(switchModalState.targetGroupName)}
                    </span>
                    {switchModalState.targetGroupItem && (
                      <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-slate-500 dark:text-gray-400">
                        <span>
                          {t("message.0bb0784185d5", {
                            v0: formatLatency(
                              switchModalState.targetGroupItem
                                .avg_response_time,
                            ),
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {monitoringAvailable && switchModalState.targetGroupItem && (
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-mono font-bold flex-shrink-0 shadow-2xs",
                        getHealthStatus(
                          switchModalState.targetGroupItem.success_rate,
                          switchModalState.targetGroupItem.total_requests,
                        ).bgBadge,
                      )}
                    >
                      {formatSuccessRate(switchModalState.targetGroupItem)}{" "}
                      {
                        getHealthStatus(
                          switchModalState.targetGroupItem.success_rate,
                          switchModalState.targetGroupItem.total_requests,
                        ).label
                      }
                    </span>
                  )}
                </div>

                {/* 选择要更改分组的 API Key */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-gray-300 flex items-center justify-between">
                    <span>{t("ui.8ce45c556a31")}</span>
                    {switchModalState.tokensList.length > 0 && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {t("message.afd2fad968ad", {
                          v0: switchModalState.tokensList.length,
                        })}
                      </span>
                    )}
                  </label>

                  {switchModalState.loadingTokens ? (
                    <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                      <Loader2
                        size={14}
                        className="animate-spin text-blue-500"
                      />
                      <span>{t("ui.420d1ae1a44a")}</span>
                    </div>
                  ) : switchModalState.tokensList.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                      {t("ui.6545460606fa")}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={switchModalState.selectedTokenId || ""}
                        onChange={(e) =>
                          setSwitchModalState((prev) => ({
                            ...prev,
                            selectedTokenId: Number(e.target.value),
                          }))
                        }
                        className="w-full h-9 px-3 text-xs rounded-xl bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono cursor-pointer"
                      >
                        {switchModalState.tokensList.map((token) => (
                          <option key={token.id} value={token.id}>
                            {t("message.07a24e1a8feb", {
                              v0: token.name,
                              v1: token.group || t("ui.c8d09cf955f5"),
                            })}
                          </option>
                        ))}
                      </select>

                      {/* 当前选中的 Token 变更指引 */}
                      {(() => {
                        const curToken = switchModalState.tokensList.find(
                          (t) => t.id === switchModalState.selectedTokenId,
                        );
                        if (!curToken) return null;
                        return (
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 text-[11px] font-mono flex items-center justify-between">
                            <span className="text-slate-500">
                              {t("ui.3982f8cdfbff")}
                            </span>
                            <div className="flex items-center gap-1.5 font-semibold">
                              <span className="text-slate-600 dark:text-gray-400">
                                {curToken.group
                                  ? groupName(curToken.group)
                                  : t("ui.c8d09cf955f5")}
                              </span>
                              <span className="text-slate-400">➔</span>
                              <span className="text-blue-600 dark:text-blue-400">
                                {groupName(switchModalState.targetGroupName)}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* 同步选项复选框 */}
                <div className="pt-1">
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-gray-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={switchModalState.syncToAllAgents}
                      onChange={(e) =>
                        setSwitchModalState((prev) => ({
                          ...prev,
                          syncToAllAgents: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>{t("ui.7fea5bf38ce2")}</span>
                  </label>
                </div>

                {/* 即时生效温馨提示 */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed flex items-start gap-2">
                  <Sparkles
                    size={13}
                    className="text-amber-500 flex-shrink-0 mt-0.5"
                  />
                  <span>
                    <strong>{t("ui.ab5b4780028b")}</strong>
                    {t("ui.ef67b307de9a")}
                  </span>
                </div>

                {/* 错误警告条 */}
                {switchModalState.errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5">
                      <AlertCircle
                        size={14}
                        className="flex-shrink-0 mt-0.5 text-rose-500"
                      />
                      <span>{switchModalState.errorMessage}</span>
                    </div>
                    {switchModalState.errorMessage.includes("权限") ||
                    switchModalState.errorMessage.includes("无权") ? (
                      <button
                        type="button"
                        onClick={() => void openUrl(BRAND.siteUrl)}
                        className="underline text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex-shrink-0 hover:text-rose-900 cursor-pointer"
                      >
                        {t("ui.6f99aae3bca8")}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {/* 弹窗底部操作 */}
              <div className="overflow-visible px-6 py-3.5 border-t border-slate-100 dark:border-white/10 flex items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-white/[0.02]">
                <button
                  type="button"
                  disabled={switchModalState.isSubmitting}
                  onClick={() =>
                    setSwitchModalState((prev) => ({ ...prev, open: false }))
                  }
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t("common.cancel")}
                </button>

                <ButtonToLoaderToSuccess
                  accent="blue"
                  disabled={
                    switchModalState.isSubmitting ||
                    switchModalState.tokensList.length === 0
                  }
                  className="px-5 py-2 min-w-[180px]"
                  idleLabel={
                    <>
                      <Zap size={13} className="fill-current" />
                      <span>{t("ui.dcb6596ba21b")}</span>
                    </>
                  }
                  successLabel={t("ui.6e9e695ab27e")}
                  resetAfterMs={null}
                  holdMs={800}
                  onAction={handleConfirmSwitchGroup}
                  onBusyChange={(busy) =>
                    setSwitchModalState((prev) => ({
                      ...prev,
                      isSubmitting: busy,
                    }))
                  }
                  onComplete={() =>
                    setSwitchModalState((prev) => ({
                      ...prev,
                      open: false,
                      isSubmitting: false,
                    }))
                  }
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ChannelGroupMonitor;
