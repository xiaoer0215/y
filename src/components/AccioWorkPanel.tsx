import WorkspaceActions from "./WorkspaceActions";
import { useApiEndpointState } from "../lib/site-content";
import { t, useLocale } from "../lib/i18n";
import { useConfigReload } from "./ConfigChangeNotice";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  RefreshCw,
  Server,
  ShieldCheck,
  Sliders,
  Power,
  RotateCcw,
  Sparkles,
  Radio,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  KeyRound,
  Cpu,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AccioWorkIcon } from "./BrandIcons";
import {
  getAccioConfig,
  startAccioBridge,
  stopAccioBridge,
  getAccioBridgeStatus,
  fetchCodexModels,
  checkAppProcessStatus,
} from "../lib/api";
import { ConfigPathBar } from "./ConfigPathBar";
import { NodeCardSelector } from "./NodeCardSelector";
import { ApiKeyInput } from "./ApiKeyInput";
import { ChannelGroupMonitor } from "./ChannelGroupMonitor";
import { ModelInput } from "./ModelInput";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";
import { type AccioConfig, type AccioBridgeStatus } from "../types";
import { useModelFetch } from "../lib/useModelFetch";
import { useBoundTokenGroup } from "../lib/useBoundTokenGroup";
import { SpotlightCard } from "./react-bits/SpotlightCard";
import { TerminalTestModal } from "./TerminalTestModal";
import { StepIndicator, type StepDef } from "./StepIndicator";
import { ConfigConfirmStep } from "./ConfigConfirmStep";

const stepVariants = {
  enter: (dir: number) => ({ x: dir * 32, opacity: 0 }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: "easeOut" as const },
  },
  exit: (dir: number) => ({
    x: -dir * 32,
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" as const },
  }),
};

const TOTAL_STEPS = 5;

export function AccioWorkPanel() {
  useLocale();
  const [url, setUrl] = useApiEndpointState();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [bridgePort, setBridgePort] = useState<number>(8787);
  const [officialGateway, setOfficialGateway] = useState(
    "https://phoenix-gw.alibaba.com",
  );
  const [fallbackOfficial, setFallbackOfficial] = useState(false);
  const [preventOfficialLeak, setPreventOfficialLeak] = useState(true);
  const [autoStartBridge, setAutoStartBridge] = useState(true);

  const [configExists, setConfigExists] = useState(false);
  const [configPath, setConfigPath] = useState("");
  const [isInstalled, setIsInstalled] = useState(false);
  const [appPath, setAppPath] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [bridgeStatus, setBridgeStatus] = useState<AccioBridgeStatus>({
    is_running: false,
    port: null,
  });
  const [bridgeActionLoading, setBridgeActionLoading] = useState(false);

  const [clientRunning, setClientRunning] = useState(false);

  const [testModalOpen, setTestModalOpen] = useState(false);

  // ── 步骤化 UI 状态 ──
  const [currentStep, setCurrentStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [configConfirmed, setConfigConfirmed] = useState(false);

  const { models, refreshingModels, refreshModels } = useModelFetch(
    url,
    apiKey,
    (url, key) => fetchCodexModels(url, key, "acciowork"),
  );
  const { group: apiKeyGroup, onBoundTokenChange } = useBoundTokenGroup(
    "acciowork",
    apiKey,
  );

  useConfigReload("acciowork", () => load());
  const load = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const cfg = await getAccioConfig();
      setConfigExists(cfg.config_exists ?? false);
      setConfigPath(cfg.config_path ?? "");
      setIsInstalled(cfg.is_installed ?? false);
      setAppPath(cfg.app_path ?? null);

      if (!silent) {
        if (cfg.base_url?.trim()) {
          setUrl(cfg.base_url.trim());
        } else {
          setUrl("");
        }
        setApiKey(cfg.api_key || "");
        setModel(cfg.model || "");
        setBridgePort(cfg.bridge_port || 8787);
        setOfficialGateway(
          cfg.official_gateway || "https://phoenix-gw.alibaba.com",
        );
        setFallbackOfficial(cfg.fallback_official ?? false);
        setPreventOfficialLeak(cfg.prevent_official_leak ?? true);
        setAutoStartBridge(cfg.auto_start_bridge ?? true);
      }

      // 刷新 Bridge 状态与客户端运行状态
      const [bs, running] = await Promise.all([
        getAccioBridgeStatus().catch(() => ({
          is_running: false,
          port: null,
        })),
        checkAppProcessStatus("acciowork").catch(() => false),
      ]);
      setBridgeStatus(bs);
      setClientRunning(running);

      // 如果配置已存在，进入摘要视图
      if (!silent && (cfg.config_exists ?? false)) {
        setShowSummary(true);
        setMaxStepReached(TOTAL_STEPS - 1);
      }
    } catch (e) {
      toast.error(t("ui.f05a173bb110", { v0: e }));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setConfigConfirmed(false);
  }, [
    url,
    apiKey,
    model,
    bridgePort,
    officialGateway,
    fallbackOfficial,
    preventOfficialLeak,
    autoStartBridge,
  ]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void getAccioBridgeStatus()
        .then(setBridgeStatus)
        .catch(() => {});
      void checkAppProcessStatus("acciowork")
        .then(setClientRunning)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleBridge = async () => {
    setBridgeActionLoading(true);
    try {
      if (bridgeStatus.is_running) {
        await stopAccioBridge();
        setBridgeStatus({ is_running: false, port: null });
        toast.info(t("ui.c40cd3f28c35"));
      } else {
        const boundPort = await startAccioBridge(bridgePort);
        const actualStatus = await getAccioBridgeStatus().catch(() => ({
          is_running: true,
          port: boundPort,
        }));
        setBridgeStatus(actualStatus);
        if (actualStatus.port) {
          setBridgePort(actualStatus.port);
        }
        toast.success(
          t("ui.36d43a726a91", { v0: actualStatus.port || boundPort }),
        );
      }
    } catch (e) {
      toast.error(t("ui.f57bd1c8d5c0", { v0: e }));
    } finally {
      setBridgeActionLoading(false);
    }
  };

  const handleRestartBridge = async () => {
    setBridgeActionLoading(true);
    try {
      await stopAccioBridge().catch(() => {});
      const boundPort = await startAccioBridge(bridgePort);
      setBridgeStatus({ is_running: true, port: boundPort });
      toast.success(t("ui.428b1baf1a2d", { v0: boundPort }));
    } catch (e) {
      toast.error(t("ui.598e05172f57", { v0: e }));
    } finally {
      setBridgeActionLoading(false);
    }
  };

  const currentPayload: AccioConfig = {
    base_url: url,
    api_key: apiKey,
    model: model,
    bridge_port: Number(bridgePort) || 8787,
    official_gateway: officialGateway.trim(),
    fallback_official: fallbackOfficial,
    prevent_official_leak: preventOfficialLeak,
    auto_start_bridge: autoStartBridge,
    cached_models: models.map((m) => m.id),
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.warning(t("ui.99a3ab7c4480"));
      return;
    }
    if (!model.trim()) {
      toast.warning(t("ui.362d5a86e453"));
      return;
    }
    if (!showSummary && (currentStep !== TOTAL_STEPS - 1 || !configConfirmed)) {
      toast.warning(t("ui.97ddd03fc188"));
      if (currentStep !== TOTAL_STEPS - 1) {
        goToStep(TOTAL_STEPS - 1);
      }
      return;
    }
    setTestModalOpen(true);
  };

  // ── 步骤导航 ──
  const goToStep = (step: number) => {
    if (step > 1 && !apiKey.trim()) {
      toast.warning(t("ui.4660206d9c15"));
      setDirection(1 > currentStep ? 1 : -1);
      setCurrentStep(1);
      setShowSummary(false);
      setConfigConfirmed(false);
      return;
    }
    if (step > 2 && !model.trim()) {
      toast.warning(t("ui.b9fb83a45081"));
      setDirection(2 > currentStep ? 1 : -1);
      setCurrentStep(2);
      setShowSummary(false);
      setConfigConfirmed(false);
      return;
    }
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    setMaxStepReached((prev) => Math.max(prev, step));
    setShowSummary(false);
    if (step !== TOTAL_STEPS - 1) {
      setConfigConfirmed(false);
    }
  };
  const goNext = () => {
    if (currentStep === 1 && !apiKey.trim()) {
      toast.warning(t("ui.99a3ab7c4480"));
      return;
    }
    if (currentStep === 2 && !model.trim()) {
      toast.warning(t("ui.362d5a86e453"));
      return;
    }
    if (currentStep < TOTAL_STEPS - 1) goToStep(currentStep + 1);
  };
  const goPrev = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  // ── 摘要计算 ──
  const urlSummary = url
    ? url
        .replace(/https?:\/\//, "")
        .replace(/\/$/, "")
        .split("/")[0]
    : undefined;
  const keySummary =
    apiKey.length > 8
      ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`
      : apiKey
        ? t("ui.c6f6a42e6f8d")
        : undefined;

  const STEPS: StepDef[] = [
    { label: t("ui.454da0d646d3"), summary: urlSummary },
    { label: "API Key", summary: keySummary },
    { label: t("ui.4e769dd289db"), summary: model || undefined },
    {
      label: t("ui.14c7ac680752"),
      summary: bridgeStatus.is_running
        ? t("ui.dec235ab1b65", { v0: bridgeStatus.port || bridgePort })
        : t("ui.5464aca4a129"),
    },
    {
      label: t("ui.6d9a386c6586"),
      summary: configConfirmed ? t("ui.d9fea67ad2be") : undefined,
    },
  ];

  // ── 各步骤内容渲染 ──
  const renderStep = (step: number) => {
    switch (step) {
      case 0:
        return (
          <div className="p-4 flex flex-col gap-4">
            <SpotlightCard
              className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex flex-col"
              spotlightColor="rgba(255, 106, 0, 0.12)"
            >
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                  <Server size={14} className="text-orange-500" />
                  {t("ui.7f63cd1d81db")}
                </Label>
                <span className="text-[11px] text-slate-400 dark:text-gray-500">
                  {t("ui.19fccf88d80e")}
                </span>
              </div>
              <NodeCardSelector
                value={url}
                onChange={setUrl}
                accentColor="orange"
              />
            </SpotlightCard>
            <p className="text-[11px] text-slate-500 dark:text-gray-400 text-center px-2">
              {t("ui.2dee9749e655")}
            </p>
          </div>
        );

      case 1:
        return (
          <div className="p-4 flex flex-col gap-4">
            <SpotlightCard
              className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none"
              spotlightColor="rgba(255, 106, 0, 0.12)"
            >
              <ApiKeyInput
                title="API Key"
                badgeText="accio_config.json"
                value={apiKey}
                onChange={setApiKey}
                placeholder={t("ui.6a25380f4466")}
                storageLocation="~/.ai-helper/accio_config.json"
                hintText={t("ui.52309c14636f")}
                accentColor="orange"
                toolName="Accio Work"
                toolId="acciowork"
                onBoundTokenChange={onBoundTokenChange}
              />
            </SpotlightCard>
          </div>
        );

      case 2:
        return (
          <div className="p-4 flex flex-col gap-4">
            <SpotlightCard
              className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none"
              spotlightColor="rgba(255, 106, 0, 0.12)"
            >
              <ModelInput
                value={model}
                onChange={setModel}
                models={models}
                placeholder={t("ui.55b3fd4467dd")}
                id="accio-models"
                onRefresh={() => void refreshModels()}
                refreshing={refreshingModels}
                accentColor="orange"
              />
            </SpotlightCard>

            <div className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed flex items-start gap-2">
              <Sparkles size={13} className="text-orange-500 shrink-0 mt-0.5" />
              <span>{t("ui.09613140dbaf")}</span>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="p-4 flex flex-col gap-4">
            <SpotlightCard
              className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm dark:shadow-none flex flex-col"
              spotlightColor="rgba(255, 106, 0, 0.12)"
            >
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                  <Sliders size={14} className="text-orange-500" />
                  {t("ui.1ecf887f2d25")}
                </Label>
                <span className="text-[11px] text-slate-400 dark:text-gray-500">
                  {t("ui.093c45410a26")}
                </span>
              </div>

              {/* 核心架构说明横幅：为什么必须开启 Bridge */}
              <div className="p-3 rounded-xl border border-amber-200/80 bg-amber-50/70 dark:border-amber-500/25 dark:bg-amber-500/10 mb-3.5 flex items-start gap-2.5">
                <AlertCircle
                  size={15}
                  className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                />
                <div className="space-y-0.5 text-[11px]">
                  <span className="font-semibold text-amber-900 dark:text-amber-200">
                    {t("ui.9d435f50f323")}
                  </span>
                  <p className="text-slate-600 dark:text-gray-300 leading-relaxed">
                    {t("ui.4fc466e19764")}
                  </p>
                </div>
              </div>

              {/* 随 AI Helper 自动拉起 Bridge 开关 */}
              <div className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.03] mb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Radio size={14} className="text-orange-500" />
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {t("ui.3d1c0ce22cd2")}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400 leading-relaxed">
                      {t("ui.fbb89a010037")}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={autoStartBridge}
                      onChange={(e) => setAutoStartBridge(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-white/10 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
                  </label>
                </div>
              </div>

              {/* 防耗豆熔断开关 */}
              <div className="p-3 rounded-xl border border-orange-200/80 bg-orange-50/50 dark:border-orange-500/20 dark:bg-orange-500/5 mb-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck
                        size={15}
                        className="text-orange-600 dark:text-orange-400"
                      />
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {t("ui.1a75d6199cce")}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-gray-300 leading-relaxed">
                      {t("ui.b95a3b0743b5")}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={preventOfficialLeak}
                      onChange={(e) => setPreventOfficialLeak(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-white/10 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500" />
                  </label>
                </div>
              </div>

              {/* 网关端口与透明代理配置 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-gray-300 flex items-center justify-between">
                    <span>{t("ui.35415403f47a")}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      8787..=8807
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={bridgePort}
                    onChange={(e) =>
                      setBridgePort(Number(e.target.value) || 8787)
                    }
                    className="w-full h-9 px-3 rounded-lg font-mono text-xs bg-slate-50/80 dark:bg-[#141724]/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-gray-200 focus:bg-white dark:focus:bg-[#141724] focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 outline-none"
                    placeholder="8787"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-gray-300">
                    {t("ui.64a186083221")}
                  </label>
                  <div className="flex items-center justify-between h-9 px-3 rounded-lg bg-slate-50/80 dark:bg-[#141724]/80 border border-slate-200 dark:border-white/10">
                    <span className="text-xs text-slate-600 dark:text-gray-300">
                      {t("ui.b51839da08ce")}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={fallbackOfficial}
                        onChange={(e) => setFallbackOfficial(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-white/10 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500" />
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-400 dark:text-gray-500 flex items-center justify-between">
                <span>
                  {t("message.99560684257b", { v0: officialGateway })}
                </span>
                <span className="text-[10px] font-mono">
                  {t("ui.5b90232db8f4")}
                </span>
              </div>
            </SpotlightCard>
          </div>
        );

      case 4:
        return (
          <div className="p-4 flex flex-col gap-4">
            <ConfigConfirmStep
              accentColor="orange"
              spotlightColor="rgba(255, 106, 0, 0.12)"
              totalSteps={TOTAL_STEPS}
              confirmed={configConfirmed}
              onConfirmedChange={setConfigConfirmed}
              onEditStep={goToStep}
              items={[
                {
                  label: t("ui.454da0d646d3"),
                  value: urlSummary || url,
                  detail: url,
                  icon: <Server size={14} />,
                  stepIndex: 0,
                },
                {
                  label: "API Key",
                  value: keySummary || t("ui.63595e95b708"),
                  badge: apiKeyGroup || undefined,
                  icon: <KeyRound size={14} />,
                  stepIndex: 1,
                },
                {
                  label: t("ui.4e769dd289db"),
                  value: model || t("ui.63595e95b708"),
                  icon: <Cpu size={14} />,
                  stepIndex: 2,
                },
                {
                  label: t("ui.14c7ac680752"),
                  value: t("ui.87eb1427429e", {
                    v0: bridgePort,
                    v1: autoStartBridge
                      ? t("ui.6440f7c342b7")
                      : t("ui.ecbb2f17541c"),
                  }),
                  detail: [
                    preventOfficialLeak
                      ? t("ui.905514b316a3")
                      : t("ui.5852a8801071"),
                    fallbackOfficial
                      ? t("ui.cffa9ef6881e")
                      : t("ui.fa05f2094db8"),
                  ].join(" · "),
                  icon: <Radio size={14} />,
                  stepIndex: 3,
                },
              ]}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // ── 摘要视图 ──
  const SummarySection = () => (
    <div className="w-full flex flex-col gap-4">
      <SpotlightCard
        className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
        spotlightColor="rgba(255, 106, 0, 0.12)"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("ui.2f8f89f2092a")}
            </span>
          </div>
          <span className="text-[11px] font-mono text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-200 dark:border-orange-500/20">
            {bridgeStatus.is_running
              ? t("ui.ec3dc7f73e2b")
              : t("ui.805c738ed30a")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
              <Server size={13} className="text-orange-500" />
              <span>{t("ui.e83d1c572f65")}</span>
            </div>
            <div
              className="text-xs font-mono font-medium text-slate-800 dark:text-gray-200 truncate"
              title={url}
            >
              {urlSummary || url}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 min-w-0">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
              <KeyRound size={13} className="text-orange-500 shrink-0" />
              <span>{t("ui.309dd9bf415f")}</span>
            </div>
            {apiKeyGroup ? (
              <div className="mb-1 min-w-0">
                <span
                  className="inline-block max-w-full px-1.5 py-0.5 rounded-md border text-[10px] font-medium leading-snug break-words bg-orange-50 text-orange-600 border-orange-200/80 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/25"
                  title={t("ui.383f5c817104", { v0: apiKeyGroup })}
                >
                  {apiKeyGroup}
                </span>
              </div>
            ) : null}
            <div className="text-xs font-mono font-medium text-slate-800 dark:text-gray-200 truncate">
              {keySummary || t("ui.63595e95b708")}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
              <Cpu size={13} className="text-orange-500" />
              <span>{t("ui.bb2a9685f435")}</span>
            </div>
            <div className="text-xs font-mono font-medium text-orange-600 dark:text-orange-400 truncate">
              {model || t("ui.63595e95b708")}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
              <Radio size={13} className="text-orange-500" />
              <span>{t("ui.cbf29a3662f0")}</span>
            </div>
            <div className="text-xs font-mono font-medium text-slate-800 dark:text-gray-200 truncate">
              :{bridgeStatus.port || bridgePort} (
              {bridgeStatus.is_running
                ? t("ui.0373ff923114")
                : t("ui.5464aca4a129")}
              )
            </div>
          </div>
        </div>
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/5 text-xs">
            <div className="flex items-center gap-2 truncate pr-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  clientRunning
                    ? "bg-emerald-500 animate-pulse"
                    : isInstalled
                      ? "bg-blue-400"
                      : "bg-slate-400"
                }`}
              />
              <span className="text-slate-700 dark:text-gray-300 truncate">
                {clientRunning
                  ? t("ui.d29126b64b64")
                  : isInstalled
                    ? t("ui.f273a3c1a014")
                    : t("ui.1faa53f4c82a")}
              </span>
            </div>
            {appPath ? (
              <span
                className="text-[10px] font-mono text-slate-400 dark:text-gray-500 truncate max-w-[160px]"
                title={appPath}
              >
                {appPath}
              </span>
            ) : (
              <span className="text-[10px] text-amber-500">
                {t("ui.025cecd9e68f")}
              </span>
            )}
          </div>
        </div>
      </SpotlightCard>

      {/* 实时通道分组健康监控面板（概览模式直接呈现） */}
      <ChannelGroupMonitor
        toolName="Accio Work"
        toolId="acciowork"
        accentColor="orange"
      />
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[300px] gap-3">
        <Loader2 className="animate-spin text-orange-500" size={36} />
        <span className="text-xs text-slate-500 dark:text-gray-400 animate-pulse">
          {t("ui.49881b0f8d12")}
        </span>
      </div>
    );
  }

  return (
    <div className="tool-config-panel w-full flex flex-col gap-6 pb-4">
      {/* ── 标题栏 ── */}
      <div className="tool-panel-header flex flex-col gap-4 pb-5 border-b border-slate-200/80 dark:border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 border border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30 flex items-center justify-center flex-shrink-0 shadow-xs">
            <AccioWorkIcon size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                {t("ui.f481feabf25c")}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30">
                Alibaba International / RLab Bridge
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {t("ui.40cd25cf6715")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 与同一行操作按钮保持相同高度。 */}
          <div
            data-ui="bridge-status"
            className={`flex h-9 shrink-0 items-center gap-1.5 px-2.5 rounded-md text-xs font-mono border ${
              bridgeStatus.is_running
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-white/10"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                bridgeStatus.is_running
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-slate-400"
              }`}
            />
            <span>
              {bridgeStatus.is_running
                ? t("ui.7a6908958b92", { v0: bridgeStatus.port || bridgePort })
                : t("ui.46c6e7f663cf")}
            </span>
          </div>

          {showSummary && (
            <button
              type="button"
              onClick={() => goToStep(0)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-500/10 dark:hover:bg-orange-500/20 dark:border-orange-500/30 dark:text-orange-300 shadow-2xs cursor-pointer"
              title={t("ui.e88600ebcc8d")}
            >
              <Sparkles size={12} />
              <span>{t("ui.a5f46fb54bb8")}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:text-gray-300 shadow-2xs cursor-pointer"
            title={t("ui.0d9e9ec60c06")}
          >
            <RefreshCw size={12} />
            <span>{t("common.reload")}</span>
          </button>
          {showSummary && <WorkspaceActions agent="acciowork" />}
          <ConfigPathBar
            path={configPath}
            shortPath="~/.ai-helper/accio_config.json"
            exists={configExists}
            accentColor="orange"
          />
        </div>
      </div>

      {/* ── 步骤指示器（非摘要模式下显示）── */}
      {!showSummary && (
        <div className="flex-shrink-0 px-2 py-4 border-b border-slate-100/80 dark:border-white/5">
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={goToStep}
            accentColor="orange"
            maxStepReached={maxStepReached}
          />
        </div>
      )}

      {/* ── 主内容区 ── */}
      <div className="tool-panel-content w-full flex flex-col gap-4">
        {showSummary ? (
          <SummarySection />
        ) : (
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="w-full flex flex-col gap-4"
            >
              {renderStep(currentStep)}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── 底部导航栏 (苹果风毛玻璃悬浮 Dock 栏) ── */}
      <div className="sticky bottom-4 z-20 mt-auto py-2.5 px-4 rounded-2xl bg-white/45 dark:bg-[#0c0e18]/45 backdrop-blur-xl backdrop-saturate-150 border border-white/60 dark:border-white/10 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.06),inset_0_1px_1px_0_rgba(255,255,255,0.7)] dark:shadow-[0_4px_24px_-2px_rgba(0,0,0,0.3),inset_0_1px_1px_0_rgba(255,255,255,0.08)] flex-shrink-0 transition-all">
        {showSummary ? (
          <div className="workspace-summary-actions flex flex-wrap items-center justify-between gap-3">
            {/* 左侧：辅助动作与状态指示 */}
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => goToStep(0)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-white/80 dark:border-white/10 bg-white/60 hover:bg-white/90 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-300 transition-all shadow-2xs backdrop-blur-xs cursor-pointer"
                title={t("ui.b0af77432854")}
              >
                <RefreshCw
                  size={13}
                  className="text-slate-500 dark:text-gray-400"
                />
                <span>{t("ui.0632c4ed79fa")}</span>
              </button>
              <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span>{t("ui.33c8ce6174be")}</span>
              </div>
            </div>

            {/* 右侧：主保存操作 */}
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={testModalOpen}
                className="flex items-center justify-center gap-2 px-6 py-2.5 min-h-9 max-w-full min-w-[190px] rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={14} />
                <span>{t("ui.41036a20cdb0")}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {/* 左侧：上一步与进度 */}
            <div className="flex items-center gap-2">
              {currentStep > 0 ? (
                <button
                  type="button"
                  onClick={goPrev}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-white/80 dark:border-white/10 bg-white/60 hover:bg-white/90 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:text-gray-300 transition-all shadow-2xs backdrop-blur-xs cursor-pointer"
                >
                  <ChevronLeft size={14} />
                  <span>{t("common.previous")}</span>
                </button>
              ) : null}
              <span className="text-[11px] text-slate-500 dark:text-gray-400 font-medium px-2">
                {t("message.2b2fce0f7192", {
                  v0: currentStep + 1,
                  v1: TOTAL_STEPS,
                })}
              </span>
            </div>

            {/* 右侧：返回概览与推进/保存 */}
            <div className="flex items-center gap-2.5">
              {configExists && (
                <button
                  type="button"
                  onClick={() => setShowSummary(true)}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  {t("ui.13e491d46e85")}
                </button>
              )}

              {currentStep < TOTAL_STEPS - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-medium bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white transition-colors shadow-xs cursor-pointer"
                >
                  <span>{t("common.next")}</span>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={testModalOpen}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-6 py-2 min-w-[190px] rounded-xl text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                    configConfirmed
                      ? "bg-orange-600 hover:bg-orange-700 active:bg-orange-800"
                      : "bg-orange-600/80 hover:bg-orange-600",
                  )}
                >
                  <Save size={14} />
                  <span>{t("ui.1e644535a5b7")}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bridge 控制固定浮层（始终可见）── */}
      <div className="flex-shrink-0 mt-2 pt-2.5 border-t border-slate-200/80 dark:border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Bridge 在线/离线状态胶囊 */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border ${
                bridgeStatus.is_running
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 border-slate-200 dark:border-white/10"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${bridgeStatus.is_running ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`}
              />
              <span>
                {bridgeStatus.is_running
                  ? t("ui.7a6908958b92", {
                      v0: bridgeStatus.port || bridgePort,
                    })
                  : t("ui.46c6e7f663cf")}
              </span>
            </div>
            {/* 启动/停止 */}
            <button
              onClick={() => void handleToggleBridge()}
              disabled={bridgeActionLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors shadow-2xs cursor-pointer disabled:opacity-60 ${
                bridgeStatus.is_running
                  ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400"
              }`}
            >
              {bridgeActionLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : bridgeStatus.is_running ? (
                <Power size={12} />
              ) : (
                <Radio size={12} />
              )}
              <span>
                {bridgeStatus.is_running
                  ? t("ui.a17f70a8d3d6")
                  : t("ui.ebd26da42171")}{" "}
                Bridge
              </span>
            </button>
            {/* 重启（仅在线时显示） */}
            {bridgeStatus.is_running && (
              <button
                onClick={() => void handleRestartBridge()}
                disabled={bridgeActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
              >
                <RotateCcw size={12} />
                {t("ui.f01842a11b6b")}
              </button>
            )}
          </div>
          <span
            className={`text-[11px] font-mono ${bridgeStatus.is_running ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}
          >
            {bridgeStatus.is_running
              ? `http://127.0.0.1:${bridgeStatus.port || bridgePort}`
              : t("ui.9832ddea8aa8")}
          </span>
        </div>
      </div>

      <TerminalTestModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        type="acciowork"
        url={url}
        apiKey={apiKey}
        model={model}
        accioPayload={currentPayload}
        onSuccess={() => {
          setConfigExists(true);
          setShowSummary(true);
          setMaxStepReached(TOTAL_STEPS - 1);
          setConfigConfirmed(false);
          void load(true);
        }}
      />
    </div>
  );
}

export default AccioWorkPanel;
