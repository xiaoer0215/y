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
  Cpu,
  Sliders,
  HelpCircle,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  Info,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  KeyRound,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { WorkbuddyIcon } from "./BrandIcons";
import {
  deleteWorkbuddyModel,
  fetchCodexModels,
  getWorkbuddyConfig,
} from "../lib/api";
import { ConfigPathBar } from "./ConfigPathBar";
import { NodeCardSelector } from "./NodeCardSelector";
import { ApiKeyInput } from "./ApiKeyInput";
import { ChannelGroupMonitor } from "./ChannelGroupMonitor";
import { ModelInput } from "./ModelInput";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";
import { type WorkbuddyModelItem, type WorkbuddySavePayload } from "../types";
import { useModelFetch } from "../lib/useModelFetch";
import { useBoundTokenGroup } from "../lib/useBoundTokenGroup";
import { SpotlightCard } from "./react-bits/SpotlightCard";
import { TerminalTestModal } from "./TerminalTestModal";
import { StepIndicator, type StepDef } from "./StepIndicator";
import { ConfigConfirmStep } from "./ConfigConfirmStep";

const EFFORT_OPTIONS = [
  {
    id: "low",
    get label() {
      return t("ui.ba6c89bce64b");
    },
  },
  {
    id: "medium",
    get label() {
      return t("ui.086530f8f62c");
    },
  },
  {
    id: "high",
    get label() {
      return t("ui.82a0806da831");
    },
  },
  {
    id: "xhigh",
    get label() {
      return t("ui.614360fc8613");
    },
  },
  {
    id: "max",
    get label() {
      return t("ui.b5996c1867e9");
    },
  },
] as const;

const INPUT_TOKEN_PRESETS = [
  { label: "32K", value: 32768 },
  { label: "64K", value: 65536 },
  { label: "128K", value: 131072 },
  { label: "256K", value: 262144 },
];

const OUTPUT_TOKEN_PRESETS = [
  { label: "8K", value: 8192 },
  { label: "16K", value: 16384 },
  { label: "32K", value: 32768 },
  { label: "64K", value: 65536 },
];

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

export function WorkbuddyPanel() {
  useLocale();
  const [url, setUrl] = useApiEndpointState();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-5.6-sol");
  const [configExists, setConfigExists] = useState(false);
  const [configPath, setConfigPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [configuredModels, setConfiguredModels] = useState<
    WorkbuddyModelItem[]
  >([]);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  // ── 步骤化导航状态 ──
  const [currentStep, setCurrentStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [configConfirmed, setConfigConfirmed] = useState(false);

  // 高级能力开关
  const [supportsToolCall, setSupportsToolCall] = useState(true);
  const [supportsImages, setSupportsImages] = useState(true);
  const [supportsReasoning, setSupportsReasoning] = useState(true);
  const [onlyReasoning, setOnlyReasoning] = useState(false);
  const [canDisableThinking, setCanDisableThinking] = useState(true);
  const [useCustomProtocol, setUseCustomProtocol] = useState(false);

  // 思考强度设置
  const [defaultEffort, setDefaultEffort] = useState<string>("");
  const [supportedEfforts, setSupportedEfforts] = useState<string[]>([
    "medium",
  ]);

  // Token 限制
  const [maxInputTokens, setMaxInputTokens] = useState<number | "">(32768);
  const [maxOutputTokens, setMaxOutputTokens] = useState<number | "">(32768);

  const { models, refreshingModels, refreshModels } = useModelFetch(
    url,
    apiKey,
    (url, key) => fetchCodexModels(url, key, "workbuddy"),
  );
  const { group: apiKeyGroup, onBoundTokenChange } = useBoundTokenGroup(
    "workbuddy",
    apiKey,
  );

  const applyModelConfig = (item: WorkbuddyModelItem) => {
    setModel(item.id);
    if (item.apiKey) {
      setApiKey(item.apiKey);
    }
    if (item.url) {
      const rawUrl = item.url.replace(/\/+$/, "");
      const stripped = rawUrl.endsWith("/v1") ? rawUrl.slice(0, -3) : rawUrl;
      if (stripped) {
        setUrl(`${stripped}/`);
      }
    }
    setSupportsToolCall(item.supportsToolCall ?? true);
    setSupportsImages(item.supportsImages ?? true);
    setSupportsReasoning(item.supportsReasoning ?? true);
    setOnlyReasoning(item.onlyReasoning ?? false);
    setUseCustomProtocol(item.useCustomProtocol ?? false);
    setCanDisableThinking(item.reasoning?.canDisableThinking ?? true);
    setDefaultEffort(item.reasoning?.defaultEffort ?? "");
    setSupportedEfforts(
      item.reasoning?.supportedEfforts &&
        item.reasoning.supportedEfforts.length > 0
        ? item.reasoning.supportedEfforts
        : ["medium"],
    );
    setMaxInputTokens(item.maxInputTokens ?? 32768);
    setMaxOutputTokens(item.maxOutputTokens ?? 32768);
  };

  const load = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const cfg = await getWorkbuddyConfig();
      setConfigExists(cfg.config_exists);
      setConfigPath(cfg.config_path);
      setConfiguredModels(cfg.configured_models || []);

      if (cfg.config_exists) {
        setShowSummary(true);
        setMaxStepReached(TOTAL_STEPS - 1);
      }

      // 仅在非静默模式（初次载入或用户手动重新载入）下才覆盖当前表单中的模型与参数
      if (!silent) {
        const loadedUrl = cfg.base_url?.trim();
        if (loadedUrl) {
          setUrl(loadedUrl);
        } else {
          setUrl("");
        }
        setApiKey(cfg.api_key || "");
        setModel(cfg.model || "gpt-5.6-sol");

        setSupportsToolCall(cfg.supports_tool_call ?? true);
        setSupportsImages(cfg.supports_images ?? true);
        setSupportsReasoning(cfg.supports_reasoning ?? true);
        setOnlyReasoning(cfg.only_reasoning ?? false);
        setCanDisableThinking(cfg.can_disable_thinking ?? true);
        setUseCustomProtocol(cfg.use_custom_protocol ?? false);

        setDefaultEffort(cfg.default_effort || "");
        setSupportedEfforts(
          cfg.supported_efforts?.length > 0
            ? cfg.supported_efforts
            : ["medium"],
        );

        setMaxInputTokens(cfg.max_input_tokens ?? 32768);
        setMaxOutputTokens(cfg.max_output_tokens ?? 32768);
      }
    } catch (e) {
      toast.error(t("ui.d2a5683cf75d", { v0: e }));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useConfigReload("workbuddy", () => load());
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setConfigConfirmed(false);
  }, [
    url,
    apiKey,
    model,
    supportsToolCall,
    supportsImages,
    supportsReasoning,
    onlyReasoning,
    canDisableThinking,
    useCustomProtocol,
    defaultEffort,
    supportedEfforts,
    maxInputTokens,
    maxOutputTokens,
  ]);

  const handleReload = () => {
    void load(false);
  };

  const toggleEffort = (effortId: string) => {
    setSupportedEfforts((prev) =>
      prev.includes(effortId)
        ? prev.filter((id) => id !== effortId)
        : [...prev, effortId],
    );
  };

  const handleAddNewModel = () => {
    setModel("");
    toast.info(t("ui.fcbca90181e9"));
  };

  const handleDeleteModel = async (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    if (!window.confirm(t("ui.f3494d6e5e8a", { v0: modelId }))) {
      return;
    }
    setDeletingModelId(modelId);
    try {
      const updated = await deleteWorkbuddyModel(modelId);
      setConfiguredModels(updated);
      toast.success(t("ui.1df28aa4997d", { v0: modelId }));
      if (model.trim() === modelId.trim()) {
        if (updated.length > 0) {
          applyModelConfig(updated[0]);
        } else {
          setModel("");
        }
      }
    } catch (err) {
      toast.error(t("ui.20164a9fbaf2", { v0: err }));
    } finally {
      setDeletingModelId(null);
    }
  };

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
      toast.warning(t("ui.c2887eb403a0"));
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

  const handleNext = () => {
    if (currentStep === 1 && !apiKey.trim()) {
      toast.warning(t("ui.99a3ab7c4480"));
      return;
    }
    if (currentStep === 2 && !model.trim()) {
      toast.warning(t("ui.53b8285f289c"));
      return;
    }
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.warning(t("ui.99a3ab7c4480"));
      return;
    }
    if (!model.trim()) {
      toast.warning(t("ui.53b8285f289c"));
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

  const isExistingModel = configuredModels.some(
    (m) => m.id.trim().toLowerCase() === model.trim().toLowerCase(),
  );

  const currentPayload: WorkbuddySavePayload = {
    url,
    api_key: apiKey.trim(),
    model: model.trim(),
    supports_tool_call: supportsToolCall,
    supports_images: supportsImages,
    supports_reasoning: supportsReasoning,
    only_reasoning: onlyReasoning,
    can_disable_thinking: canDisableThinking,
    use_custom_protocol: useCustomProtocol,
    default_effort: defaultEffort || null,
    supported_efforts: supportedEfforts,
    max_input_tokens: maxInputTokens === "" ? null : Number(maxInputTokens),
    max_output_tokens: maxOutputTokens === "" ? null : Number(maxOutputTokens),
  };

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

  const advancedSummary =
    [
      supportsToolCall ? t("ui.a72ef18d9a0e") : null,
      supportsImages ? t("ui.be8da62ea113") : null,
      supportsReasoning ? t("ui.a6c1499244b7") : null,
    ]
      .filter(Boolean)
      .join(" · ") || t("ui.f282cf6f2785");

  const STEPS: StepDef[] = [
    { label: t("ui.454da0d646d3"), summary: urlSummary },
    { label: "API Key", summary: keySummary },
    { label: t("ui.e91bf63444bf"), summary: model || undefined },
    {
      label: t("ui.defb671513e8"),
      summary: supportsReasoning ? t("ui.d17ece27ec43") : t("ui.f282cf6f2785"),
    },
    {
      label: t("ui.6d9a386c6586"),
      summary: configConfirmed ? t("ui.d9fea67ad2be") : undefined,
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[300px] gap-3">
        <Loader2 className="animate-spin text-emerald-500" size={36} />
        <span className="text-xs text-slate-500 dark:text-gray-400 animate-pulse">
          {t("ui.7ee2c4ca5d8d")}
        </span>
      </div>
    );
  }

  return (
    <div className="tool-config-panel w-full flex flex-col gap-6 pb-4">
      {/* ── 顶部面板标题栏 ── */}
      <div className="tool-panel-header flex flex-col gap-4 pb-5 border-b border-slate-200/80 dark:border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 flex items-center justify-center flex-shrink-0 shadow-xs">
            <WorkbuddyIcon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                {t("ui.b0119032984b")}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30">
                {t("ui.572d1c9458b1")}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {t("ui.d0021acea9ae")}
            </p>
          </div>
        </div>

        <div className="self-start md:self-auto flex flex-wrap items-center gap-2">
          {showSummary && (
            <button
              type="button"
              onClick={() => goToStep(0)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-300 shadow-2xs cursor-pointer"
              title={t("ui.e88600ebcc8d")}
            >
              <Sparkles size={12} />
              <span>{t("ui.a5f46fb54bb8")}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleReload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-white/5 dark:hover:bg-white/10 dark:border-white/10 dark:text-gray-300 shadow-2xs cursor-pointer"
            title={t("ui.0d9e9ec60c06")}
          >
            <RefreshCw size={12} />
            <span>{t("common.reload")}</span>
          </button>
          {showSummary && <WorkspaceActions agent="workbuddy" />}
          <ConfigPathBar
            path={configPath}
            shortPath={
              !configPath || /[\\/]\.workbuddy[\\/]models\.json$/i.test(configPath)
                ? "~/.workbuddy/models.json"
                : configPath
            }
            exists={configExists}
            accentColor="emerald"
            className="max-w-full sm:max-w-[26rem]"
          />
        </div>
      </div>

      {/* ── 步骤指示条（非摘要模式下显示） ── */}
      {!showSummary && (
        <div className="flex-shrink-0 px-1 py-2 border-b border-slate-100 dark:border-white/5">
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={goToStep}
            accentColor="emerald"
            maxStepReached={maxStepReached}
          />
        </div>
      )}

      {/* ── 主内容工作区 ── */}
      <div className="tool-panel-content w-full flex flex-col gap-4">
        {showSummary ? (
          /* ── 摘要视图（已有配置时默认呈现） ── */
          <div className="w-full flex flex-col gap-4">
            <SpotlightCard
              className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
              spotlightColor="rgba(16, 185, 129, 0.12)"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("ui.2f8f89f2092a")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20">
                    {t("message.faf230aacec4", { v0: configuredModels.length })}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
                    <Server size={13} className="text-emerald-500" />
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
                    <KeyRound size={13} className="text-emerald-500 shrink-0" />
                    <span>{t("ui.309dd9bf415f")}</span>
                  </div>
                  {apiKeyGroup ? (
                    <div className="mb-1 min-w-0">
                      <span
                        className="inline-block max-w-full px-1.5 py-0.5 rounded-md border text-[10px] font-medium leading-snug break-words bg-emerald-50 text-emerald-600 border-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25"
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
                    <Cpu size={13} className="text-emerald-500" />
                    <span>{t("ui.2831bc32ff32")}</span>
                  </div>
                  <div className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400 truncate">
                    {model || t("ui.63595e95b708")}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
                    <Layers size={13} className="text-emerald-500" />
                    <span>{t("ui.a4cefce5218a")}</span>
                  </div>
                  <div className="text-xs font-mono font-medium text-slate-800 dark:text-gray-200 truncate">
                    {t("message.58ed7bc5aa9d", { v0: configuredModels.length })}
                  </div>
                </div>
              </div>

              {/* 概览中的已配置模型快捷标签 */}
              {configuredModels.length > 0 && (
                <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-1.5">
                      <Layers size={13} className="text-emerald-500" />
                      {t("ui.96fc25bab01d")}
                      {configuredModels.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        handleAddNewModel();
                        goToStep(2);
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/20 transition-colors cursor-pointer"
                    >
                      <Plus size={11} />
                      <span>{t("ui.9633e735da9b")}</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto">
                    {configuredModels.map((item) => {
                      const isSelected =
                        item.id.trim().toLowerCase() ===
                        model.trim().toLowerCase();
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            applyModelConfig(item);
                            goToStep(2);
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                            isSelected
                              ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                              : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20"
                          }`}
                          title={t("ui.7a8815b6f6b9", { v0: item.id })}
                        >
                          <span>{item.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-white/[0.03] dark:border-white/5 text-xs text-slate-500 dark:text-gray-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="leading-relaxed">
                    {t("ui.a80ab3fcfcdb")}{" "}
                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                      {configuredModels.length}
                    </strong>{" "}
                    {t("ui.e736bee663f8")}
                  </span>
                </div>
              </div>
            </SpotlightCard>

            {/* 实时通道分组健康监控面板（概览模式直接呈现） */}
            <ChannelGroupMonitor
              toolName="WorkBuddy"
              toolId="workbuddy"
              accentColor="emerald"
            />
          </div>
        ) : (
          /* ── 步骤化引导视图 ── */
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
              {currentStep === 0 && (
                <SpotlightCard
                  className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
                  spotlightColor="rgba(16, 185, 129, 0.12)"
                >
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                      <Server size={14} className="text-emerald-500" />
                      {t("ui.7f63cd1d81db")}
                    </Label>
                    <span className="text-[11px] text-slate-400 dark:text-gray-500">
                      {t("message.258702ee60a5", { v0: TOTAL_STEPS })}
                    </span>
                  </div>
                  <NodeCardSelector
                    value={url}
                    onChange={setUrl}
                    accentColor="emerald"
                  />
                  <p className="mt-3 text-[11px] text-slate-500 dark:text-gray-400">
                    {t("ui.44664cda315f")}
                  </p>
                </SpotlightCard>
              )}

              {currentStep === 1 && (
                <SpotlightCard
                  className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
                  spotlightColor="rgba(16, 185, 129, 0.12)"
                >
                  <ApiKeyInput
                    title="OpenAI API Key"
                    badgeText="models.json"
                    value={apiKey}
                    onChange={setApiKey}
                    placeholder={t("ui.62535cc7a802")}
                    storageLocation="~/.workbuddy/models.json"
                    hintText={t("ui.6b2cbcd827a5")}
                    accentColor="emerald"
                    toolName="WorkBuddy"
                    toolId="workbuddy"
                    onBoundTokenChange={onBoundTokenChange}
                  />
                </SpotlightCard>
              )}

              {currentStep === 2 && (
                <SpotlightCard
                  className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm space-y-4"
                  spotlightColor="rgba(16, 185, 129, 0.12)"
                >
                  {/* 已配置模型标签组与切换 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                        <Layers size={14} className="text-emerald-500" />
                        {t("ui.96fc25bab01d")}
                        {configuredModels.length})
                      </Label>
                      <button
                        type="button"
                        onClick={handleAddNewModel}
                        className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-md transition-colors cursor-pointer"
                        title={t("ui.c09b9fbe72ed")}
                      >
                        <Plus size={12} />
                        <span>{t("ui.9633e735da9b")}</span>
                      </button>
                    </div>

                    {configuredModels.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200/70 dark:border-white/5 max-h-[110px] overflow-y-auto">
                        {configuredModels.map((item) => {
                          const isSelected =
                            item.id.trim().toLowerCase() ===
                            model.trim().toLowerCase();
                          const isDeleting = deletingModelId === item.id;
                          return (
                            <div
                              key={item.id}
                              onClick={() => applyModelConfig(item)}
                              className={`group relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-pointer border transition-all ${
                                isSelected
                                  ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-800 dark:text-emerald-300 font-semibold shadow-xs"
                                  : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20"
                              }`}
                              title={t("ui.72f4a6b0e7d8", { v0: item.id })}
                            >
                              <span className="truncate max-w-[140px] font-mono">
                                {item.id}
                              </span>

                              <button
                                type="button"
                                onClick={(e) =>
                                  void handleDeleteModel(e, item.id)
                                }
                                disabled={isDeleting}
                                className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-opacity p-0.5 rounded ml-0.5"
                                title={t("ui.62851274ffca", { v0: item.id })}
                              >
                                {isDeleting ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Trash2 size={11} />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 dark:text-gray-500 py-1 italic">
                        {t("ui.056287b5b64a")}
                      </div>
                    )}
                  </div>

                  {/* 当前目标模型输入与选择 */}
                  <div className="pt-2 border-t border-slate-100 dark:border-white/5">
                    <ModelInput
                      value={model}
                      onChange={setModel}
                      models={models}
                      placeholder={t("ui.14137bf16ba7")}
                      id="workbuddy-models"
                      onRefresh={() => void refreshModels()}
                      refreshing={refreshingModels}
                      accentColor="emerald"
                    />

                    {/* 动态模式指示条 */}
                    <div className="mt-2.5">
                      {isExistingModel ? (
                        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs">
                          <Info size={13} className="flex-shrink-0" />
                          <span>{t("ui.b6f735043876")}</span>
                        </div>
                      ) : model.trim() ? (
                        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs">
                          <Sparkles size={13} className="flex-shrink-0" />
                          <span>{t("ui.d447eb0e8342")}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </SpotlightCard>
              )}

              {currentStep === 3 && (
                <div className="space-y-4">
                  {/* 可快速跳过提示横幅 */}
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5 text-xs text-slate-500 dark:text-gray-400">
                    <Info
                      size={14}
                      className="flex-shrink-0 mt-0.5 text-emerald-500"
                    />
                    <span>{t("ui.ebf15ff269d4")}</span>
                  </div>

                  {/* 特性开关卡片 */}
                  <SpotlightCard
                    className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
                    spotlightColor="rgba(16, 185, 129, 0.12)"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                        <Cpu size={14} className="text-emerald-500" />
                        {t("ui.ab913dd48c4b")}
                      </Label>
                      <span className="text-[11px] text-slate-400 dark:text-gray-500">
                        {t("ui.356246684fe5")}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={supportsToolCall}
                          onChange={(e) =>
                            setSupportsToolCall(e.target.checked)
                          }
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-white/20 dark:bg-white/5"
                        />
                        <span className="text-xs text-slate-700 dark:text-gray-300 select-none">
                          {t("ui.3d4d1075e7f1")}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={supportsImages}
                          onChange={(e) => setSupportsImages(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-white/20 dark:bg-white/5"
                        />
                        <span className="text-xs text-slate-700 dark:text-gray-300 select-none">
                          {t("ui.d9f6094cf1c9")}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={supportsReasoning}
                          onChange={(e) =>
                            setSupportsReasoning(e.target.checked)
                          }
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-white/20 dark:bg-white/5"
                        />
                        <span className="text-xs text-slate-700 dark:text-gray-300 select-none">
                          {t("ui.2daaba943843")}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={onlyReasoning}
                          onChange={(e) => setOnlyReasoning(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-white/20 dark:bg-white/5"
                        />
                        <span className="text-xs text-slate-700 dark:text-gray-300 select-none">
                          {t("ui.e5b914351adf")}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors">
                        <input
                          type="checkbox"
                          checked={canDisableThinking}
                          onChange={(e) =>
                            setCanDisableThinking(e.target.checked)
                          }
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-white/20 dark:bg-white/5"
                        />
                        <span className="text-xs text-slate-700 dark:text-gray-300 select-none">
                          {t("ui.0bdec28430f2")}
                        </span>
                      </label>

                      <label
                        className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors"
                        title={t("ui.6711dd850bea")}
                      >
                        <input
                          type="checkbox"
                          checked={useCustomProtocol}
                          onChange={(e) =>
                            setUseCustomProtocol(e.target.checked)
                          }
                          className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-white/20 dark:bg-white/5"
                        />
                        <span className="text-xs text-slate-700 dark:text-gray-300 select-none flex items-center gap-1">
                          {t("ui.8a2804b885a8")}
                          <HelpCircle size={11} className="text-slate-400" />
                        </span>
                      </label>
                    </div>
                  </SpotlightCard>

                  {/* 思考强度与 Token 限制卡片 */}
                  <SpotlightCard
                    className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
                    spotlightColor="rgba(16, 185, 129, 0.12)"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                          <Sliders size={14} className="text-emerald-500" />
                          {t("ui.b0ebc95c6423")}
                        </Label>
                        <span className="text-[11px] text-slate-400 dark:text-gray-500">
                          Reasoning & Tokens
                        </span>
                      </div>

                      {/* 默认思考强度与支持档位 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                            {t("ui.d6bfbfaad2f8")}
                          </span>
                          <select
                            value={defaultEffort}
                            onChange={(e) => setDefaultEffort(e.target.value)}
                            className="text-xs bg-slate-50 dark:bg-[#181b2a] border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">{t("ui.f7bcfe65dc14")}</option>
                            <option value="low">{t("ui.ba6c89bce64b")}</option>
                            <option value="medium">
                              {t("ui.086530f8f62c")}
                            </option>
                            <option value="high">{t("ui.82a0806da831")}</option>
                            <option value="xhigh">
                              {t("ui.614360fc8613")}
                            </option>
                            <option value="max">{t("ui.b5996c1867e9")}</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-500 dark:text-gray-400">
                            {t("ui.4ee2a0195d31")}
                          </span>
                          <div className="flex flex-wrap gap-2 pt-0.5">
                            {EFFORT_OPTIONS.map((item) => {
                              const checked = supportedEfforts.includes(
                                item.id,
                              );
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => toggleEffort(item.id)}
                                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                                    checked
                                      ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300 font-medium"
                                      : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:border-slate-300 dark:hover:border-white/20"
                                  }`}
                                >
                                  <span
                                    className={`w-3 h-3 rounded flex items-center justify-center border text-[9px] ${
                                      checked
                                        ? "bg-emerald-500 border-emerald-600 text-white"
                                        : "border-slate-300 dark:border-white/20"
                                    }`}
                                  >
                                    {checked ? "✓" : ""}
                                  </span>
                                  <span>{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* 输入/输出 Token 限制网格 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-white/5">
                        <div className="space-y-1.5">
                          <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                            {t("ui.14adc2cff8ec")}
                          </span>
                          <input
                            type="number"
                            value={maxInputTokens}
                            onChange={(e) =>
                              setMaxInputTokens(
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                              )
                            }
                            placeholder={t("ui.b3be3846dab5")}
                            className="w-full text-xs font-mono bg-slate-50 dark:bg-[#181b2a] border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <div className="flex gap-1">
                            {INPUT_TOKEN_PRESETS.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => setMaxInputTokens(p.value)}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                  maxInputTokens === p.value
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                                    : "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400"
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-xs font-medium text-slate-700 dark:text-gray-300">
                            {t("ui.26efcc94b6a9")}
                          </span>
                          <input
                            type="number"
                            value={maxOutputTokens}
                            onChange={(e) =>
                              setMaxOutputTokens(
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                              )
                            }
                            placeholder={t("ui.b3be3846dab5")}
                            className="w-full text-xs font-mono bg-slate-50 dark:bg-[#181b2a] border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <div className="flex gap-1">
                            {OUTPUT_TOKEN_PRESETS.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => setMaxOutputTokens(p.value)}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                  maxOutputTokens === p.value
                                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                                    : "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-gray-400"
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </SpotlightCard>
                </div>
              )}

              {currentStep === 4 && (
                <ConfigConfirmStep
                  accentColor="emerald"
                  spotlightColor="rgba(16, 185, 129, 0.12)"
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
                      label: t("ui.e91bf63444bf"),
                      value: model || t("ui.63595e95b708"),
                      icon: <Cpu size={14} />,
                      stepIndex: 2,
                    },
                    {
                      label: t("ui.defb671513e8"),
                      value: advancedSummary,
                      detail: [
                        t("ui.3d6272b71692", {
                          v0: maxInputTokens || t("ui.c8d09cf955f5"),
                          v1: maxOutputTokens || t("ui.c8d09cf955f5"),
                        }),
                        defaultEffort
                          ? t("ui.d225bed7c9ac", { v0: defaultEffort })
                          : null,
                        useCustomProtocol ? t("ui.8a2804b885a8") : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      icon: <Sliders size={14} />,
                      stepIndex: 3,
                    },
                  ]}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* ── 底部操作栏 (苹果风毛玻璃悬浮 Dock 栏) ── */}
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
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{t("ui.17e2d423579b")}</span>
              </div>
            </div>

            {/* 右侧：主保存操作 */}
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={testModalOpen}
                className="flex items-center justify-center gap-2 px-6 py-2.5 min-h-9 max-w-full min-w-[210px] rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExistingModel ? <Save size={14} /> : <Plus size={14} />}
                <span>
                  {isExistingModel
                    ? t("ui.8608619c419d", { v0: model })
                    : t("ui.7169462d6149", {
                        v0: model.trim() || t("ui.fd9949d72e07"),
                      })}
                </span>
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
                  onClick={handlePrev}
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
                  onClick={handleNext}
                  className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-colors shadow-xs cursor-pointer"
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
                    "flex items-center justify-center gap-1.5 px-6 py-2 min-w-[210px] rounded-xl text-xs font-semibold text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                    configConfirmed
                      ? "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
                      : "bg-emerald-600/80 hover:bg-emerald-600",
                  )}
                >
                  {isExistingModel ? <Save size={14} /> : <Plus size={14} />}
                  <span>
                    {isExistingModel
                      ? t("ui.6d6ec72c20ca", { v0: model })
                      : t("ui.57b39fb0e864", {
                          v0: model.trim() || t("ui.fd9949d72e07"),
                        })}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <TerminalTestModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        type="workbuddy"
        url={url}
        apiKey={apiKey}
        model={model}
        workbuddyPayload={currentPayload}
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

export default WorkbuddyPanel;
