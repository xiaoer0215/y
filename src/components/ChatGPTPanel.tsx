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
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  KeyRound,
  Cpu,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OpenAIIcon } from "./BrandIcons";
import { fetchCodexModels, getCodexConfig } from "../lib/api";
import { ConfigPathBar } from "./ConfigPathBar";
import { NodeCardSelector } from "./NodeCardSelector";
import { ApiKeyInput } from "./ApiKeyInput";
import { ChannelGroupMonitor } from "./ChannelGroupMonitor";
import { ModelInput } from "./ModelInput";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";
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

const TOTAL_STEPS = 4;

export function ChatGPTPanel() {
  useLocale();
  const [url, setUrl] = useApiEndpointState();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [configExists, setConfigExists] = useState(false);
  const [configPath, setConfigPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [testModalOpen, setTestModalOpen] = useState(false);

  // ── 步骤化导航状态 ──
  const [currentStep, setCurrentStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [configConfirmed, setConfigConfirmed] = useState(false);

  const { models, refreshingModels, refreshModels } = useModelFetch(
    url,
    apiKey,
    fetchCodexModels,
  );
  const { group: apiKeyGroup, onBoundTokenChange } = useBoundTokenGroup(
    "chatgpt",
    apiKey,
  );

  const load = async () => {
    setLoading(true);
    try {
      const cfg = await getCodexConfig();
      const loadedUrl = cfg.base_url?.trim();
      if (loadedUrl) {
        setUrl(loadedUrl);
      } else {
        setUrl("");
      }
      setApiKey(cfg.api_key || "");
      setModel(cfg.model || "");
      setConfigExists(cfg.config_exists);
      setConfigPath(cfg.config_path);

      if (cfg.config_exists) {
        setShowSummary(true);
        setMaxStepReached(TOTAL_STEPS - 1);
      }
    } catch (e) {
      toast.error(t("ui.47744b9386c3", { v0: e }));
    } finally {
      setLoading(false);
    }
  };

  useConfigReload("codex", load);
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setConfigConfirmed(false);
  }, [url, apiKey, model]);

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

  const handleNext = () => {
    if (currentStep === 1 && !apiKey.trim()) {
      toast.warning(t("ui.99a3ab7c4480"));
      return;
    }
    if (currentStep === 2 && !model.trim()) {
      toast.warning(t("ui.362d5a86e453"));
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
      label: t("ui.6d9a386c6586"),
      summary: configConfirmed ? t("ui.d9fea67ad2be") : undefined,
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[300px] gap-3">
        <Loader2 className="animate-spin text-blue-500" size={36} />
        <span className="text-xs text-slate-500 dark:text-gray-400 animate-pulse">
          {t("ui.eec298e8d729")}
        </span>
      </div>
    );
  }

  return (
    <div className="tool-config-panel w-full flex flex-col gap-6 pb-4">
      {/* ── 顶部面板标题栏 ── */}
      <div className="tool-panel-header flex flex-col gap-4 pb-5 border-b border-slate-200/80 dark:border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30 flex items-center justify-center flex-shrink-0 shadow-xs">
            <OpenAIIcon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                {t("ui.c56a9c2badeb")}
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30">
                OpenAI Protocol
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {t("ui.a072d2ca5e96")}
            </p>
          </div>
        </div>

        <div className="self-start md:self-auto flex flex-wrap items-center gap-2">
          {showSummary && (
            <button
              type="button"
              onClick={() => goToStep(0)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:border-blue-500/30 dark:text-blue-300 shadow-2xs cursor-pointer"
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
          {showSummary && <WorkspaceActions agent="codex" />}
          <ConfigPathBar
            path={configPath}
            shortPath="~/.codex/config.toml"
            exists={configExists}
            accentColor="blue"
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
            accentColor="blue"
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
              spotlightColor="rgba(59, 130, 246, 0.12)"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("ui.2f8f89f2092a")}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-500/20">
                  {t("ui.f2afde8960a6")}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5">
                  <div className="flex items-center gap-1.5 text-slate-400 dark:text-gray-500 text-[11px] mb-1">
                    <Server size={13} className="text-blue-500" />
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
                    <KeyRound size={13} className="text-blue-500 shrink-0" />
                    <span>{t("ui.309dd9bf415f")}</span>
                  </div>
                  {apiKeyGroup ? (
                    <div className="mb-1 min-w-0">
                      <span
                        className="inline-block max-w-full px-1.5 py-0.5 rounded-md border text-[10px] font-medium leading-snug break-words bg-blue-50 text-blue-600 border-blue-200/80 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25"
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
                    <Cpu size={13} className="text-blue-500" />
                    <span>{t("ui.d32ee83a42bf")}</span>
                  </div>
                  <div className="text-xs font-mono font-medium text-blue-600 dark:text-blue-400 truncate">
                    {model || t("ui.63595e95b708")}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-white/[0.03] dark:border-white/5 text-xs text-slate-500 dark:text-gray-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="leading-relaxed">
                    {t("ui.a96c67cef013")}
                  </span>
                </div>
              </div>
            </SpotlightCard>

            {/* 实时通道分组健康监控面板（概览模式直接呈现） */}
            <ChannelGroupMonitor
              toolName="ChatGPT (Codex)"
              toolId="chatgpt"
              accentColor="blue"
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
                  spotlightColor="rgba(59, 130, 246, 0.12)"
                >
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <Label className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-2">
                      <Server size={14} className="text-blue-500" />
                      {t("ui.7f63cd1d81db")}
                    </Label>
                    <span className="text-[11px] text-slate-400 dark:text-gray-500">
                      {t("message.258702ee60a5", { v0: TOTAL_STEPS })}
                    </span>
                  </div>
                  <NodeCardSelector
                    value={url}
                    onChange={setUrl}
                    accentColor="blue"
                  />
                  <p className="mt-3 text-[11px] text-slate-500 dark:text-gray-400">
                    {t("ui.add04100ad06")}
                  </p>
                </SpotlightCard>
              )}

              {currentStep === 1 && (
                <SpotlightCard
                  className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
                  spotlightColor="rgba(59, 130, 246, 0.12)"
                >
                  <ApiKeyInput
                    title="OpenAI API Key"
                    badgeText={t("ui.8da07705aba6")}
                    value={apiKey}
                    onChange={setApiKey}
                    placeholder={t("ui.3344038c0765")}
                    envVarName="CUSTOM_OPENAI_API_KEY"
                    accentColor="blue"
                    toolName="ChatGPT (Codex)"
                    toolId="chatgpt"
                    onBoundTokenChange={onBoundTokenChange}
                  />
                </SpotlightCard>
              )}

              {currentStep === 2 && (
                <SpotlightCard
                  className="p-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-[#121524]/60 shadow-sm"
                  spotlightColor="rgba(59, 130, 246, 0.12)"
                >
                  <ModelInput
                    value={model}
                    onChange={setModel}
                    models={models}
                    placeholder={t("ui.58d050403bbf")}
                    id="codex-models"
                    onRefresh={() => void refreshModels()}
                    refreshing={refreshingModels}
                    accentColor="blue"
                  />

                  <div className="mt-4 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                    <Sparkles size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{t("ui.dfe1f98a0bdd")}</span>
                  </div>
                </SpotlightCard>
              )}

              {currentStep === 3 && (
                <ConfigConfirmStep
                  accentColor="blue"
                  spotlightColor="rgba(59, 130, 246, 0.12)"
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
                <span>{t("ui.d515ef82750e")}</span>
              </div>
            </div>

            {/* 右侧：主保存操作 */}
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={testModalOpen}
                className="flex items-center justify-center gap-2 px-6 py-2.5 min-h-9 max-w-full min-w-[190px] rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={14} />
                <span>{t("ui.4fefa113e582")}</span>
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
                  className="flex items-center gap-1.5 px-6 py-2 rounded-xl text-xs font-medium bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-colors shadow-xs cursor-pointer"
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
                      ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                      : "bg-blue-600/80 hover:bg-blue-600",
                  )}
                >
                  <Save size={14} />
                  <span>{t("ui.a3a33f2e4758")}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <TerminalTestModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        type="codex"
        url={url}
        apiKey={apiKey}
        model={model}
        onSuccess={() => {
          setConfigExists(true);
          setShowSummary(true);
          setMaxStepReached(TOTAL_STEPS - 1);
          setConfigConfirmed(false);
        }}
      />
    </div>
  );
}

export default ChatGPTPanel;
