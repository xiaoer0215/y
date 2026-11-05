import { invoke } from "@tauri-apps/api/core";
import {
  getCodexConfig,
  getClaudeConfig,
  getWorkbuddyConfig,
  getAccioConfig,
  isTauri,
} from "./api";
import { t } from "./i18n";

export type Agent = "codex" | "claude" | "workbuddy" | "acciowork";
export const agentNames: Record<Agent, string> = {
  codex: "Codex",
  claude: "Claude Code",
  workbuddy: "WorkBuddy",
  acciowork: "Accio Work",
};
export type Fingerprint = {
  agent: Agent;
  path: string;
  version: string;
  exists: boolean;
};
export async function desktopInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri) throw Error(t("feature.desktopOnly"));
  return invoke<T>(command, args);
}
export async function workspaceCredentials(agent: Agent) {
  if (agent === "codex") {
    const c = await getCodexConfig();
    return { url: c.base_url, key: c.api_key, model: c.model };
  }
  if (agent === "claude") {
    const c = await getClaudeConfig();
    return { url: c.base_url, key: c.api_key, model: c.model };
  }
  if (agent === "workbuddy") {
    const c = await getWorkbuddyConfig();
    return { url: c.base_url, key: c.api_key, model: c.model };
  }
  const c = await getAccioConfig();
  return { url: c.base_url, key: c.api_key, model: c.model };
}
export function configSaved(agent: Agent) {
  window.dispatchEvent(
    new CustomEvent("local-config-saved", { detail: agent }),
  );
}
