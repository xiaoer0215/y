import { BRAND } from "../lib/brand";
import {
  configuredEndpoint,
  parseApiEndpoints,
  useApiEndpointState,
  useSiteContent,
} from "../lib/site-content";
import { t, useLocale } from "../lib/i18n";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  FolderCheck,
  FileCode,
  Key,
  Eye,
  EyeOff,
  Cpu,
  Globe,
  RefreshCw,
  Edit3,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Save,
  Power,
  Terminal,
  Activity,
  Scan,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
} from "lucide-react";
import {
  OpenAIIcon,
  ClaudeIcon,
  WorkbuddyIcon,
  AccioWorkIcon,
} from "./BrandIcons";
import { ApiKeyInput } from "./ApiKeyInput";
import { NodeCardSelector } from "./NodeCardSelector";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { exit } from "@tauri-apps/plugin-process";
import {
  checkBobApiNetwork,
  getCodexConfig,
  getClaudeConfig,
  getWorkbuddyConfig,
  getAccioConfig,
  setCodexConfig,
  setClaudeConfig,
  setWorkbuddyConfig,
  setAccioConfig,
  openConfigFile,
} from "../lib/api";
import type {
  AgentConfig,
  NetworkStatus,
  StepStatus,
  WorkbuddyUIConfig,
  AccioConfig,
} from "../types";
import { cn } from "../lib/utils";
import { ButtonToLoaderToSuccess } from "./ui/ButtonToLoaderToSuccess";

interface InitializationModalProps {
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
}

interface StepConfigData {
  codex: AgentConfig | null;
  claude: AgentConfig | null;
  workbuddy: WorkbuddyUIConfig | null;
  accio: AccioConfig | null;
}

interface ScanLogItem {
  id: string;
  time: string;
  tag: string;
  text: string;
  type: "info" | "scan" | "match" | "success" | "warn" | "error";
}

type CheckpointStatus = "pending" | "scanning" | "done" | "error";

export function InitializationModal({
  open,
  onClose,
  onFinish,
}: InitializationModalProps) {
  useLocale();
  const site = useSiteContent();
  const resolveEndpoint = (value?: string) =>
    configuredEndpoint(value, parseApiEndpoints(site?.api_endpoints));
  // ── 步骤状态 ──
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [step1Status, setStep1Status] = useState<StepStatus>("pending");
  const [step2Status, setStep2Status] = useState<StepStatus>("pending");
  const [step3Status, setStep3Status] = useState<StepStatus>("pending");
  const [step4Status, setStep4Status] = useState<StepStatus>("pending");

  // ── 动态扫描微进度与状态 ──
  const [stepSubProgress, setStepSubProgress] = useState<number>(0);
  const [stepSubPhaseText, setStepSubPhaseText] = useState<string>("");
  const [scanLogs, setScanLogs] = useState<ScanLogItem[]>([]);
  const [checkpoints, setCheckpoints] = useState<
    Record<string, CheckpointStatus>
  >({});

  // ── 环节数据 ──
  const [networkData, setNetworkData] = useState<NetworkStatus | null>(null);
  const [networkError, setNetworkError] = useState<string>("");

  const [pathError, setPathError] = useState<string>("");
  const [configData, setConfigData] = useState<StepConfigData>({
    codex: null,
    claude: null,
    workbuddy: null,
    accio: null,
  });
  const [parseError, setParseError] = useState<string>("");

  // ── 环节 3 & 4 展示控制 ──
  const [activeConfigTab, setActiveConfigTab] = useState<
    "chatgpt" | "claude" | "workbuddy" | "acciowork"
  >("chatgpt");
  const [showCodexKey, setShowCodexKey] = useState<boolean>(false);
  const [showClaudeKey, setShowClaudeKey] = useState<boolean>(false);
  const [showWorkbuddyKey, setShowWorkbuddyKey] = useState<boolean>(false);
  const [showAccioKey, setShowAccioKey] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string>("");

  // ── 环节 4 确认与快速修改模式 ──
  const [confirmationDecision, setConfirmationDecision] = useState<
    "none" | "confirmed" | "editing"
  >("none");
  const [editTab, setEditTab] = useState<
    "chatgpt" | "claude" | "workbuddy" | "acciowork"
  >("chatgpt");
  const [editUrl, setEditUrl] = useApiEndpointState();
  const [editApiKey, setEditApiKey] = useState<string>("");
  const [editModel, setEditModel] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const isRunningRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  // ── 添加实时扫描日志 ──
  const addLog = useCallback(
    (tag: string, text: string, type: ScanLogItem["type"] = "info") => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setScanLogs((prev) => [
        ...prev.slice(-40),
        { id, time: timeStr, tag, text, type },
      ]);
    },
    [],
  );

  // ── 可随时取消的精细延迟函数 ──
  const delay = useCallback((ms: number) => {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        resolve(!isCancelledRef.current);
      }, ms);
    });
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(t("ui.fb7e488694ff", { v0: label }));
    setTimeout(() => setCopiedKey(""), 2000);
  };

  // ── 环节 1: 本机网络适配器与目标服务连通性探测 (约 2.8s) ──
  const runStep1 = useCallback(async (): Promise<boolean> => {
    setCurrentStep(1);
    setStep1Status("running");
    setNetworkError("");
    setNetworkData(null);
    setStepSubProgress(10);
    setStepSubPhaseText(t("ui.f544113fff57"));
    setCheckpoints({
      dns_gateway: "scanning",
      proxy_tls: "pending",
      endpoint_ping: "pending",
      latency_eval: "pending",
    });
    addLog("NET:INIT", t("ui.d60740467e64"), "scan");

    if (!(await delay(700))) return false;
    setCheckpoints((prev) => ({
      ...prev,
      dns_gateway: "done",
      proxy_tls: "scanning",
    }));
    setStepSubProgress(35);
    setStepSubPhaseText(t("ui.f9557cb5acb4"));
    addLog("NET:TLS", t("ui.d2c23dbf07be"), "info");

    if (!(await delay(750))) return false;
    setCheckpoints((prev) => ({
      ...prev,
      proxy_tls: "done",
      endpoint_ping: "scanning",
    }));
    setStepSubProgress(65);
    setStepSubPhaseText(t("ui.286b12415be9"));
    addLog("NET:PROBE", t("ui.ba9b0118c26e"), "scan");

    let status: NetworkStatus;
    try {
      status = await checkBobApiNetwork();
      setNetworkData(status);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep1Status("error");
      setNetworkError(t("ui.fadc5543f4d7", { v0: msg }));
      setCheckpoints((prev) => ({ ...prev, endpoint_ping: "error" }));
      addLog("NET:ERR", t("ui.fadc5543f4d7", { v0: msg }), "error");
      return false;
    }

    if (!(await delay(650))) return false;

    if (!status.reachable) {
      setStep1Status("error");
      setNetworkError(status.error_message || t("ui.6a9ad563f2ba"));
      setCheckpoints((prev) => ({ ...prev, endpoint_ping: "error" }));
      addLog("NET:FAIL", status.error_message || t("ui.7166c59aaacb"), "error");
      return false;
    }

    setCheckpoints((prev) => ({
      ...prev,
      endpoint_ping: "done",
      latency_eval: "scanning",
    }));
    setStepSubProgress(90);
    setStepSubPhaseText(t("ui.0fc3b70232bd"));
    addLog(
      "NET:OK",
      t("ui.e930e9c9d07d", {
        v0: status.status_code ?? 200,
        v1: status.latency_ms ?? 0,
      }),
      "success",
    );

    if (!(await delay(700))) return false;
    setCheckpoints((prev) => ({ ...prev, latency_eval: "done" }));
    setStepSubProgress(100);
    setStepSubPhaseText(t("ui.f56fad312e6c"));
    setStep1Status("success");
    addLog("NET:DONE", t("ui.7e76f2f68b03"), "match");

    await delay(500);
    return true;
  }, [addLog, delay]);

  // ── 环节 2: 本机环境与 Agent 配置文件深度扫描 (约 4.5s，凸显扫描本机效果) ──
  const runStep2 = useCallback(async (): Promise<boolean> => {
    setCurrentStep(2);
    setStep2Status("running");
    setPathError("");
    setStepSubProgress(8);
    setStepSubPhaseText(t("ui.41282427c95c"));
    setCheckpoints({
      env_profile: "scanning",
      scan_codex: "pending",
      scan_claude: "pending",
      scan_workbuddy: "pending",
      scan_accio: "pending",
      acl_verify: "pending",
    });
    addLog("HOST:SCAN", t("ui.d00d965dc30d"), "scan");

    if (!(await delay(800))) return false;
    setCheckpoints((prev) => ({
      ...prev,
      env_profile: "done",
      scan_codex: "scanning",
    }));
    setStepSubProgress(20);
    setStepSubPhaseText(t("ui.094b6f3d003e"));
    addLog("FS:CODEX", t("ui.ff115a5521d8"), "scan");

    if (!(await delay(800))) return false;
    setStepSubProgress(38);
    setStepSubPhaseText(t("ui.8732959ea999"));

    let codex: AgentConfig;
    try {
      codex = await getCodexConfig();
      setConfigData((prev) => ({ ...prev, codex }));
    } catch (e) {
      const msg = t("ui.01d2b10c4a21", { v0: e });
      setStep2Status("error");
      setPathError(msg);
      setCheckpoints((prev) => ({ ...prev, scan_codex: "error" }));
      addLog("FS:ERR", msg, "error");
      return false;
    }

    if (codex.is_installed) {
      addLog(
        "FS:CODEX",
        t("ui.eb8b075ade3c", {
          v0: codex.app_path || t("ui.eb88ff57c977"),
          v1: codex.config_exists ? t("ui.f2afde8960a6") : t("ui.a4dfe0d6a0d9"),
        }),
        "match",
      );
      setCheckpoints((prev) => ({
        ...prev,
        scan_codex: "done",
        scan_claude: "scanning",
      }));
    } else {
      addLog("FS:CODEX", t("ui.c7bf92ea2ba5"), "warn");
      setCheckpoints((prev) => ({
        ...prev,
        scan_codex: "error",
        scan_claude: "scanning",
      }));
    }

    if (!(await delay(800))) return false;
    setStepSubProgress(50);
    setStepSubPhaseText(t("ui.605bd3faea6f"));
    addLog("FS:CLAUDE", t("ui.48c77cf1e848"), "scan");

    if (!(await delay(800))) return false;
    setStepSubProgress(65);
    setStepSubPhaseText(t("ui.8e17b9d92c16"));

    let claude: AgentConfig;
    try {
      claude = await getClaudeConfig();
      setConfigData((prev) => ({ ...prev, claude }));
    } catch (e) {
      const msg = t("ui.befcc9c74d93", { v0: e });
      setStep2Status("error");
      setPathError(msg);
      setCheckpoints((prev) => ({ ...prev, scan_claude: "error" }));
      addLog("FS:ERR", msg, "error");
      return false;
    }

    if (claude.is_installed) {
      addLog(
        "FS:CLAUDE",
        t("ui.a536d178b498", {
          v0: claude.app_path || t("ui.eb88ff57c977"),
          v1: claude.config_exists
            ? t("ui.f2afde8960a6")
            : t("ui.a4dfe0d6a0d9"),
        }),
        "match",
      );
      setCheckpoints((prev) => ({
        ...prev,
        scan_claude: "done",
        scan_workbuddy: "scanning",
      }));
    } else {
      addLog("FS:CLAUDE", t("ui.4457f2fdbae8"), "warn");
      setCheckpoints((prev) => ({
        ...prev,
        scan_claude: "error",
        scan_workbuddy: "scanning",
      }));
    }

    if (!(await delay(800))) return false;
    setStepSubProgress(75);
    setStepSubPhaseText(t("ui.0e56e166a9cc"));
    addLog("FS:WORKBUDDY", t("ui.57086e703601"), "scan");

    let workbuddy: WorkbuddyUIConfig;
    try {
      workbuddy = await getWorkbuddyConfig();
      setConfigData((prev) => ({ ...prev, workbuddy }));
    } catch (e) {
      const msg = t("ui.ba67052e6103", { v0: e });
      setStep2Status("error");
      setPathError(msg);
      setCheckpoints((prev) => ({ ...prev, scan_workbuddy: "error" }));
      addLog("FS:ERR", msg, "error");
      return false;
    }

    if (workbuddy.is_installed) {
      addLog(
        "FS:WORKBUDDY",
        t("ui.68133d0cbdcb", {
          v0: workbuddy.app_path || t("ui.eb88ff57c977"),
          v1: workbuddy.config_exists
            ? t("ui.f2afde8960a6")
            : t("ui.a4dfe0d6a0d9"),
        }),
        "match",
      );
      setCheckpoints((prev) => ({
        ...prev,
        scan_workbuddy: "done",
        scan_accio: "scanning",
      }));
    } else {
      addLog("FS:WORKBUDDY", t("ui.a3729fca303c"), "warn");
      setCheckpoints((prev) => ({
        ...prev,
        scan_workbuddy: "error",
        scan_accio: "scanning",
      }));
    }

    if (!(await delay(800))) return false;
    setStepSubProgress(86);
    setStepSubPhaseText(t("ui.e94cf07f2f2c"));
    addLog("FS:ACCIO", t("ui.ce575e953955"), "scan");

    let accio: AccioConfig;
    try {
      accio = await getAccioConfig();
      setConfigData((prev) => ({ ...prev, accio }));
    } catch (e) {
      const msg = t("ui.f7c8a55d868b", { v0: e });
      setStep2Status("error");
      setPathError(msg);
      setCheckpoints((prev) => ({ ...prev, scan_accio: "error" }));
      addLog("FS:ERR", msg, "error");
      return false;
    }

    if (accio.is_installed) {
      addLog(
        "FS:ACCIO",
        t("ui.e4d8b7f06370", {
          v0: accio.app_path || t("ui.eb88ff57c977"),
          v1: accio.config_exists ? t("ui.f2afde8960a6") : t("ui.a4dfe0d6a0d9"),
        }),
        "match",
      );
      setCheckpoints((prev) => ({
        ...prev,
        scan_accio: "done",
        acl_verify: "scanning",
      }));
    } else {
      addLog("FS:ACCIO", t("ui.76f0248c4590"), "warn");
      setCheckpoints((prev) => ({
        ...prev,
        scan_accio: "error",
        acl_verify: "scanning",
      }));
    }

    const anyInstalled =
      codex.is_installed ||
      claude.is_installed ||
      workbuddy.is_installed ||
      accio.is_installed;
    if (!anyInstalled) {
      setStep2Status("error");
      setPathError(t("ui.30742e73d363"));
      setCheckpoints((prev) => ({ ...prev, acl_verify: "error" }));
      addLog("FS:ERR", t("ui.0aabcf60cb79"), "error");
      return false;
    }

    if (!(await delay(700))) return false;
    setStepSubProgress(95);
    setStepSubPhaseText(t("ui.91fe427ab2a2"));
    addLog("SECURITY", t("ui.3126919136e9"), "info");

    if (!(await delay(600))) return false;
    setCheckpoints((prev) => ({ ...prev, acl_verify: "done" }));
    setStepSubProgress(100);
    setStepSubPhaseText(t("ui.7f8ea4abb119"));
    setStep2Status("success");
    const count =
      (codex.is_installed ? 1 : 0) +
      (claude.is_installed ? 1 : 0) +
      (workbuddy.is_installed ? 1 : 0) +
      (accio.is_installed ? 1 : 0);
    addLog("HOST:DONE", t("ui.19f76b81cda6", { v0: count }), "success");

    // 默认展示已安装的 tab
    if (codex.is_installed) {
      setActiveConfigTab("chatgpt");
      setEditTab("chatgpt");
    } else if (claude.is_installed) {
      setActiveConfigTab("claude");
      setEditTab("claude");
    } else if (workbuddy.is_installed) {
      setActiveConfigTab("workbuddy");
      setEditTab("workbuddy");
    } else if (accio.is_installed) {
      setActiveConfigTab("acciowork");
      setEditTab("acciowork");
    }

    await delay(500);
    return true;
  }, [addLog, delay]);

  // ── 环节 3: 核心配置结构化解析与安全校验 (约 2.8s) ──
  const runStep3 = useCallback(async (): Promise<boolean> => {
    setCurrentStep(3);
    setStep3Status("running");
    setParseError("");
    setStepSubProgress(12);
    setStepSubPhaseText(t("ui.36e35887c957"));
    setCheckpoints({
      load_binary: "scanning",
      parse_url: "pending",
      verify_key: "pending",
      map_model: "pending",
    });
    addLog("PARSE:INIT", t("ui.ff573b9aa462"), "scan");

    if (!(await delay(700))) return false;

    let codex: AgentConfig;
    let claude: AgentConfig;
    let workbuddy: WorkbuddyUIConfig;
    let accio: AccioConfig;
    try {
      [codex, claude, workbuddy, accio] = await Promise.all([
        getCodexConfig(),
        getClaudeConfig(),
        getWorkbuddyConfig(),
        getAccioConfig(),
      ]);
      setConfigData({ codex, claude, workbuddy, accio });
      if (activeConfigTab === "acciowork") {
        setEditUrl(resolveEndpoint(accio.base_url));
        setEditApiKey(accio.api_key || "");
        setEditModel(accio.model || "");
      } else if (activeConfigTab === "workbuddy") {
        setEditUrl(resolveEndpoint(workbuddy.base_url));
        setEditApiKey(workbuddy.api_key || "");
        setEditModel(workbuddy.model || "gpt-5.6-sol");
      } else if (activeConfigTab === "claude") {
        setEditUrl(resolveEndpoint(claude.base_url));
        setEditApiKey(claude.api_key || "");
        setEditModel(claude.model || "");
      } else {
        setEditUrl(resolveEndpoint(codex.base_url));
        setEditApiKey(codex.api_key || "");
        setEditModel(codex.model || "");
      }
    } catch (err) {
      setStep3Status("error");
      const msg = err instanceof Error ? err.message : String(err);
      setParseError(t("ui.be26b52473ad", { v0: msg }));
      setCheckpoints((prev) => ({ ...prev, load_binary: "error" }));
      addLog("PARSE:ERR", t("ui.be26b52473ad", { v0: msg }), "error");
      return false;
    }

    setCheckpoints((prev) => ({
      ...prev,
      load_binary: "done",
      parse_url: "scanning",
    }));
    setStepSubProgress(45);
    setStepSubPhaseText(t("ui.16797b018ad7"));
    addLog(
      "PARSE:URL",
      t("ui.3b5ff9b1d579", { v0: resolveEndpoint(codex.base_url) }),
      "info",
    );

    if (!(await delay(750))) return false;
    setCheckpoints((prev) => ({
      ...prev,
      parse_url: "done",
      verify_key: "scanning",
    }));
    setStepSubProgress(75);
    setStepSubPhaseText(t("ui.00547a1f3b4c"));
    addLog(
      "PARSE:KEY",
      t("ui.54e8ef91238e", {
        v0:
          codex.api_key || workbuddy.api_key || accio.api_key
            ? t("ui.911421abeff9")
            : t("ui.a3e7368ec053"),
      }),
      "info",
    );

    if (!(await delay(750))) return false;
    setCheckpoints((prev) => ({
      ...prev,
      verify_key: "done",
      map_model: "scanning",
    }));
    setStepSubProgress(95);
    setStepSubPhaseText(t("ui.eb37d6f3d979"));
    addLog(
      "PARSE:MODEL",
      t("ui.6f734e13f483", {
        v0: codex.model || t("ui.63595e95b708"),
        v1: claude.model || t("ui.63595e95b708"),
        v2: workbuddy.model || t("ui.63595e95b708"),
        v3: accio.model || t("ui.63595e95b708"),
      }),
      "match",
    );

    if (!(await delay(600))) return false;
    setCheckpoints((prev) => ({ ...prev, map_model: "done" }));
    setStepSubProgress(100);
    setStepSubPhaseText(t("ui.3d2303625ba3"));
    setStep3Status("success");
    addLog("PARSE:DONE", t("ui.f3f1af1cc9f9"), "success");

    await delay(500);
    return true;
  }, [addLog, delay]);

  // ── 环节 4: 配置信息确认环节 ──
  const runStep4 = useCallback(async (): Promise<boolean> => {
    setCurrentStep(4);
    setStep4Status("running");
    addLog("CONFIRM", t("ui.59ba6bb6c3c4"), "match");
    return true;
  }, [addLog]);

  // ── 顺序执行编排管线 ──
  const runPipeline = useCallback(
    async (fromStep = 1) => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      isCancelledRef.current = false;

      try {
        if (fromStep <= 1) {
          const s1Ok = await runStep1();
          if (!s1Ok || isCancelledRef.current) {
            return;
          }
        }

        if (fromStep <= 2) {
          const s2Ok = await runStep2();
          if (!s2Ok || isCancelledRef.current) {
            return;
          }
        }

        if (fromStep <= 3) {
          const s3Ok = await runStep3();
          if (!s3Ok || isCancelledRef.current) {
            return;
          }
        }

        if (fromStep <= 4) {
          await runStep4();
        }
      } finally {
        isRunningRef.current = false;
      }
    },
    [runStep1, runStep2, runStep3, runStep4],
  );

  // 弹窗展示或关闭时
  useEffect(() => {
    if (open) {
      isCancelledRef.current = false;
      void runPipeline(1);
    } else {
      isCancelledRef.current = true;
      isRunningRef.current = false;
      setCurrentStep(1);
      setStep1Status("pending");
      setStep2Status("pending");
      setStep3Status("pending");
      setStep4Status("pending");
      setStepSubProgress(0);
      setStepSubPhaseText("");
      setConfirmationDecision("none");
    }
    return () => {
      isCancelledRef.current = true;
      isRunningRef.current = false;
    };
  }, [open, runPipeline]);

  // 切换编辑 Tab 时同步表单数据
  const handleSwitchEditTab = (
    tab: "chatgpt" | "claude" | "workbuddy" | "acciowork",
  ) => {
    setEditTab(tab);
    if (tab === "chatgpt") {
      setEditUrl(resolveEndpoint(configData.codex?.base_url));
      setEditApiKey(configData.codex?.api_key || "");
      setEditModel(configData.codex?.model || "");
    } else if (tab === "claude") {
      setEditUrl(resolveEndpoint(configData.claude?.base_url));
      setEditApiKey(configData.claude?.api_key || "");
      setEditModel(configData.claude?.model || "");
    } else if (tab === "workbuddy") {
      setEditUrl(resolveEndpoint(configData.workbuddy?.base_url));
      setEditApiKey(configData.workbuddy?.api_key || "");
      setEditModel(configData.workbuddy?.model || "gpt-5.6-sol");
    } else {
      setEditUrl(resolveEndpoint(configData.accio?.base_url));
      setEditApiKey(configData.accio?.api_key || "");
      setEditModel(configData.accio?.model || "");
    }
  };

  // 保存快速修改
  const handleSaveEdit = async () => {
    if (!editApiKey.trim()) {
      toast.warning(t("ui.99a3ab7c4480"));
      throw new Error(t("ui.99a3ab7c4480"));
    }
    try {
      if (editTab === "chatgpt") {
        await setCodexConfig(
          editUrl.trim(),
          editApiKey.trim(),
          editModel.trim(),
        );
        toast.success(t("ui.0342a358f9bc"));
      } else if (editTab === "claude") {
        await setClaudeConfig(
          editUrl.trim(),
          editApiKey.trim(),
          editModel.trim(),
        );
        toast.success(t("ui.8b84901367a0"));
      } else if (editTab === "workbuddy") {
        const existing = configData.workbuddy;
        await setWorkbuddyConfig({
          url: editUrl.trim(),
          api_key: editApiKey.trim(),
          model: editModel.trim() || "gpt-5.6-sol",
          supports_tool_call: existing?.supports_tool_call ?? true,
          supports_images: existing?.supports_images ?? true,
          supports_reasoning: existing?.supports_reasoning ?? true,
          only_reasoning: existing?.only_reasoning ?? false,
          can_disable_thinking: existing?.can_disable_thinking ?? true,
          use_custom_protocol: existing?.use_custom_protocol ?? false,
          default_effort: existing?.default_effort ?? null,
          supported_efforts: existing?.supported_efforts ?? ["medium"],
          max_input_tokens: existing?.max_input_tokens ?? 32768,
          max_output_tokens: existing?.max_output_tokens ?? 32768,
        });
        toast.success(t("ui.2606d27657e6"));
      } else {
        const existing = configData.accio;
        await setAccioConfig({
          base_url: editUrl.trim(),
          api_key: editApiKey.trim(),
          model: editModel.trim(),
          bridge_port: existing?.bridge_port ?? 51740,
          official_gateway:
            existing?.official_gateway ?? "https://work.alibabacloud.com",
          fallback_official: existing?.fallback_official ?? true,
          prevent_official_leak: existing?.prevent_official_leak ?? true,
        });
        toast.success(t("ui.39822b1d3dbb"));
      }

      // 重新读取并刷新展示
      const [newCodex, newClaude, newWb, newAccio] = await Promise.all([
        getCodexConfig(),
        getClaudeConfig(),
        getWorkbuddyConfig(),
        getAccioConfig(),
      ]);
      setConfigData({
        codex: newCodex,
        claude: newClaude,
        workbuddy: newWb,
        accio: newAccio,
      });
      setConfirmationDecision("confirmed");
      setStep4Status("success");
      const saveSummary = t("ui.92e60755e8bd", {
        v0:
          editTab === "chatgpt"
            ? "ChatGPT"
            : editTab === "claude"
              ? "Claude"
              : editTab === "workbuddy"
                ? "WorkBuddy"
                : "Accio Work",
      });
      addLog("CONFIG:SAVE", saveSummary, "success");
    } catch (err) {
      toast.error(t("ui.22c1b63ad95b", { v0: err }));
      throw err;
    }
  };

  // 用户直接确认无需修改
  const handleConfirmNoChange = () => {
    setConfirmationDecision("confirmed");
    setStep4Status("success");
    toast.success(t("ui.56c82451ac9d"));
    addLog("CONFIRM:OK", t("ui.b83d8862a638"), "success");
  };

  // 用户在未检测到本地 Agent 环境时，选择跳过检测并强行预先写入配置
  const handleForceContinueStep2 = () => {
    setStep2Status("success");
    addLog("HOST:OVERRIDE", t("ui.9937f476fee8"), "warn");
    toast.info(t("ui.a75638402f13"));
    setCurrentStep(3);
    void runPipeline(3);
  };

  // 点击底部【完成初始化并进入软件】按钮
  const handleCompleteInitialization = () => {
    if (step4Status !== "success") {
      toast.warning(t("ui.16f6f0d594b7"));
      return;
    }
    toast.success(t("ui.997245f05cc8"));
    onFinish();
    onClose();
  };

  // 进度计算 (0% - 100%)
  const calculateOverallProgress = (): number => {
    let completed = 0;
    if (step1Status === "success") completed += 25;
    if (step2Status === "success") completed += 25;
    if (step3Status === "success") completed += 25;
    if (step4Status === "success") completed += 25;
    return completed;
  };

  const currentCodex = configData.codex;
  const currentClaude = configData.claude;
  const currentWorkbuddy = configData.workbuddy;
  const currentAccio = configData.accio;
  const activeCfg: AgentConfig | null =
    activeConfigTab === "chatgpt"
      ? currentCodex
      : activeConfigTab === "claude"
        ? currentClaude
        : activeConfigTab === "workbuddy"
          ? currentWorkbuddy
            ? {
                base_url: currentWorkbuddy.base_url,
                api_key: currentWorkbuddy.api_key,
                model: currentWorkbuddy.model,
                config_exists: currentWorkbuddy.config_exists,
                config_path: currentWorkbuddy.config_path,
                is_installed: currentWorkbuddy.is_installed,
                app_path: currentWorkbuddy.app_path,
              }
            : null
          : currentAccio
            ? {
                base_url: currentAccio.base_url,
                api_key: currentAccio.api_key,
                model: currentAccio.model,
                config_exists: currentAccio.config_exists ?? false,
                config_path: currentAccio.config_path ?? "",
                is_installed: currentAccio.is_installed ?? false,
                app_path: currentAccio.app_path,
              }
            : null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 top-11 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md transition-all duration-300">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-2xl bg-white/95 border-slate-200/90 text-slate-800 dark:bg-[#0f111a]/95 dark:border-white/10 dark:text-gray-100"
          >
            {/* ── 弹窗顶栏 ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-white/10 flex-shrink-0 bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
                    {t("ui.454d03db7597")}
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-cyan-500/20 dark:text-cyan-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-cyan-400 animate-pulse" />
                      {t("ui.6c4179f90ac0")}
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-gray-400">
                    {t("ui.37985b069ba9")}
                  </p>
                </div>
              </div>
              {/* 右上角进度标识与关闭按钮 */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs font-mono font-semibold text-blue-600 dark:text-cyan-400">
                    {calculateOverallProgress()}%
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-gray-500 ml-1">
                    {t("ui.4fbedf689c36")}
                  </span>
                </div>
                <div className="h-4 w-[1px] bg-slate-200 dark:bg-white/10" />
                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 dark:hover:bg-white/10 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
                  title={t("ui.b0110882629d")}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* ── 主体区域 (左侧竖直向下进度条 + 右侧环节详情卡片) ── */}
            <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-12">
              {/* ── 左侧: 竖直向下进度条步进器 ── */}
              <div className="col-span-4 p-5 border-r border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.01] flex flex-col justify-between overflow-y-auto">
                <div className="space-y-6 relative">
                  {/* 竖直导轨背景线 */}
                  <div className="absolute left-[17px] top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-white/10 z-0" />

                  {/* 竖直动态进度高亮填充线 (随着环节完成向下延伸) */}
                  <div
                    className="absolute left-[17px] top-4 w-0.5 bg-gradient-to-b from-blue-500 via-indigo-500 to-cyan-400 z-0 transition-all duration-500"
                    style={{
                      height:
                        step4Status === "success"
                          ? "100%"
                          : step3Status === "success"
                            ? "75%"
                            : step2Status === "success"
                              ? "50%"
                              : step1Status === "success"
                                ? "25%"
                                : "0%",
                    }}
                  />

                  {/* 步骤 1 */}
                  <StepIndicatorNode
                    stepNumber={1}
                    title={t("ui.761f1a987699")}
                    subtitle={t("ui.3d333faed22f")}
                    status={step1Status}
                    isActive={currentStep === 1}
                    subProgress={
                      currentStep === 1 ? stepSubProgress : undefined
                    }
                    onClick={() => setCurrentStep(1)}
                  />

                  {/* 步骤 2 */}
                  <StepIndicatorNode
                    stepNumber={2}
                    title={t("ui.fa6d1ef5d467")}
                    subtitle={t("ui.a245225da34d")}
                    status={step2Status}
                    isActive={currentStep === 2}
                    subProgress={
                      currentStep === 2 ? stepSubProgress : undefined
                    }
                    onClick={() => {
                      if (step1Status === "success") setCurrentStep(2);
                    }}
                  />

                  {/* 步骤 3 */}
                  <StepIndicatorNode
                    stepNumber={3}
                    title={t("ui.d33a6a7700f4")}
                    subtitle={t("ui.c90694c392c3")}
                    status={step3Status}
                    isActive={currentStep === 3}
                    subProgress={
                      currentStep === 3 ? stepSubProgress : undefined
                    }
                    onClick={() => {
                      if (step2Status === "success") setCurrentStep(3);
                    }}
                  />

                  {/* 步骤 4 */}
                  <StepIndicatorNode
                    stepNumber={4}
                    title={t("ui.932f24d02f72")}
                    subtitle={t("ui.ca39ace95507")}
                    status={step4Status}
                    isActive={currentStep === 4}
                    onClick={() => {
                      if (step3Status === "success") setCurrentStep(4);
                    }}
                  />
                </div>

                {/* 左下角小贴士 */}
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 text-blue-800 dark:bg-blue-950/30 dark:border-cyan-500/20 dark:text-cyan-300 text-[11px] leading-relaxed mt-4">
                  <p className="font-semibold flex items-center gap-1.5 mb-0.5">
                    <Sparkles size={12} className="text-cyan-500" />{" "}
                    {t("ui.6c3ebb23b832")}
                  </p>
                  {t("ui.69809dcda096")}
                </div>
              </div>

              {/* ── 右侧: 当前环节详情展示与交互区 ── */}
              <div className="col-span-8 p-6 overflow-y-auto max-h-[calc(92vh-130px)] flex flex-col justify-between">
                <div>
                  {/* 环节 1: 网络环境检测详情 */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          {step1Status === "error" ? (
                            <WifiOff size={16} className="text-red-500" />
                          ) : (
                            <Wifi
                              size={16}
                              className="text-blue-500 dark:text-cyan-400"
                            />
                          )}
                          {t("ui.99994b53f460")}
                        </h3>
                        {step1Status === "running" && (
                          <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-cyan-400 font-medium">
                            <Loader2 size={13} className="animate-spin" />{" "}
                            {t("ui.766c821758cc")}
                          </span>
                        )}
                        {step1Status === "success" && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 size={13} />
                            {t("ui.aa3849ba0f13")}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-gray-400">
                        {t("ui.3f00493e7536")}
                      </p>

                      {/* 扫描子进度指示 */}
                      {step1Status === "running" && (
                        <ScanProgressBar
                          progress={stepSubProgress}
                          statusText={stepSubPhaseText}
                        />
                      )}

                      {/* 检查项列表 */}
                      <ChecklistCard
                        checkpoints={[
                          {
                            key: "dns_gateway",
                            label: t("ui.21e4ff426d10"),
                            status:
                              checkpoints.dns_gateway ||
                              (step1Status === "success" ? "done" : "pending"),
                            detail: t("ui.7e26c8530845"),
                          },
                          {
                            key: "proxy_tls",
                            label: t("ui.5622322423ed"),
                            status:
                              checkpoints.proxy_tls ||
                              (step1Status === "success" ? "done" : "pending"),
                            detail: t("ui.b05b19d68541"),
                          },
                          {
                            key: "endpoint_ping",
                            label: t("ui.3fd9152045f0"),
                            status:
                              checkpoints.endpoint_ping ||
                              (step1Status === "success" ? "done" : "pending"),
                            detail: `${BRAND.siteUrl}/ (GET)`,
                          },
                          {
                            key: "latency_eval",
                            label: t("ui.6ccddb5988ce"),
                            status:
                              checkpoints.latency_eval ||
                              (step1Status === "success" ? "done" : "pending"),
                            detail: networkData?.latency_ms
                              ? `${networkData.latency_ms} ms`
                              : t("ui.d9edeefbd526"),
                          },
                        ]}
                      />

                      {/* 目标站点卡片 */}
                      <div className="p-4 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-gray-400">
                            {t("ui.bb5634a004e3")}
                          </span>
                          <span className="font-mono font-medium text-slate-800 dark:text-gray-200">
                            {BRAND.siteUrl}/
                          </span>
                        </div>

                        {networkData && (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 dark:text-gray-400">
                                {t("ui.e60935a8fc2f")}
                              </span>
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded font-mono font-bold text-[11px]",
                                  networkData.status_code === 200
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300",
                                )}
                              >
                                {networkData.status_code
                                  ? `${networkData.status_code} OK`
                                  : t("ui.585c2574817a")}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 dark:text-gray-400">
                                {t("ui.eb0e1fd7cb0f")}
                              </span>
                              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                {networkData.latency_ms ?? 0} ms
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* 状态与错误反馈 */}
                      {step1Status === "success" && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2
                              size={16}
                              className="text-emerald-600 flex-shrink-0"
                            />
                            <span>{t("ui.fce72e602592")}</span>
                          </div>
                          <button
                            onClick={() => setCurrentStep(2)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-medium text-[11px] hover:bg-emerald-700 transition"
                          >
                            {t("ui.21229482fc88")}
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      )}

                      {step1Status === "error" && (
                        <div className="space-y-3">
                          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300 text-xs space-y-1">
                            <div className="flex items-center gap-1.5 font-bold">
                              <XCircle size={15} className="text-red-600" />
                              {t("ui.d01d13103f28")}
                            </div>
                            <p className="text-[11px] leading-relaxed text-red-700 dark:text-red-400">
                              {networkError}
                            </p>
                          </div>

                          <button
                            onClick={() => void runPipeline(1)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
                          >
                            <RefreshCw size={13} />
                            {t("ui.dc8ba9dbc5dc")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 环节 2: 配置文件路径获取详情 (凸显扫描本机效果) */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <FolderCheck
                            size={16}
                            className="text-blue-500 dark:text-cyan-400"
                          />
                          {t("ui.6beecd3aca4c")}
                        </h3>
                        {step2Status === "running" && (
                          <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-cyan-400 font-medium">
                            <Loader2 size={13} className="animate-spin" />{" "}
                            {t("ui.c26e589ad77c")}
                          </span>
                        )}
                        {step2Status === "success" && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 size={13} />
                            {t("ui.1454d13a199b")}
                          </span>
                        )}
                      </div>

                      {/* 雷达动态扫描 HUD */}
                      {step2Status === "running" && (
                        <RadarScannerHud
                          label={t("ui.e1dc5af87baf")}
                          sublabel={t("ui.8709e6bcc1b2")}
                        />
                      )}

                      {/* 扫描子进度指示 */}
                      {step2Status === "running" && (
                        <ScanProgressBar
                          progress={stepSubProgress}
                          statusText={stepSubPhaseText}
                        />
                      )}

                      {/* 本机扫描检查项 */}
                      <ChecklistCard
                        checkpoints={[
                          {
                            key: "env_profile",
                            label: t("ui.12261b686599"),
                            status:
                              checkpoints.env_profile ||
                              (step2Status === "success" ? "done" : "pending"),
                            detail: t("ui.112a05811edd"),
                          },
                          {
                            key: "scan_codex",
                            label: t("ui.cfd72593b01b"),
                            status:
                              checkpoints.scan_codex ||
                              (step2Status === "success" ? "done" : "pending"),
                            detail:
                              checkpoints.scan_codex === "error"
                                ? t("ui.68e6e8cda745")
                                : configData.codex?.config_exists
                                  ? t("ui.bf487c46bf45")
                                  : configData.codex?.is_installed
                                    ? t("ui.a204b3a11787")
                                    : checkpoints.scan_codex === "done"
                                      ? t("ui.f2afde8960a6")
                                      : t("ui.9f4f5c613846"),
                          },
                          {
                            key: "scan_claude",
                            label: t("ui.2a8c90933299"),
                            status:
                              checkpoints.scan_claude ||
                              (step2Status === "success" ? "done" : "pending"),
                            detail:
                              checkpoints.scan_claude === "error"
                                ? t("ui.68e6e8cda745")
                                : configData.claude?.config_exists
                                  ? t("ui.38ee47165deb")
                                  : configData.claude?.is_installed
                                    ? t("ui.a204b3a11787")
                                    : checkpoints.scan_claude === "done"
                                      ? t("ui.f2afde8960a6")
                                      : t("ui.9f4f5c613846"),
                          },
                          {
                            key: "scan_workbuddy",
                            label: t("ui.34465d85ea02"),
                            status:
                              checkpoints.scan_workbuddy ||
                              (step2Status === "success" ? "done" : "pending"),
                            detail:
                              checkpoints.scan_workbuddy === "error"
                                ? t("ui.68e6e8cda745")
                                : configData.workbuddy?.config_exists
                                  ? t("ui.2248d92c6b97")
                                  : configData.workbuddy?.is_installed
                                    ? t("ui.36018f39597a")
                                    : checkpoints.scan_workbuddy === "done"
                                      ? t("ui.f2afde8960a6")
                                      : t("ui.9f4f5c613846"),
                          },
                          {
                            key: "scan_accio",
                            label: t("ui.72d5b8fc352e"),
                            status:
                              checkpoints.scan_accio ||
                              (step2Status === "success" ? "done" : "pending"),
                            detail:
                              checkpoints.scan_accio === "error"
                                ? t("ui.68e6e8cda745")
                                : configData.accio?.config_exists
                                  ? t("ui.cbf8df77629c")
                                  : configData.accio?.is_installed
                                    ? t("ui.34ed73a8f992")
                                    : checkpoints.scan_accio === "done"
                                      ? t("ui.f2afde8960a6")
                                      : t("ui.9f4f5c613846"),
                          },
                          {
                            key: "acl_verify",
                            label: t("ui.27403d29445e"),
                            status:
                              checkpoints.acl_verify ||
                              (step2Status === "success" ? "done" : "pending"),
                            detail: t("ui.9aeead0ef1a6"),
                          },
                        ]}
                      />

                      {/* 扫描区域卡片（带激光扫光动画） */}
                      <div className="relative rounded-2xl overflow-hidden p-1 space-y-3">
                        {step2Status === "running" && <ScannerLaserSweep />}

                        {/* Codex 路径卡片 */}
                        <div className="p-3.5 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-1.5">
                              <OpenAIIcon size={14} className="text-blue-500" />
                              {t("ui.b73790a0846a")}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1",
                                step2Status === "running" && !configData.codex
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                                  : configData.codex?.config_exists
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : configData.codex?.is_installed
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
                              )}
                            >
                              {step2Status === "running" &&
                              !configData.codex ? (
                                <>
                                  <Loader2 size={10} className="animate-spin" />
                                  {t("ui.034dfcaebe5a")}
                                </>
                              ) : configData.codex?.config_exists ? (
                                <>
                                  <CheckCircle2 size={10} />
                                  {t("ui.a3079bf5e2c2")}
                                </>
                              ) : configData.codex?.is_installed ? (
                                <>
                                  <AlertCircle size={10} />
                                  {t("ui.03411556c95b")}
                                </>
                              ) : (
                                <>
                                  <XCircle size={10} />
                                  {t("ui.6f7dc945aefa")}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-black/30 border border-slate-200/60 dark:border-white/5">
                            <code className="text-[11px] font-mono text-slate-700 dark:text-gray-300 break-all select-all">
                              {configData.codex?.config_path
                                ? configData.codex.config_path
                                : step2Status === "running"
                                  ? t("ui.2a19622189fd")
                                  : configData.codex?.is_installed
                                    ? t("ui.64d5beb76971")
                                    : t("ui.f1ef3e5f11fb")}
                            </code>
                            {configData.codex?.config_path ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={async () => {
                                    if (!configData.codex?.config_exists) {
                                      toast.warning(t("ui.a1efb895c8f8"));
                                      return;
                                    }
                                    const ok = await openConfigFile(
                                      configData.codex.config_path,
                                    );
                                    if (ok) toast.success(t("ui.eb2ed44f52a5"));
                                  }}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.f4659695b66f")}
                                >
                                  <ExternalLink size={12} />
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      configData.codex?.config_path || "",
                                      t("ui.9ac4a0b3fbf5"),
                                    )
                                  }
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.e0c29eaeb30b")}
                                >
                                  {copiedKey === t("ui.9ac4a0b3fbf5") ? (
                                    <Check
                                      size={12}
                                      className="text-emerald-500"
                                    />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Claude 路径卡片 */}
                        <div className="p-3.5 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-1.5">
                              <ClaudeIcon
                                size={14}
                                className="text-purple-500"
                              />
                              {t("ui.4e19502f9cb2")}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1",
                                step2Status === "running" && !configData.claude
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                                  : configData.claude?.config_exists
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : configData.claude?.is_installed
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
                              )}
                            >
                              {step2Status === "running" &&
                              !configData.claude ? (
                                <>
                                  <Loader2 size={10} className="animate-spin" />
                                  {t("ui.034dfcaebe5a")}
                                </>
                              ) : configData.claude?.config_exists ? (
                                <>
                                  <CheckCircle2 size={10} />
                                  {t("ui.a3079bf5e2c2")}
                                </>
                              ) : configData.claude?.is_installed ? (
                                <>
                                  <AlertCircle size={10} />
                                  {t("ui.03411556c95b")}
                                </>
                              ) : (
                                <>
                                  <XCircle size={10} />
                                  {t("ui.6f7dc945aefa")}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-black/30 border border-slate-200/60 dark:border-white/5">
                            <code className="text-[11px] font-mono text-slate-700 dark:text-gray-300 break-all select-all">
                              {configData.claude?.config_path
                                ? configData.claude.config_path
                                : step2Status === "running"
                                  ? t("ui.ef9ccd189a17")
                                  : configData.claude?.is_installed
                                    ? t("ui.9a62efb49fce")
                                    : t("ui.f1ef3e5f11fb")}
                            </code>
                            {configData.claude?.config_path ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={async () => {
                                    if (!configData.claude?.config_exists) {
                                      toast.warning(t("ui.a1efb895c8f8"));
                                      return;
                                    }
                                    const ok = await openConfigFile(
                                      configData.claude.config_path,
                                    );
                                    if (ok) toast.success(t("ui.eb2ed44f52a5"));
                                  }}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.f4659695b66f")}
                                >
                                  <ExternalLink size={12} />
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      configData.claude?.config_path || "",
                                      t("ui.954016e17ac4"),
                                    )
                                  }
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.e0c29eaeb30b")}
                                >
                                  {copiedKey === t("ui.954016e17ac4") ? (
                                    <Check
                                      size={12}
                                      className="text-emerald-500"
                                    />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* WorkBuddy 路径卡片 */}
                        <div className="p-3.5 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-1.5">
                              <WorkbuddyIcon
                                size={14}
                                className="text-emerald-500"
                              />
                              {t("ui.8f712555e43b")}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1",
                                step2Status === "running" &&
                                  !configData.workbuddy
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                                  : configData.workbuddy?.config_exists
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : configData.workbuddy?.is_installed
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
                              )}
                            >
                              {step2Status === "running" &&
                              !configData.workbuddy ? (
                                <>
                                  <Loader2 size={10} className="animate-spin" />
                                  {t("ui.034dfcaebe5a")}
                                </>
                              ) : configData.workbuddy?.config_exists ? (
                                <>
                                  <CheckCircle2 size={10} />
                                  {t("ui.a3079bf5e2c2")}
                                </>
                              ) : configData.workbuddy?.is_installed ? (
                                <>
                                  <AlertCircle size={10} />
                                  {t("ui.34b3f119e8da")}
                                </>
                              ) : (
                                <>
                                  <XCircle size={10} />
                                  {t("ui.6f7dc945aefa")}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-black/30 border border-slate-200/60 dark:border-white/5">
                            <code className="text-[11px] font-mono text-slate-700 dark:text-gray-300 break-all select-all">
                              {configData.workbuddy?.config_path
                                ? configData.workbuddy.config_path
                                : step2Status === "running"
                                  ? t("ui.18e917958863")
                                  : configData.workbuddy?.is_installed
                                    ? t("ui.3970f2bc6087")
                                    : t("ui.f1ef3e5f11fb")}
                            </code>
                            {configData.workbuddy?.config_path ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={async () => {
                                    if (!configData.workbuddy?.config_exists) {
                                      toast.warning(t("ui.a1efb895c8f8"));
                                      return;
                                    }
                                    const ok = await openConfigFile(
                                      configData.workbuddy.config_path,
                                    );
                                    if (ok) toast.success(t("ui.eb2ed44f52a5"));
                                  }}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.f4659695b66f")}
                                >
                                  <ExternalLink size={12} />
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      configData.workbuddy?.config_path || "",
                                      t("ui.f9fc305f0665"),
                                    )
                                  }
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.e0c29eaeb30b")}
                                >
                                  {copiedKey === t("ui.f9fc305f0665") ? (
                                    <Check
                                      size={12}
                                      className="text-emerald-500"
                                    />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {/* Accio Work 路径卡片 */}
                        <div className="p-3.5 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-2 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-1.5">
                              <AccioWorkIcon
                                size={14}
                                className="text-orange-500"
                              />
                              {t("ui.81defb42e17b")}
                            </span>
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1",
                                step2Status === "running" && !configData.accio
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                                  : configData.accio?.config_exists
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : configData.accio?.is_installed
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                                      : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300",
                              )}
                            >
                              {step2Status === "running" &&
                              !configData.accio ? (
                                <>
                                  <Loader2 size={10} className="animate-spin" />
                                  {t("ui.034dfcaebe5a")}
                                </>
                              ) : configData.accio?.config_exists ? (
                                <>
                                  <CheckCircle2 size={10} />
                                  {t("ui.a3079bf5e2c2")}
                                </>
                              ) : configData.accio?.is_installed ? (
                                <>
                                  <AlertCircle size={10} />
                                  {t("ui.34b3f119e8da")}
                                </>
                              ) : (
                                <>
                                  <XCircle size={10} />
                                  {t("ui.6f7dc945aefa")}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-black/30 border border-slate-200/60 dark:border-white/5">
                            <code className="text-[11px] font-mono text-slate-700 dark:text-gray-300 break-all select-all">
                              {configData.accio?.config_path
                                ? configData.accio.config_path
                                : step2Status === "running"
                                  ? t("ui.7a185df9a02d")
                                  : configData.accio?.is_installed
                                    ? t("ui.dab148d74d18")
                                    : t("ui.f1ef3e5f11fb")}
                            </code>
                            {configData.accio?.config_path ? (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={async () => {
                                    if (!configData.accio?.config_exists) {
                                      toast.warning(t("ui.a1efb895c8f8"));
                                      return;
                                    }
                                    const ok = await openConfigFile(
                                      configData.accio.config_path || "",
                                    );
                                    if (ok) toast.success(t("ui.eb2ed44f52a5"));
                                  }}
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.f4659695b66f")}
                                >
                                  <ExternalLink size={12} />
                                </button>
                                <button
                                  onClick={() =>
                                    copyToClipboard(
                                      configData.accio?.config_path || "",
                                      t("ui.396aa21db621"),
                                    )
                                  }
                                  className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 cursor-pointer"
                                  title={t("ui.e0c29eaeb30b")}
                                >
                                  {copiedKey === t("ui.396aa21db621") ? (
                                    <Check
                                      size={12}
                                      className="text-emerald-500"
                                    />
                                  ) : (
                                    <Copy size={12} />
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {step2Status === "success" && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2
                              size={16}
                              className="text-emerald-600 flex-shrink-0"
                            />
                            <span>
                              {(configData.codex?.is_installed ? 1 : 0) +
                                (configData.claude?.is_installed ? 1 : 0) +
                                (configData.workbuddy?.is_installed ? 1 : 0) +
                                (configData.accio?.is_installed ? 1 : 0) >
                              1
                                ? t("ui.0bd674b5c6ae")
                                : configData.accio?.is_installed
                                  ? t("ui.0c2b5e618d63")
                                  : configData.workbuddy?.is_installed
                                    ? t("ui.1bd762223b26")
                                    : configData.claude?.is_installed
                                      ? t("ui.2cd61576690a")
                                      : configData.codex?.is_installed
                                        ? t("ui.5b380034de16")
                                        : t("ui.69ad14bc24b0")}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setCurrentStep(3);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-medium text-[11px] hover:bg-emerald-700 transition cursor-pointer"
                          >
                            {t("ui.1986b4fe24ef")}
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      )}

                      {step2Status === "error" && (
                        <div className="space-y-3">
                          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300 text-xs space-y-2">
                            <div className="flex items-center gap-1.5 font-bold">
                              <XCircle
                                size={15}
                                className="text-rose-600 dark:text-rose-400 flex-shrink-0"
                              />
                              {t("ui.01c463949d71")}
                            </div>
                            <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300/90 whitespace-pre-line">
                              {pathError}
                            </p>
                            <div className="pt-1 border-t border-rose-200/60 dark:border-rose-500/20 text-[11px] text-slate-600 dark:text-gray-300 space-y-1.5">
                              <div className="font-semibold text-slate-800 dark:text-gray-200 flex items-center gap-1">
                                <Terminal
                                  size={12}
                                  className="text-slate-500"
                                />
                                {t("ui.c231e74c7e0d")}
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 font-mono text-[10px]">
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-white dark:bg-black/30 border border-rose-200/60 dark:border-rose-500/20 flex-1">
                                  <span className="truncate">
                                    Claude: npm i -g @anthropic-ai/claude-code
                                  </span>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        "npm i -g @anthropic-ai/claude-code",
                                        t("ui.db80c07d6e18"),
                                      )
                                    }
                                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                                    title={t("ui.3ac2a7773b34")}
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-white dark:bg-black/30 border border-rose-200/60 dark:border-rose-500/20 flex-1">
                                  <span className="truncate">
                                    Codex: npm i -g @openai/codex
                                  </span>
                                  <button
                                    onClick={() =>
                                      copyToClipboard(
                                        "npm i -g @openai/codex",
                                        t("ui.fd6af1646f3b"),
                                      )
                                    }
                                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                                    title={t("ui.3ac2a7773b34")}
                                  >
                                    <Copy size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              onClick={() => void runPipeline(2)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition shadow-xs cursor-pointer"
                            >
                              <RefreshCw size={12} />
                              {t("ui.a224ac4b8166")}
                            </button>

                            <button
                              onClick={handleForceContinueStep2}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20 transition cursor-pointer"
                              title={t("ui.f54d6aaca05f")}
                            >
                              <Sparkles size={12} />
                              {t("ui.9c21a43052ed")}
                            </button>

                            <button
                              onClick={() => void exit(0)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition cursor-pointer ml-auto"
                            >
                              <Power size={12} />
                              {t("ui.dee9d3a89e20")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 环节 3: 配置信息读取与展示详情 */}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <FileCode
                            size={16}
                            className="text-blue-500 dark:text-cyan-400"
                          />
                          {t("ui.e0cf64d1a16d")}
                        </h3>
                        {step3Status === "running" && (
                          <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-cyan-400 font-medium">
                            <Loader2 size={13} className="animate-spin" />{" "}
                            {t("ui.da2c1dd869fc")}
                          </span>
                        )}
                        {step3Status === "success" && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 size={13} />
                            {t("ui.680c9ba18aee")}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 dark:text-gray-400">
                        {activeCfg?.config_exists
                          ? t("ui.797944ddd240")
                          : activeCfg?.is_installed
                            ? t("ui.dde2cca78fce")
                            : t("ui.dfd7ffe9d735")}
                      </p>

                      {/* 扫描子进度指示 */}
                      {step3Status === "running" && (
                        <ScanProgressBar
                          progress={stepSubProgress}
                          statusText={stepSubPhaseText}
                        />
                      )}

                      {/* 解析检查项 */}
                      <ChecklistCard
                        checkpoints={[
                          {
                            key: "load_binary",
                            label: activeCfg?.config_exists
                              ? t("ui.29fcd0f5485a")
                              : t("ui.40c29da3dbd2"),
                            status:
                              checkpoints.load_binary ||
                              (step3Status === "success" ? "done" : "pending"),
                            detail: activeCfg?.config_exists
                              ? t("ui.9127357f3dc3")
                              : t("ui.0bfe6973f2ef"),
                          },
                          {
                            key: "parse_url",
                            label: t("ui.daeb1a4c996a"),
                            status:
                              checkpoints.parse_url ||
                              (step3Status === "success" ? "done" : "pending"),
                            detail: t("ui.6725889c4cf9"),
                          },
                          {
                            key: "verify_key",
                            label: t("ui.349ef63e1362"),
                            status:
                              checkpoints.verify_key ||
                              (step3Status === "success" ? "done" : "pending"),
                            detail: t("ui.ea9f0e122ac0"),
                          },
                          {
                            key: "map_model",
                            label: t("ui.3f96ea543750"),
                            status:
                              checkpoints.map_model ||
                              (step3Status === "success" ? "done" : "pending"),
                            detail: t("ui.00305fedd2a7"),
                          },
                        ]}
                      />

                      {/* 切换展示 ChatGPT 或 Claude */}
                      <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 w-fit">
                        <button
                          onClick={() => {
                            setActiveConfigTab("chatgpt");
                            setEditTab("chatgpt");
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer",
                            activeConfigTab === "chatgpt"
                              ? "bg-white text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-300 font-bold"
                              : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white",
                          )}
                        >
                          <OpenAIIcon size={13} />
                          ChatGPT (Codex)
                          {!configData.codex?.is_installed && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400">
                              {t("ui.6f7dc945aefa")}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setActiveConfigTab("claude");
                            setEditTab("claude");
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer",
                            activeConfigTab === "claude"
                              ? "bg-white text-purple-600 shadow-sm dark:bg-purple-500/20 dark:text-purple-300 font-bold"
                              : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white",
                          )}
                        >
                          <ClaudeIcon size={13} />
                          Claude Code
                          {!configData.claude?.is_installed && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400">
                              {t("ui.6f7dc945aefa")}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setActiveConfigTab("workbuddy");
                            setEditTab("workbuddy");
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer",
                            activeConfigTab === "workbuddy"
                              ? "bg-white text-emerald-600 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-300 font-bold"
                              : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white",
                          )}
                        >
                          <WorkbuddyIcon size={13} />
                          WorkBuddy
                          {!configData.workbuddy?.is_installed && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400">
                              {t("ui.6f7dc945aefa")}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setActiveConfigTab("acciowork");
                            setEditTab("acciowork");
                          }}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer",
                            activeConfigTab === "acciowork"
                              ? "bg-white text-orange-600 shadow-sm dark:bg-orange-500/20 dark:text-orange-300 font-bold"
                              : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white",
                          )}
                        >
                          <AccioWorkIcon size={13} />
                          Accio Work
                          {!configData.accio?.is_installed && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400">
                              {t("ui.6f7dc945aefa")}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* 核心配置展示卡片 (url, apikey, model) */}
                      <div className="p-4 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-3.5">
                        {/* 1. URL */}
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-500 dark:text-gray-400 flex items-center gap-1.5 w-24 flex-shrink-0">
                            <Globe size={13} className="text-blue-500" />
                            {t("ui.324e4b6ee315")}
                          </span>
                          <div className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-black/40 border border-slate-200/80 dark:border-white/10 font-mono text-[11px]">
                            <span className="truncate">
                              {activeCfg?.base_url || t("ui.9c316270c92a")}
                            </span>
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  activeCfg?.base_url || "",
                                  t("ui.7332ef4057e3"),
                                )
                              }
                              className="ml-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                              title={t("ui.4edd1d00875d")}
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </div>

                        {/* 2. API Key */}
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-500 dark:text-gray-400 flex items-center gap-1.5 w-24 flex-shrink-0">
                            <Key size={13} className="text-amber-500" />
                            {t("ui.fb68d353e307")}
                          </span>
                          <div className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-black/40 border border-slate-200/80 dark:border-white/10 font-mono text-[11px]">
                            <span className="truncate">
                              {activeCfg?.api_key
                                ? (
                                    activeConfigTab === "chatgpt"
                                      ? showCodexKey
                                      : activeConfigTab === "claude"
                                        ? showClaudeKey
                                        : activeConfigTab === "workbuddy"
                                          ? showWorkbuddyKey
                                          : showAccioKey
                                  )
                                  ? activeCfg.api_key
                                  : `${activeCfg.api_key.slice(0, 6)}••••••••••••${activeCfg.api_key.slice(-4)}`
                                : t("ui.5950db0997f5")}
                            </span>
                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                              <button
                                onClick={() => {
                                  if (activeConfigTab === "chatgpt") {
                                    setShowCodexKey(!showCodexKey);
                                  } else if (activeConfigTab === "claude") {
                                    setShowClaudeKey(!showClaudeKey);
                                  } else if (activeConfigTab === "workbuddy") {
                                    setShowWorkbuddyKey(!showWorkbuddyKey);
                                  } else {
                                    setShowAccioKey(!showAccioKey);
                                  }
                                }}
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                title={t("ui.ac2acf098fd5")}
                              >
                                {(
                                  activeConfigTab === "chatgpt"
                                    ? showCodexKey
                                    : activeConfigTab === "claude"
                                      ? showClaudeKey
                                      : activeConfigTab === "workbuddy"
                                        ? showWorkbuddyKey
                                        : showAccioKey
                                ) ? (
                                  <EyeOff size={13} />
                                ) : (
                                  <Eye size={13} />
                                )}
                              </button>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    activeCfg?.api_key || "",
                                    "API Key",
                                  )
                                }
                                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                title={t("ui.4edd1d00875d")}
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 3. Model */}
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-500 dark:text-gray-400 flex items-center gap-1.5 w-24 flex-shrink-0">
                            <Cpu size={13} className="text-purple-500" />
                            {t("ui.79a4aaf629bd")}
                          </span>
                          <div className="flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-black/40 border border-slate-200/80 dark:border-white/10 font-mono text-[11px]">
                            <span
                              className={cn(
                                "truncate",
                                activeCfg?.model
                                  ? "font-semibold text-purple-700 dark:text-purple-300"
                                  : "text-slate-400 dark:text-gray-500",
                              )}
                            >
                              {activeCfg?.model || t("ui.0638a3e9d5af")}
                            </span>
                            {activeCfg?.model ? (
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    activeCfg?.model || "",
                                    t("ui.38719c9968ae"),
                                  )
                                }
                                className="ml-2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                title={t("ui.4edd1d00875d")}
                              >
                                <Copy size={12} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {step3Status === "success" && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2
                              size={16}
                              className="text-emerald-600 flex-shrink-0"
                            />
                            <span>{t("ui.f39c2e3db497")}</span>
                          </div>
                          <button
                            onClick={() => setCurrentStep(4)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-medium text-[11px] hover:bg-emerald-700 transition"
                          >
                            {t("ui.d7b14ed955e3")}
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      )}

                      {step3Status === "error" && (
                        <div className="space-y-3">
                          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300 text-xs space-y-1">
                            <div className="flex items-center gap-1.5 font-bold">
                              <XCircle size={15} className="text-red-600" />
                              {t("ui.877098b1967a")}
                            </div>
                            <p className="text-[11px] leading-relaxed text-red-700 dark:text-red-400">
                              {parseError}
                            </p>
                          </div>
                          <button
                            onClick={() => void runPipeline(3)}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
                          >
                            <RefreshCw size={13} />
                            {t("ui.bc38e5e48efa")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 环节 4: 配置信息确认环节详情 */}
                  {currentStep === 4 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <ShieldCheck
                            size={16}
                            className="text-blue-500 dark:text-cyan-400"
                          />
                          {t("ui.c5340d2b7752")}
                        </h3>
                        {step4Status === "success" && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 text-[11px] font-bold">
                            <CheckCircle2 size={12} />
                            {t("ui.2e46f994ee37")}
                          </span>
                        )}
                      </div>

                      <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/50 dark:bg-blue-950/20 dark:border-cyan-500/30 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <AlertCircle
                            size={18}
                            className="text-blue-600 dark:text-cyan-400 flex-shrink-0 mt-0.5"
                          />
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                              {t("ui.96328aba630a")}
                            </h4>
                            <p className="text-[11px] text-slate-600 dark:text-gray-300 mt-1">
                              {t("ui.7343fb257b65")}
                            </p>
                          </div>
                        </div>

                        {/* 核心操作选项 */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <button
                            onClick={handleConfirmNoChange}
                            className={cn(
                              "p-3 rounded-xl border text-left transition relative flex flex-col justify-between cursor-pointer",
                              confirmationDecision === "confirmed"
                                ? "bg-emerald-50/90 border-emerald-400 text-emerald-900 dark:bg-emerald-500/20 dark:border-emerald-500 dark:text-emerald-200 shadow-sm ring-1 ring-emerald-500/30"
                                : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-cyan-500",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold flex items-center gap-1.5">
                                <CheckCircle2
                                  size={14}
                                  className="text-emerald-500"
                                />
                                {t("ui.6ad863ed17d7")}
                              </span>
                              {confirmationDecision === "confirmed" && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-1">
                              {t("ui.68dbd8a4d84b")}
                            </p>
                          </button>

                          <button
                            onClick={() => {
                              setConfirmationDecision("editing");
                              handleSwitchEditTab(editTab);
                            }}
                            className={cn(
                              "p-3 rounded-xl border text-left transition relative flex flex-col justify-between cursor-pointer",
                              confirmationDecision === "editing"
                                ? "bg-blue-50/90 border-blue-400 text-blue-900 dark:bg-blue-500/20 dark:border-cyan-500 dark:text-cyan-200 shadow-sm ring-1 ring-cyan-500/30"
                                : "bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-cyan-500",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold flex items-center gap-1.5">
                                <Edit3
                                  size={14}
                                  className="text-blue-500 dark:text-cyan-400"
                                />
                                {t("ui.6310f08be27f")}
                              </span>
                              {confirmationDecision === "editing" && (
                                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-1">
                              {t("ui.cf45f577e0e8")}
                            </p>
                          </button>
                        </div>
                      </div>

                      {/* 快速修改表单 (当用户选择选项 B 时展开) */}
                      {confirmationDecision === "editing" && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 rounded-xl border bg-slate-50/80 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 dark:text-gray-200">
                              {t("ui.3a3f41561f34")}
                            </span>
                            <div className="flex p-0.5 rounded-lg bg-slate-200 dark:bg-black/30 text-[11px]">
                              <button
                                onClick={() => handleSwitchEditTab("chatgpt")}
                                className={cn(
                                  "px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center gap-1",
                                  editTab === "chatgpt"
                                    ? "bg-white text-blue-600 shadow-xs dark:bg-blue-600 dark:text-white"
                                    : "text-slate-600 dark:text-gray-400",
                                )}
                              >
                                ChatGPT
                                {!configData.codex?.is_installed && (
                                  <span className="text-[9px] opacity-75">
                                    {t("ui.297fe514ed1e")}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => handleSwitchEditTab("claude")}
                                className={cn(
                                  "px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center gap-1",
                                  editTab === "claude"
                                    ? "bg-white text-purple-600 shadow-xs dark:bg-purple-600 dark:text-white"
                                    : "text-slate-600 dark:text-gray-400",
                                )}
                              >
                                Claude Code
                                {!configData.claude?.is_installed && (
                                  <span className="text-[9px] opacity-75">
                                    {t("ui.297fe514ed1e")}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => handleSwitchEditTab("workbuddy")}
                                className={cn(
                                  "px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center gap-1",
                                  editTab === "workbuddy"
                                    ? "bg-white text-emerald-600 shadow-xs dark:bg-emerald-600 dark:text-white"
                                    : "text-slate-600 dark:text-gray-400",
                                )}
                              >
                                WorkBuddy
                                {!configData.workbuddy?.is_installed && (
                                  <span className="text-[9px] opacity-75">
                                    {t("ui.297fe514ed1e")}
                                  </span>
                                )}
                              </button>
                              <button
                                onClick={() => handleSwitchEditTab("acciowork")}
                                className={cn(
                                  "px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center gap-1",
                                  editTab === "acciowork"
                                    ? "bg-white text-orange-600 shadow-xs dark:bg-orange-600 dark:text-white"
                                    : "text-slate-600 dark:text-gray-400",
                                )}
                              >
                                Accio Work
                                {!configData.accio?.is_installed && (
                                  <span className="text-[9px] opacity-75">
                                    {t("ui.297fe514ed1e")}
                                  </span>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* API 节点 */}
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500 dark:text-gray-400 font-medium">
                              {t("ui.731e647d8e72")}
                            </label>
                            <NodeCardSelector
                              value={editUrl}
                              onChange={setEditUrl}
                            />
                          </div>

                          {/* API Key 输入 */}
                          <div className="space-y-1">
                            <ApiKeyInput
                              title={t("ui.59978b7e8cf4")}
                              badgeText={
                                editTab === "claude"
                                  ? "settings.json"
                                  : editTab === "workbuddy"
                                    ? "models.json"
                                    : editTab === "acciowork"
                                      ? "accio_config.json"
                                      : t("ui.8da07705aba6")
                              }
                              value={editApiKey}
                              onChange={setEditApiKey}
                              placeholder="sk-..."
                              storageLocation={
                                editTab === "claude"
                                  ? "~/.claude/settings.json"
                                  : editTab === "workbuddy"
                                    ? "~/.workbuddy/models.json"
                                    : editTab === "acciowork"
                                      ? "~/.ai-helper/accio_config.json"
                                      : undefined
                              }
                              configKey={
                                editTab === "claude"
                                  ? "env.ANTHROPIC_AUTH_TOKEN"
                                  : undefined
                              }
                              envVarName={
                                editTab === "chatgpt"
                                  ? "CUSTOM_OPENAI_API_KEY"
                                  : undefined
                              }
                              accentColor={
                                editTab === "claude"
                                  ? "purple"
                                  : editTab === "workbuddy"
                                    ? "emerald"
                                    : editTab === "acciowork"
                                      ? "orange"
                                      : "blue"
                              }
                              toolName={
                                editTab === "claude"
                                  ? "Claude Code"
                                  : editTab === "workbuddy"
                                    ? "WorkBuddy"
                                    : editTab === "acciowork"
                                      ? "Accio Work"
                                      : "ChatGPT / Codex"
                              }
                              compact
                            />
                          </div>

                          {/* Model 输入 */}
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-500 dark:text-gray-400 font-medium">
                              {t("ui.97167afdb84c")}
                            </label>
                            <input
                              type="text"
                              value={editModel}
                              onChange={(e) => setEditModel(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder={
                                editTab === "chatgpt"
                                  ? "gpt-4o / gpt-5.6-sol"
                                  : editTab === "claude"
                                    ? "claude-3-7-sonnet-20250219"
                                    : editTab === "workbuddy"
                                      ? "gpt-5.6-sol"
                                      : t("ui.acdddee62091")
                              }
                            />
                          </div>

                          <div className="flex justify-end pt-1">
                            <ButtonToLoaderToSuccess
                              accent="blue"
                              disabled={savingEdit}
                              className="px-4 py-1.5 min-w-[180px] rounded-lg"
                              idleLabel={
                                <>
                                  <Save size={13} />
                                  <span>{t("ui.945128ee930a")}</span>
                                </>
                              }
                              successLabel={t("ui.3679ee3c0e7d")}
                              onAction={handleSaveEdit}
                              onBusyChange={setSavingEdit}
                            />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 本机扫描诊断实时终端 ── */}
                <ScanTerminalConsole
                  logs={scanLogs}
                  isRunning={
                    step1Status === "running" ||
                    step2Status === "running" ||
                    step3Status === "running"
                  }
                />
              </div>
            </div>

            {/* ── 弹窗底部操作确认栏 ── */}
            <div className="px-6 py-4 border-t border-slate-200/80 dark:border-white/10 flex items-center justify-between flex-shrink-0 bg-slate-50/60 dark:bg-white/[0.01]">
              {/* 左侧状态文案提示 */}
              <div className="text-xs text-slate-500 dark:text-gray-400">
                {step4Status === "success" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> {t("ui.f345b6d32b6d")}
                  </span>
                ) : step1Status === "error" ||
                  step2Status === "error" ||
                  step3Status === "error" ? (
                  <span className="text-red-600 dark:text-red-400 font-medium flex items-center gap-1.5">
                    <AlertCircle size={14} /> {t("ui.8131d4874462")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Loader2
                      size={13}
                      className="animate-spin text-blue-600 dark:text-cyan-400"
                    />
                    {t("ui.c8e5e3fed609")}
                    {currentStep}
                    {t("ui.b3c34e43c505")}
                  </span>
                )}
              </div>

              {/* 右侧主操作按钮 */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onFinish();
                    onClose();
                  }}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5 transition cursor-pointer"
                  title={t("ui.a6b09b143815")}
                >
                  {t("ui.cbd89d921e89")}
                </button>

                {(step1Status === "error" ||
                  step2Status === "error" ||
                  step3Status === "error") && (
                  <button
                    onClick={() => void exit(0)}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 dark:border-red-500/20 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition cursor-pointer"
                    title={t("ui.daae6962646e")}
                  >
                    <Power size={13} />
                    {t("ui.dee9d3a89e20")}
                  </button>
                )}

                <button
                  onClick={handleCompleteInitialization}
                  disabled={step4Status !== "success"}
                  className={cn(
                    "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md",
                    step4Status === "success"
                      ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white shadow-blue-500/20 hover:shadow-cyan-500/20 cursor-pointer"
                      : "bg-slate-200 text-slate-400 dark:bg-white/10 dark:text-gray-500 cursor-not-allowed",
                  )}
                >
                  <CheckCircle2 size={15} />
                  {t("ui.42ce00959a87")}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── 激光扫光动画组件 ──
function ScannerLaserSweep() {
  useLocale();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20 rounded-xl">
      <motion.div
        className="w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_14px_rgba(6,182,212,0.9)]"
        animate={{
          top: ["0%", "100%", "0%"],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ position: "absolute" }}
      />
      <motion.div
        className="w-full h-16 bg-gradient-to-b from-cyan-500/10 via-cyan-500/5 to-transparent pointer-events-none"
        animate={{
          top: ["-4rem", "calc(100% - 4rem)", "-4rem"],
        }}
        transition={{
          duration: 2.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ position: "absolute" }}
      />
    </div>
  );
}

// ── 旋转雷达扫描 HUD 组件 ──
function RadarScannerHud({
  label = t("ui.4b0ba70699d8"),
  sublabel = t("ui.62ad1b406420"),
}: {
  label?: string;
  sublabel?: string;
}) {
  useLocale();
  return (
    <div className="flex items-center gap-3.5 p-3 rounded-xl bg-blue-500/5 dark:bg-cyan-500/10 border border-blue-500/20 dark:border-cyan-500/20 backdrop-blur-xs relative overflow-hidden">
      <div className="relative w-11 h-11 rounded-full border border-blue-500/40 dark:border-cyan-400/40 flex items-center justify-center flex-shrink-0 bg-blue-900/10 dark:bg-cyan-950/40">
        {/* 旋转雷达波束 */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(6, 182, 212, 0.45) 55deg, transparent 60deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        />
        {/* 同心扩散脉冲 */}
        <motion.div
          className="absolute inset-0 rounded-full border border-cyan-400/50"
          animate={{ scale: [0.7, 1.35], opacity: [0.8, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeOut" }}
        />
        <Scan
          size={18}
          className="text-cyan-600 dark:text-cyan-400 relative z-10 animate-pulse"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Activity
              size={13}
              className="text-cyan-600 dark:text-cyan-400 animate-pulse"
            />
            {label}
          </span>
          <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 animate-pulse font-semibold px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
            ● SCANNING
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate mt-0.5">
          {sublabel}
        </p>
      </div>
    </div>
  );
}

// ── 环节内子微进度条 ──
function ScanProgressBar({
  progress,
  statusText,
}: {
  progress: number;
  statusText: string;
}) {
  useLocale();
  return (
    <div className="space-y-1.5 p-3 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/10">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[11px] text-slate-700 dark:text-gray-300 font-medium truncate flex items-center gap-1.5">
          <Loader2
            size={12}
            className="animate-spin text-blue-600 dark:text-cyan-400 flex-shrink-0"
          />
          <span className="truncate">{statusText}</span>
        </span>
        <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-cyan-400 ml-2 flex-shrink-0">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="h-2 w-full bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden relative">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 rounded-full relative"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="absolute top-0 bottom-0 right-0 w-8 bg-white/40 blur-[2px] -skew-x-12 animate-pulse" />
        </motion.div>
      </div>
    </div>
  );
}

// ── 检查项网格卡片 ──
function ChecklistCard({
  checkpoints,
}: {
  checkpoints: {
    key: string;
    label: string;
    status: CheckpointStatus;
    detail?: string;
  }[];
}) {
  useLocale();
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {checkpoints.map((cp) => (
        <div
          key={cp.key}
          className={cn(
            "p-2.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all duration-300",
            cp.status === "done" &&
              "bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300",
            cp.status === "scanning" &&
              "bg-blue-50/90 border-blue-400 text-blue-900 dark:bg-blue-500/15 dark:border-cyan-500/30 dark:text-cyan-300 shadow-sm ring-1 ring-blue-400/30",
            cp.status === "pending" &&
              "bg-slate-50/60 border-slate-200/80 text-slate-400 dark:bg-white/[0.02] dark:border-white/5 dark:text-gray-500",
            cp.status === "error" &&
              "bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300",
          )}
        >
          <div className="flex-shrink-0">
            {cp.status === "done" && (
              <CheckCircle2
                size={15}
                className="text-emerald-600 dark:text-emerald-400"
              />
            )}
            {cp.status === "scanning" && (
              <Loader2
                size={15}
                className="animate-spin text-blue-600 dark:text-cyan-400"
              />
            )}
            {cp.status === "pending" && (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-white/20 inline-block" />
            )}
            {cp.status === "error" && (
              <XCircle size={15} className="text-red-600 dark:text-red-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[11px] truncate">{cp.label}</div>
            {cp.detail && (
              <div className="text-[10px] opacity-80 truncate font-mono mt-0.5">
                {cp.detail}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 本机扫描诊断实时终端 ──
function ScanTerminalConsole({
  logs,
  isRunning,
}: {
  logs: ScanLogItem[];
  isRunning: boolean;
}) {
  useLocale();
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-900 text-slate-200 shadow-sm mt-3">
      {/* 终端顶栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 border-b border-white/5 text-[10.5px]">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="font-mono text-slate-400 font-semibold flex items-center gap-1.5">
            <Terminal size={11} className="text-cyan-400" />
            {t("ui.31c1812dc0fb")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="flex items-center gap-1 text-[9.5px] text-cyan-400 font-mono font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              LIVE SCAN
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-400 hover:text-white transition p-0.5 cursor-pointer"
            title={collapsed ? t("ui.a17d1a67700c") : t("ui.147adbe910a7")}
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>

      {/* 终端内容区 */}
      {!collapsed && (
        <div className="p-3 font-mono text-[10.5px] leading-relaxed max-h-32 overflow-y-auto space-y-1 select-text">
          {logs.length === 0 ? (
            <div className="text-slate-500 italic">{t("ui.ed75a6aa9127")}</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-500 flex-shrink-0 select-none">
                  [{log.time}]
                </span>
                <span
                  className={cn(
                    "px-1 py-0.2 rounded text-[9.5px] font-bold flex-shrink-0",
                    log.type === "success" &&
                      "bg-emerald-500/20 text-emerald-300",
                    log.type === "match" && "bg-cyan-500/20 text-cyan-300",
                    log.type === "scan" && "bg-blue-500/20 text-blue-300",
                    log.type === "warn" && "bg-amber-500/20 text-amber-300",
                    log.type === "error" && "bg-red-500/20 text-red-300",
                    log.type === "info" && "bg-slate-700 text-slate-300",
                  )}
                >
                  [{log.tag}]
                </span>
                <span
                  className={cn(
                    "break-all",
                    log.type === "error"
                      ? "text-red-300"
                      : log.type === "success"
                        ? "text-emerald-300"
                        : log.type === "match"
                          ? "text-cyan-200"
                          : "text-slate-300",
                  )}
                >
                  {log.text}
                </span>
              </div>
            ))
          )}
          {isRunning && (
            <div className="flex items-center gap-1 text-cyan-400 animate-pulse pt-0.5">
              <span>›</span>
              <span className="w-1.5 h-3 bg-cyan-400 inline-block animate-pulse" />
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>
      )}
    </div>
  );
}

// ── 竖直进度条单节点展示组件 ──
function StepIndicatorNode({
  stepNumber,
  title,
  subtitle,
  status,
  isActive,
  subProgress,
  onClick,
}: {
  stepNumber: number;
  title: string;
  subtitle: string;
  status: StepStatus;
  isActive: boolean;
  subProgress?: number;
  onClick: () => void;
}) {
  useLocale();
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 relative z-10 cursor-pointer group transition-all",
        isActive ? "opacity-100" : "opacity-80 hover:opacity-100",
      )}
    >
      {/* 节点圆形徽标 */}
      <div
        className={cn(
          "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all duration-300 shadow-sm",
          status === "success" &&
            "bg-emerald-500 text-white ring-4 ring-emerald-500/20",
          status === "running" &&
            "bg-blue-600 text-white ring-4 ring-blue-500/25 animate-pulse",
          status === "error" && "bg-red-500 text-white ring-4 ring-red-500/20",
          status === "pending" &&
            "bg-white border-2 border-slate-300 text-slate-500 dark:bg-[#161926] dark:border-white/20 dark:text-gray-400",
        )}
      >
        {status === "success" ? (
          <CheckCircle2 size={16} />
        ) : status === "running" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : status === "error" ? (
          <XCircle size={16} />
        ) : (
          <span>{stepNumber}</span>
        )}
      </div>

      {/* 节点文案 */}
      <div className="flex flex-col pt-0.5 flex-1 min-w-0">
        <span
          className={cn(
            "text-xs font-bold transition-colors leading-tight",
            isActive
              ? "text-blue-600 dark:text-cyan-400"
              : status === "success"
                ? "text-slate-800 dark:text-gray-200"
                : "text-slate-600 dark:text-gray-400",
          )}
        >
          {title}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-gray-500 mt-0.5">
          {subtitle}
        </span>
        {status === "running" && subProgress !== undefined && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-[9.5px] font-mono font-bold text-blue-600 dark:text-cyan-400">
              {Math.round(subProgress)}%
            </span>
            <div className="w-16 h-1 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                style={{ width: `${subProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
