import { useEffect, useRef, useState } from "react";
import { t, useLocale } from "../lib/i18n";
import { isTauri } from "../lib/api";
import {
  agentNames,
  desktopInvoke,
  type Agent,
  type Fingerprint,
} from "../lib/desktop-tools";
import { buttonClass } from "./AccountDataUI";

export function useConfigReload(agent: Agent, reload: () => unknown) {
  const callback = useRef(reload);
  callback.current = reload;
  useEffect(() => {
    const handle = (e: Event) => {
      if ((e as CustomEvent).detail === agent) void callback.current();
    };
    window.addEventListener("reload-workspace-config", handle);
    return () => window.removeEventListener("reload-workspace-config", handle);
  }, [agent]);
}
export default function ConfigChangeNotice() {
  useLocale();
  const [changed, setChanged] = useState<Agent[]>([]);
  useEffect(() => {
    if (!isTauri) return;
    let active = true,
      busy = false;
    let baseline: Fingerprint[] | null = null;
    let revision = 0;
    const poll = async (resetAgent?: Agent) => {
      if (busy && !resetAgent) return;
      const current = ++revision;
      busy = true;
      try {
        const next = await desktopInvoke<Fingerprint[]>("config_fingerprints");
        if (!active || current !== revision) return;
        if (baseline) {
          const previous = new Map(baseline.map((f) => [f.path, f.version]));
          const changes = next
            .filter(
              (f) =>
                f.version !== previous.get(f.path) && f.agent !== resetAgent,
            )
            .map((f) => f.agent);
          if (changes.length) {
            setChanged((old) => [...new Set([...old, ...changes])]);
            window.dispatchEvent(new Event("workspace-config-changed"));
          }
        }
        baseline = next;
        if (resetAgent)
          setChanged((old) => old.filter((a) => a !== resetAgent));
      } catch {
      } finally {
        if (current === revision) busy = false;
      }
    };
    const saved = (e: Event) => void poll((e as CustomEvent<Agent>).detail);
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    window.addEventListener("local-config-saved", saved);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("local-config-saved", saved);
    };
  }, []);
  if (!changed.length) return null;
  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300"
      role="status"
    >
      <span>
        {t("feature.configChanged", {
          tools: changed.map((a) => agentNames[a]).join(", "),
        })}
      </span>
      <div className="flex gap-2">
        <button
          className={buttonClass}
          onClick={() => {
            changed.forEach((agent) =>
              window.dispatchEvent(
                new CustomEvent("reload-workspace-config", { detail: agent }),
              ),
            );
            setChanged([]);
          }}
        >
          {t("common.reload")}
        </button>
        <button className={buttonClass} onClick={() => setChanged([])}>
          {t("feature.later")}
        </button>
      </div>
    </div>
  );
}
