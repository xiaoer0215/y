import { useSyncExternalStore } from "react";
import { isLocale, type Locale } from "./locales";

export interface AppPreferences {
  locale: Locale;
  startPage: "workspace" | "keys" | "account";
  announcementPush: boolean;
  feishuWebhook: string;
}
const key = "ai-helper.preferences.v1";
// The public build ships with a feedback destination so users do not need to configure it.
// This is obfuscation only; rotate the bot if the published client is abused.
const embeddedFeishuWebhook =
  "HRsXHxdfAkkKFQEMTwUORAVZAEEAAUsKXQMLSAUSCBBETxlFWhlRQAwKQg1KAVMHBFNaGEUcFwxbWUlRTFVTSAUGA1RGGxUDRVZaDFZTTlVc";
const embeddedFeishuKey = "uocode-feedback-v1";
function decodeEmbeddedFeishuWebhook(): string {
  try {
    const encoded = atob(embeddedFeishuWebhook);
    const keyBytes = new TextEncoder().encode(embeddedFeishuKey);
    const bytes = Uint8Array.from(encoded, (char, index) =>
      char.charCodeAt(0) ^ keyBytes[index % keyBytes.length],
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}
const compiledFeishuWebhook =
  typeof import.meta.env.VITE_FEISHU_WEBHOOK === "string"
    ? import.meta.env.VITE_FEISHU_WEBHOOK.trim().slice(0, 512)
    : decodeEmbeddedFeishuWebhook();
const defaults: AppPreferences = {
  locale: "en",
  startPage: "workspace",
  announcementPush: true,
  feishuWebhook: compiledFeishuWebhook,
};
let cached: AppPreferences | undefined;
const listeners = new Set<() => void>();
function read(): AppPreferences {
  if (cached) return cached;
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}");
    cached = {
      locale: isLocale(raw.locale) ? raw.locale : defaults.locale,
      startPage: ["workspace", "keys", "account"].includes(raw.startPage)
        ? raw.startPage
        : "workspace",
      announcementPush:
        typeof raw.announcementPush === "boolean" ? raw.announcementPush : true,
      feishuWebhook:
        typeof raw.feishuWebhook === "string" && raw.feishuWebhook.trim()
          ? raw.feishuWebhook.trim().slice(0, 512)
          : compiledFeishuWebhook,
    };
  } catch {
    cached = { ...defaults };
  }
  return cached!;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, read);
  return { preferences, setPreferences: updatePreferences };
}
export function updatePreferences(patch: Partial<AppPreferences>) {
  if (patch.locale !== undefined && !isLocale(patch.locale)) {
    throw new Error("Unsupported locale");
  }
  const next = { ...read(), ...patch };
  localStorage.setItem(key, JSON.stringify(next));
  cached = next;
  listeners.forEach((listener) => listener());
}
export function getPreferences() {
  return read();
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      cached = undefined;
      listeners.forEach((listener) => listener());
    }
  });
