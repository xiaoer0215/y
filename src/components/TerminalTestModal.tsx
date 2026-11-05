import { t, useLocale } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Terminal,
  Check,
  Copy,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Clock,
  RotateCcw,
} from "lucide-react";
import {
  OpenAIIcon,
  ClaudeIcon,
  WorkbuddyIcon,
  AccioWorkIcon,
} from "./BrandIcons";
import { toast } from "sonner";
import {
  setCodexConfig,
  setClaudeConfig,
  setWorkbuddyConfig,
  setAccioConfig,
  testCodexStream,
  testClaudeStream,
  testWorkbuddyStream,
  testAccioStream,
  startAccioBridge,
  checkAppProcessStatus,
  restartTargetApp,
} from "../lib/api";
import type {
  TestStreamEvent,
  WorkbuddySavePayload,
  AccioConfig,
} from "../types";

export interface TerminalTestModalProps {
  open: boolean;
  onClose: () => void;
  type: "codex" | "claude" | "workbuddy" | "acciowork";
  url: string;
  apiKey: string;
  model: string;
  workbuddyPayload?: WorkbuddySavePayload;
  accioPayload?: AccioConfig;
  onSuccess?: () => void;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warn" | "error" | "response" | "dim";
  text: string;
}

export function TerminalTestModal({
  open,
  onClose,
  type,
  url,
  apiKey,
  model,
  workbuddyPayload,
  accioPayload,
  onSuccess,
}: TerminalTestModalProps) {
  useLocale();
  const [status, setStatus] = useState<"running" | "success" | "error">(
    "running",
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // 重启与进程检测状态
  const [chatgptRunning, setChatgptRunning] = useState(false);
  const [codexRunning, setCodexRunning] = useState(false);
  const [claudeRunning, setClaudeRunning] = useState(false);
  const [workbuddyRunning, setWorkbuddyRunning] = useState(false);
  const [accioRunning, setAccioRunning] = useState(false);
  const [restartingTarget, setRestartingTarget] = useState<string | null>(null);
  const [showRestartCard, setShowRestartCard] = useState(false);

  const terminalRef = useRef<HTMLDivElement | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const hasStartedRef = useRef(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const getNowTime = () => {
    const now = new Date();
    return now.toTimeString().split(" ")[0];
  };

  const addLog = (
    text: string,
    level: "info" | "success" | "warn" | "error" | "response" | "dim" = "info",
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: getNowTime(),
        level,
        text,
      },
    ]);
  };

  // 自动滚动到终端底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, streamingText]);

  // 倒计时自动关闭逻辑
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      onClose();
      return;
    }
    countdownTimerRef.current = window.setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => {
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
    };
  }, [countdown, onClose]);

  const handleRestart = async (
    target: "chatgpt" | "codex" | "claude" | "workbuddy" | "acciowork",
  ) => {
    setRestartingTarget(target);
    const targetName =
      target === "chatgpt"
        ? t("ui.2cb0d4896943")
        : target === "codex"
          ? "Codex CLI"
          : target === "workbuddy"
            ? t("ui.238e347595b1")
            : target === "acciowork"
              ? t("ui.cf2c91a165a5")
              : "Claude Code CLI";

    addLog(t("ui.dc346a04c164", { v0: targetName }), "info");
    try {
      const result = await restartTargetApp(target);
      addLog(`✓ ${result}`, "success");
      addLog(t("ui.a482080772a9"), "dim");
      if (target === "chatgpt") setChatgptRunning(true);
      if (target === "codex") setCodexRunning(true);
      if (target === "claude") setClaudeRunning(true);
      if (target === "workbuddy") setWorkbuddyRunning(true);
      if (target === "acciowork") setAccioRunning(true);
      toast.success(t("ui.81ed4086628d", { v0: targetName }));
      setCountdown(5);
    } catch (err) {
      addLog(t("ui.08f09987777f", { v0: err }), "error");
      toast.error(t("ui.f17c8ef1c7b6", { v0: err }));
    } finally {
      setRestartingTarget(null);
    }
  };

  const runTestAndSave = async () => {
    hasStartedRef.current = true;
    // 重置状态
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    setStatus("running");
    setShowRestartCard(false);
    setRestartingTarget(null);
    setLogs([]);
    setStreamingText("");
    setLatency(null);
    setStatusCode(null);

    const platformName =
      type === "codex"
        ? "ChatGPT (Codex)"
        : type === "workbuddy"
          ? "WorkBuddy"
          : type === "acciowork"
            ? "Accio Work"
            : "Claude Code";
    // Accio Work 根据模型名前缀自动检测使用的协议（与 Rust 端 detect_accio_model_protocol 保持一致）
    const detectAccioProtocol = (m: string): string => {
      const lower = m.trim().toLowerCase();
      if (lower.startsWith("claude"))
        return "Anthropic Messages → Accio Gemini Bridge";
      const oaiPrefixes = [
        "gpt-4o",
        "gpt-4",
        "gpt-3.5",
        "gpt-5",
        "o1-",
        "o3-",
        "o4-",
        "codex-",
        "chatgpt-",
      ];
      if (oaiPrefixes.some((p) => lower.startsWith(p)))
        return "OpenAI Responses → Accio Gemini Bridge";
      return "OpenAI Chat Completions → Accio Gemini Bridge";
    };
    const protocolName =
      type === "codex"
        ? "OpenAI Responses Protocol"
        : type === "workbuddy"
          ? "OpenAI Chat Completions Protocol"
          : type === "acciowork"
            ? detectAccioProtocol(model)
            : "Anthropic Messages Protocol";

    addLog(t("ui.f48cb1d604d8", { v0: platformName }), "info");
    addLog(t("ui.1934e31fc47a", { v0: protocolName }), "dim");
    addLog(t("ui.6b6c8d46b9a1", { v0: url }), "dim");
    addLog(t("ui.f7e20a803055", { v0: model }), "dim");

    try {
      let testSuccess = false;

      const handleEvent = (event: TestStreamEvent) => {
        if (event.type === "log") {
          addLog(
            event.data.text.startsWith("probe.")
              ? t(event.data.text)
              : event.data.text,
            event.data.level,
          );
        } else if (event.type === "chunk") {
          setStreamingText((prev) => prev + event.data.delta);
        } else if (event.type === "finish") {
          testSuccess = event.data.success;
          setLatency(event.data.latency_ms);
          if (event.data.status_code) {
            setStatusCode(event.data.status_code);
          }
        }
      };

      let testResult;
      if (type === "codex") {
        testResult = await testCodexStream(
          url,
          apiKey.trim(),
          model.trim(),
          handleEvent,
        );
      } else if (type === "workbuddy") {
        testResult = await testWorkbuddyStream(
          url,
          apiKey.trim(),
          model.trim(),
          handleEvent,
        );
      } else if (type === "acciowork") {
        testResult = await testAccioStream(
          url,
          apiKey.trim(),
          model.trim(),
          handleEvent,
        );
      } else {
        testResult = await testClaudeStream(
          url,
          apiKey.trim(),
          model.trim(),
          handleEvent,
        );
      }

      if (testResult.latencyMs !== undefined && testResult.latencyMs !== null) {
        setLatency(testResult.latencyMs);
      }
      if (
        testResult.statusCode !== undefined &&
        testResult.statusCode !== null
      ) {
        setStatusCode(testResult.statusCode);
      }
      testSuccess = testResult.success;

      if (testSuccess) {
        // 保存配置
        if (type === "codex") {
          addLog(t("ui.55400d9ca8a0"), "info");
          await setCodexConfig(url, apiKey.trim(), model.trim());
          addLog(t("ui.1743de0823d3"), "success");
          addLog(t("ui.7f341950da29"), "success");
        } else if (type === "workbuddy") {
          addLog(t("ui.b7cdd8dfea6f"), "info");
          if (workbuddyPayload) {
            await setWorkbuddyConfig(workbuddyPayload);
          } else {
            await setWorkbuddyConfig({
              url,
              api_key: apiKey.trim(),
              model: model.trim(),
              supports_tool_call: true,
              supports_images: true,
              supports_reasoning: true,
              only_reasoning: false,
              can_disable_thinking: true,
              use_custom_protocol: false,
              default_effort: null,
              supported_efforts: ["medium"],
              max_input_tokens: 32768,
              max_output_tokens: 32768,
            });
          }
          addLog(t("ui.d2c55efeae82"), "success");
          addLog(t("ui.6e6f60fcdbe9"), "info");
        } else if (type === "acciowork") {
          addLog(t("ui.4c37762c5859"), "info");
          const payload: AccioConfig = accioPayload || {
            base_url: url,
            api_key: apiKey.trim(),
            model: model.trim(),
            bridge_port: 8787,
            official_gateway: "https://phoenix-gw.alibaba.com",
            fallback_official: false,
            prevent_official_leak: true,
          };
          await setAccioConfig(payload);
          addLog(t("ui.7b0abb529a80"), "success");
          addLog(t("ui.4e725611b220"), "info");
          try {
            const port = await startAccioBridge(payload.bridge_port);
            addLog(t("ui.47b575e2c444", { v0: port }), "success");
          } catch (bridgeErr) {
            addLog(t("ui.c40de11e7ee5", { v0: bridgeErr }), "warn");
          }
        } else {
          addLog(t("ui.4c969bafc4d1"), "info");
          await setClaudeConfig(url, apiKey.trim(), model.trim());
          addLog(t("ui.3e53d245355d"), "success");
          addLog(t("ui.3f4336c50571"), "success");
        }

        // 探测目标客户端运行状态
        addLog(t("ui.f1142ac6d81a"), "dim");
        let anyRunning = false;
        if (type === "codex") {
          const [gRun, xRun] = await Promise.all([
            checkAppProcessStatus("chatgpt").catch(() => false),
            checkAppProcessStatus("codex").catch(() => false),
          ]);
          setChatgptRunning(gRun);
          setCodexRunning(xRun);
          anyRunning = gRun || xRun;
          if (gRun) addLog(t("ui.73b06d817b8f"), "info");
          if (xRun) addLog(t("ui.8594cf87fe95"), "info");
          if (!gRun && !xRun) addLog(t("ui.ad0c9582824b"), "dim");
        } else if (type === "workbuddy") {
          const wbRun = await checkAppProcessStatus("workbuddy").catch(
            () => false,
          );
          setWorkbuddyRunning(wbRun);
          anyRunning = wbRun;
          if (wbRun) addLog(t("ui.39352c660188"), "info");
          else addLog(t("ui.3ffd8a8ade16"), "dim");
        } else if (type === "acciowork") {
          const aRun = await checkAppProcessStatus("acciowork").catch(
            () => false,
          );
          setAccioRunning(aRun);
          anyRunning = aRun;
          if (aRun) addLog(t("ui.d52c7c6e911e"), "info");
          else addLog(t("ui.d68b04c5e917"), "dim");
        } else {
          const cRun = await checkAppProcessStatus("claude").catch(() => false);
          setClaudeRunning(cRun);
          anyRunning = cRun;
          if (cRun) addLog(t("ui.424fe6422296"), "info");
          else addLog(t("ui.53d87060c4f4"), "dim");
        }

        if (!openRef.current) return;

        if (!anyRunning) {
          // 当前未在运行客户端，无需强制重启，8秒后自动关闭
          setCountdown(8);
        }

        addLog(t("ui.df2699bb3445"), "info");
        setStatus("success");
        setShowRestartCard(true);
        onSuccess?.();
        toast.success(t("ui.685ae331faaf", { v0: platformName }));
      } else {
        if (!openRef.current) return;
        setStatus("error");
        addLog(t("ui.38d842416fa6"), "error");
        toast.error(t("ui.754563f27049"));
      }
    } catch (err) {
      if (!openRef.current) return;
      setStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      addLog(t("ui.8a7023cbeda0", { v0: msg }), "error");
      addLog(t("ui.d5debf6f1784"), "error");
      toast.error(t("ui.deb96a26d2b3", { v0: msg }));
    }
  };

  useEffect(() => {
    if (open) {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        void runTestAndSave();
      }
    } else {
      hasStartedRef.current = false;
      setShowRestartCard(false);
      setRestartingTarget(null);
      setCountdown(null);
      setLogs([]);
      setStreamingText("");
      setLatency(null);
      setStatusCode(null);
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCopyLogs = async () => {
    try {
      const fullText = logs
        .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.text}`)
        .join("\n");
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      toast.success(t("ui.bb7d9450dcf5"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("ui.f2c6b5167b9a"));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 top-11 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700/80 dark:border-white/10 bg-[#0d1117] text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up">
        {/* ── 顶部终端装饰标题栏 (macOS 风格) ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* macOS 红黄绿圆点 */}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]/60 shadow-xs inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]/60 shadow-xs inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]/60 shadow-xs inline-block" />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
              <Terminal size={14} className="text-blue-400" />
              <span className="font-semibold text-slate-200">
                {t("message.97f694d8b939", {
                  v0:
                    type === "codex"
                      ? "Codex"
                      : type === "workbuddy"
                        ? "WorkBuddy"
                        : type === "acciowork"
                          ? "Accio Work"
                          : "Claude Code",
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {latency !== null && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Clock size={11} />
                <span>{latency}ms</span>
              </span>
            )}
            {statusCode !== null && (
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  statusCode >= 200 && statusCode < 300
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                }`}
              >
                HTTP {statusCode}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title={t("ui.51daeffe4774")}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── 终端输出面板 ── */}
        <div className="relative flex-1 bg-[#090d13] p-4 overflow-hidden flex flex-col min-h-[260px]">
          {/* 一键复制浮动按钮 */}
          <button
            type="button"
            onClick={handleCopyLogs}
            className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-slate-300 hover:text-white text-xs font-mono border border-[#30363d] shadow-sm transition-all"
            title={t("ui.84e58fd9200c")}
          >
            {copied ? (
              <>
                <Check size={12} className="text-emerald-400" />
                <span className="text-emerald-400">{t("ui.e381a5763d5f")}</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>{t("ui.c4a79c3aa684")}</span>
              </>
            )}
          </button>

          {/* 终端滚屏区 */}
          <div
            ref={terminalRef}
            className="flex-1 overflow-y-auto pr-2 font-mono text-xs sm:text-[13px] leading-relaxed select-text space-y-1"
          >
            {logs.map((log) => {
              let colorClass = "text-slate-300";
              if (log.level === "info") colorClass = "text-[#58a6ff]";
              else if (log.level === "success")
                colorClass = "text-[#3fb950] font-medium";
              else if (log.level === "warn") colorClass = "text-[#d29922]";
              else if (log.level === "error")
                colorClass = "text-[#f85149] font-medium";
              else if (log.level === "response") colorClass = "text-[#a5d6ff]";
              else if (log.level === "dim") colorClass = "text-[#8b949e]";

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2.5 break-all"
                >
                  <span className="text-[#484f58] select-none text-[11px] shrink-0 pt-0.5">
                    [{log.timestamp}]
                  </span>
                  <span className={colorClass}>{log.text}</span>
                </div>
              );
            })}

            {/* 流式增量内容预览 */}
            {streamingText && (
              <div className="flex items-start gap-2.5 break-all text-[#3fb950] bg-emerald-950/20 p-2 rounded border border-emerald-900/40 my-1">
                <span className="text-[#484f58] select-none text-[11px] shrink-0 pt-0.5">
                  [{getNowTime()}]
                </span>
                <div className="whitespace-pre-wrap flex-1">
                  <span>{streamingText}</span>
                  {status === "running" && (
                    <span className="inline-block w-2 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            )}

            {/* 运行中终端光标 */}
            {status === "running" && !streamingText && (
              <div className="flex items-center gap-2 pt-1 text-[#8b949e]">
                <span className="text-[#484f58] text-[11px]">
                  [{getNowTime()}]
                </span>
                <span className="text-yellow-400">{t("ui.bfb193459a8e")}</span>
                <span className="inline-block w-2 h-3.5 bg-yellow-400 animate-pulse align-middle" />
              </div>
            )}
          </div>
        </div>

        {/* ── 客户端重启确认引导面板 ── */}
        {status === "success" && showRestartCard && (
          <div className="bg-[#161b22] border-t border-[#30363d] px-5 py-3.5 flex flex-col gap-2.5 flex-shrink-0 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw size={14} className="text-amber-400" />
                <span className="text-xs font-semibold text-slate-200">
                  {t("ui.f9b86bce0394")}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                {type === "codex"
                  ? chatgptRunning || codexRunning
                    ? t("ui.28b40b0fe4fb")
                    : t("ui.84e2302aa3a5")
                  : type === "workbuddy"
                    ? workbuddyRunning
                      ? t("ui.47a6da337257")
                      : t("ui.84e2302aa3a5")
                    : type === "acciowork"
                      ? accioRunning
                        ? t("ui.39c765fede2b")
                        : t("ui.84e2302aa3a5")
                      : claudeRunning
                        ? t("ui.99707caa56ad")
                        : t("ui.84e2302aa3a5")}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
              <div className="flex items-center gap-2 flex-wrap">
                {type === "codex" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleRestart("chatgpt")}
                      disabled={restartingTarget !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                      title={t("ui.28881043acf5")}
                    >
                      {restartingTarget === "chatgpt" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <OpenAIIcon size={13} />
                      )}
                      <span>
                        {chatgptRunning
                          ? t("ui.17aac127db67")
                          : t("ui.92e1f8464168")}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleRestart("codex")}
                      disabled={restartingTarget !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                      title={t("ui.f1654bee1b18")}
                    >
                      {restartingTarget === "codex" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Terminal size={13} />
                      )}
                      <span>
                        {codexRunning
                          ? t("ui.d52b6a23c5ae")
                          : t("ui.d2cee6b50ee0")}
                      </span>
                    </button>
                  </>
                ) : type === "workbuddy" ? (
                  <button
                    type="button"
                    onClick={() => void handleRestart("workbuddy")}
                    disabled={restartingTarget !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                    title={t("ui.0ae4f9efc764")}
                  >
                    {restartingTarget === "workbuddy" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <WorkbuddyIcon size={13} />
                    )}
                    <span>
                      {workbuddyRunning
                        ? t("ui.0ae4f9efc764")
                        : t("ui.0cbcd0104964")}
                    </span>
                  </button>
                ) : type === "acciowork" ? (
                  <button
                    type="button"
                    onClick={() => void handleRestart("acciowork")}
                    disabled={restartingTarget !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                    title={t("ui.e0f47371ec38")}
                  >
                    {restartingTarget === "acciowork" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <AccioWorkIcon size={13} />
                    )}
                    <span>
                      {accioRunning
                        ? t("ui.0b55da31ff5b")
                        : t("ui.a1074b0bd0d3")}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleRestart("claude")}
                    disabled={restartingTarget !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                    title={t("ui.1623c103096f")}
                  >
                    {restartingTarget === "claude" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <ClaudeIcon size={13} />
                    )}
                    <span>
                      {claudeRunning
                        ? t("ui.f4c03db2cf50")
                        : t("ui.c929987d5a5f")}
                    </span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  toast.info(t("ui.74702223fcc3"));
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {t("ui.ff72a4f2a62f")}
              </button>
            </div>
          </div>
        )}

        {/* ── 底部操作与状态状态栏 ── */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#161b22] border-t border-[#30363d] flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            {status === "running" && (
              <>
                <Loader2 size={16} className="animate-spin text-blue-400" />
                <span className="text-slate-300">{t("ui.ecb9ba66c1f3")}</span>
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-emerald-400 font-medium">
                  {t("ui.f65f16c34ec6")}
                </span>
              </>
            )}
            {status === "error" && (
              <>
                <XCircle size={16} className="text-rose-400" />
                <span className="text-rose-400 font-medium">
                  {t("ui.f5ce87595c83")}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {status === "error" && (
              <button
                type="button"
                onClick={runTestAndSave}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm"
              >
                <RefreshCw size={13} />
                <span>{t("ui.3c2358b2ec16")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors bg-[#21262d] hover:bg-[#30363d] text-slate-300 hover:text-white border border-[#30363d] cursor-pointer"
            >
              {status === "success"
                ? countdown !== null
                  ? t("ui.06fb010bba09", { v0: countdown })
                  : t("ui.33246f6a5e5b")
                : status === "running"
                  ? t("common.cancel")
                  : t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TerminalTestModal;
