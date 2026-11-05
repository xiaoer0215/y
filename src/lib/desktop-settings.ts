import { t } from "./i18n";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./api";
export interface DesktopSettings {
  autostart: boolean;
  close_to_tray: boolean;
}
export async function getDesktopSettings(): Promise<DesktopSettings> {
  if (isTauri) return invoke("get_desktop_settings");
  return JSON.parse(
    localStorage.getItem("ai-helper.desktop-preview") ??
      '{"autostart":false,"close_to_tray":true}',
  );
}
export async function saveDesktopSettings(
  settings: DesktopSettings,
): Promise<void> {
  if (isTauri) await invoke("save_desktop_settings", { settings });
  else
    localStorage.setItem("ai-helper.desktop-preview", JSON.stringify(settings));
}
export async function checkUpstreamVersion(): Promise<{
  has_update: boolean;
  latest_version: string;
}> {
  if (!isTauri) throw Error(t("ui.dd5a8cf35f6f"));
  return invoke("check_for_updates");
}
