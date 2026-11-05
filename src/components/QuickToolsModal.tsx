import { t, useLocale } from "../lib/i18n";
import { useEffect, useState } from "react";
import {
  X,
  Terminal,
  BookOpen,
  Key,
  Copy,
  Check,
  ExternalLink,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import { openUrl } from "../lib/api";
import {
  OpenAIIcon,
  ClaudeIcon,
  WorkbuddyIcon,
  AccioWorkIcon,
} from "./BrandIcons";
import { ThemeToggle } from "./ThemeToggle";
import SegmentedTabs from "./ui/SegmentedTabs";

interface QuickToolsModalProps {
  open: boolean;
  onClose: () => void;
  activeTab: "chatgpt" | "claude" | "workbuddy" | "acciowork";
  currentUrl: string;
  currentKey: string;
  currentModel: string;
  showKeys: () => void;
}

export function QuickToolsModal({
  open,
  onClose,
  activeTab,
  currentUrl,
  currentKey,
  currentModel,
  showKeys,
}: QuickToolsModalProps) {
  useLocale();
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<
    "chatgpt" | "claude" | "workbuddy" | "acciowork"
  >(activeTab);

  useEffect(() => {
    setSelectedProtocol(activeTab);
  }, [activeTab, open]);

  if (!open) return null;

  const effectiveKey = currentKey || "YOUR_API_KEY";
  const effectiveModel =
    currentModel ||
    (selectedProtocol === "claude"
      ? "claude-3-7-sonnet-20250219"
      : selectedProtocol === "workbuddy"
        ? "gpt-5.6-sol"
        : selectedProtocol === "acciowork"
          ? "claude-3-7-sonnet"
          : "gpt-4o");
  const base = currentUrl.endsWith("/") ? currentUrl : `${currentUrl}/`;

  const curlCommand =
    selectedProtocol === "claude"
      ? `curl ${base}v1/messages \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${effectiveKey}" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -d '{\n    "model": "${effectiveModel}",\n    "max_tokens": 100,\n    "messages": [{"role": "user", "content": "Hi!"}]\n  }'`
      : selectedProtocol === "acciowork"
        ? t("ui.99a13ecad32c", {
            v0: base,
            v1: effectiveKey,
            v2: effectiveModel,
          })
        : `curl ${base}v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${effectiveKey}" \\\n  -d '{\n    "model": "${effectiveModel}",\n    "messages": [{"role": "user", "content": "Hi!"}]\n  }'`;

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      toast.success(t("ui.0d8629d8af9c"));
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      toast.error(t("ui.f2c6b5167b9a"));
    }
  };

  return (
    <div className="fixed inset-0 top-11 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="quick-tools-dialog relative flex max-h-full min-h-0 w-full max-w-2xl flex-col rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121420] text-slate-800 dark:text-gray-200 shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#161927]">
          <div className="flex items-center gap-2">
            <Terminal size={17} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("ui.3bcc1a392e35")}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="quick-tools-content min-h-0 p-5 space-y-4 overflow-y-auto">
          {/* Section 0: Theme Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-gray-300 flex items-center gap-1.5">
                <Palette size={14} className="text-blue-500" />
                {t("ui.149791dc60fe")}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-gray-400">
              {t("ui.9b1f0046c724")}
            </p>
            <ThemeToggle variant="pills" className="w-full justify-between" />
          </div>

          {/* Section 1: cURL Test snippet */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-gray-300">
                <Terminal
                  size={13}
                  className="shrink-0 text-emerald-600 dark:text-emerald-400"
                />
                {t("ui.36b58db2710c")}
              </span>
              <button
                type="button"
                onClick={handleCopyCurl}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700 hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
              >
                {copiedCurl ? <Check size={12} /> : <Copy size={12} />}
                {copiedCurl ? t("ui.e381a5763d5f") : t("ui.3ac2a7773b34")}
              </button>
            </div>
            <SegmentedTabs
              label={t("ui.36b58db2710c")}
              value={selectedProtocol}
              change={(id) =>
                setSelectedProtocol(id as typeof selectedProtocol)
              }
              className="w-full"
              tabs={[
                {
                  id: "chatgpt",
                  label: "OpenAI",
                  icon: <OpenAIIcon size={13} />,
                },
                {
                  id: "claude",
                  label: "Claude",
                  icon: <ClaudeIcon size={13} />,
                },
                {
                  id: "workbuddy",
                  label: "WorkBuddy",
                  icon: <WorkbuddyIcon size={13} />,
                },
                {
                  id: "acciowork",
                  label: "Accio Work",
                  icon: <AccioWorkIcon size={13} />,
                },
              ]}
            />
            <pre className="p-3 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/5 font-mono text-[11px] text-slate-800 dark:text-gray-300 overflow-x-auto leading-relaxed">
              {curlCommand}
            </pre>
          </div>

          {/* Section 2: Environment Variables Reference */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-300 flex items-center gap-1.5">
              <Key size={13} className="text-amber-600 dark:text-amber-400" />
              {t("ui.62184aa07a21")}
            </span>
            <div className="text-xs text-slate-600 dark:text-gray-400 space-y-2 break-words [overflow-wrap:anywhere] bg-slate-50 dark:bg-[#161928]/60 p-3 rounded-xl border border-slate-200 dark:border-white/5">
              <p>
                •{" "}
                <strong className="text-slate-800 dark:text-gray-200">
                  ChatGPT (Codex)
                </strong>
                {t("ui.3014aa624f08")}{" "}
                <code className="text-blue-600 dark:text-blue-300 font-mono font-medium">
                  CUSTOM_OPENAI_API_KEY
                </code>
                。
              </p>
              <p>
                •{" "}
                <strong className="text-slate-800 dark:text-gray-200">
                  Claude Code
                </strong>
                {t("ui.75eac9eecfe1")}{" "}
                <code className="text-amber-600 dark:text-amber-300 font-mono font-medium">
                  ~/.claude/settings.json
                </code>{" "}
                {t("ui.65fb8b0d84e8")}
                <code className="font-mono">env.ANTHROPIC_AUTH_TOKEN</code>。
              </p>
              <p>
                •{" "}
                <strong className="text-slate-800 dark:text-gray-200">
                  WorkBuddy
                </strong>
                {t("ui.6606e6d868f8")}{" "}
                <code className="text-emerald-600 dark:text-emerald-300 font-mono font-medium">
                  ~/.workbuddy/models.json
                </code>
                {t("ui.dc47ea7fc2a0")}
              </p>
              <p className="text-slate-400 dark:text-gray-500 text-[11px]">
                {t("ui.9f865e4a8ee1")}
              </p>
            </div>
          </div>

          {/* Section 3: Official Links */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <span className="text-xs font-semibold text-slate-700 dark:text-gray-300 flex items-center gap-1.5">
              <BookOpen
                size={13}
                className="text-purple-600 dark:text-purple-400"
              />
              {t("ui.53297f595ad5")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="https://www.uocode.com"
                onClick={(e) => {
                  e.preventDefault();
                  void openUrl("https://www.uocode.com");
                }}
                target="_blank"
                rel="noreferrer"
                title={t("ui.50f99ade30b4")}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] border border-slate-200 dark:border-white/5 text-xs text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>{t("ui.6cdd5c193a70")}</span>
                <ExternalLink
                  size={12}
                  className="text-slate-400 dark:text-gray-500"
                />
              </a>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  showKeys();
                }}
                title={t("ui.abaf5ad85cd6")}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] border border-slate-200 dark:border-white/5 text-xs text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>{t("ui.d1a5f199dbfd")}</span>
                <Key size={12} className="text-slate-400 dark:text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141724] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium text-white transition-colors shadow-sm"
          >
            {t("ui.33246f6a5e5b")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuickToolsModal;
