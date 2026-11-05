import { useEffect, useState, useSyncExternalStore } from "react";
import { getSiteStatus } from "./api";
import { t, getLocale, useLocale } from "./i18n";
import type { SiteStatus } from "../types";
import { isSiteHost } from "./brand";

export interface GroupDisplayName {
  en?: string;
  zh?: string;
  zh_cn?: string;
  zh_tw?: string;
  description_en?: string;
}
export interface GroupInfo {
  desc?: string;
  ratio?: number;
  display_name?: GroupDisplayName;
  models?: string[];
}

// Match the website's two content languages, including its legacy aliases.
export function groupDisplayName(
  group: string,
  names?: GroupDisplayName,
  locale = getLocale(),
): string {
  return (
    (locale.startsWith("zh")
      ? names?.zh_tw?.trim() ||
        names?.zh?.trim() ||
        names?.zh_cn?.trim() ||
        names?.en?.trim()
      : names?.en?.trim()) || group
  );
}
export function groupDescription(
  info?: GroupInfo,
  names?: GroupDisplayName,
  locale = getLocale(),
): string {
  return (
    (locale.startsWith("zh")
      ? info?.desc
      : names?.description_en || info?.desc
    )?.trim() || ""
  );
}

export interface ApiEndpoint {
  url: string;
  isDefault: boolean;
}
export function parseApiEndpoints(value: unknown): ApiEndpoint[] {
  try {
    const items = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(items)) return [];
    const urls: string[] = [];
    for (const item of items) {
      const raw = typeof item === "string" ? item : item?.url;
      if (typeof raw !== "string") continue;
      let url: URL;
      try {
        url = new URL(raw.trim());
      } catch {
        continue;
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        isSiteHost(url.hostname)
      )
        continue;
      const normalized = url.href.replace(/\/+$/, "");
      if (!urls.includes(normalized)) urls.push(normalized);
      if (urls.length === 2) break;
    }
    return urls.map((url, index) => ({ url, isDefault: index === 0 }));
  } catch {
    return [];
  }
}
export function sameEndpoint(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

let status: SiteStatus | null = null;
let fetchedAt = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => status;
async function refreshSiteContent() {
  if (pending || Date.now() - fetchedAt < 60_000) return pending;
  pending = getSiteStatus()
    .then((value) => {
      status = value;
      fetchedAt = Date.now();
      listeners.forEach((listener) => listener());
    })
    .catch((error) => {
      console.warn("Failed to refresh site content", error);
      fetchedAt = Date.now();
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
export function useSiteContent() {
  const value = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => {
    void refreshSiteContent();
    const refresh = () => {
      void refreshSiteContent();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  return value;
}
export function useGroupDisplayName() {
  useLocale();
  const site = useSiteContent();
  return (group: string, info?: GroupInfo) =>
    groupDisplayName(
      group,
      info?.display_name ||
        site?.user_group_display_names_localized?.[group] ||
        (site?.user_group_display_names?.[group]
          ? { en: site.user_group_display_names[group] }
          : undefined),
    );
}

export function configuredEndpoint(
  value: string | undefined,
  endpoints: ApiEndpoint[],
): string {
  const root = (url: string) => url.replace(/\/+$/, "").replace(/\/v1$/, "");
  return (
    endpoints.find((item) => root(item.url) === root(value || ""))?.url ||
    endpoints[0]?.url ||
    ""
  );
}

export function useApiEndpointState(): [string, (value: string) => void] {
  const site = useSiteContent();
  const [preferred, setPreferred] = useState("");
  return [
    configuredEndpoint(preferred, parseApiEndpoints(site?.api_endpoints)),
    setPreferred,
  ];
}

export async function primaryApiEndpoint(): Promise<string> {
  await refreshSiteContent();
  const endpoint = parseApiEndpoints(status?.api_endpoints)[0]?.url;
  if (!endpoint) throw Error(t("feature.noApiEndpoints"));
  return endpoint;
}
