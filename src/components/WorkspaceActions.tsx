import { useState } from "react";
import { Terminal, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t, useLocale } from "../lib/i18n";
import { desktopInvoke, type Agent } from "../lib/desktop-tools";
import { buttonClass } from "./AccountDataUI";

export default function WorkspaceActions({ agent }: { agent: Agent }) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const cli = agent === "codex" || agent === "claude";
  const launch = async () => {
    setBusy(true);
    try {
      const result = await desktopInvoke<string>("launch_app", {
        appType: agent,
        customPath: null,
      });
      toast.success(result);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      data-workspace-launch={agent}
      className={buttonClass + " min-h-9 shrink-0 bg-white/70 dark:bg-white/5"}
      disabled={busy}
      aria-busy={busy}
      onClick={() => void launch()}
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : cli ? (
        <Terminal size={14} />
      ) : (
        <Play size={14} />
      )}
      {t(cli ? "feature.startTerminal" : "feature.startClient")}
    </button>
  );
}
