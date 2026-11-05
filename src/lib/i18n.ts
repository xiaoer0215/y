import { createInstance } from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { getPreferences, usePreferences } from "./preferences";
import { isLocale } from "./locales";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { brandText, BRAND } from "./brand";

const files = import.meta.glob<Record<string, string>>(
  [
    "../locales/*.json",
    "../locales/features/*.json",
    "../locales/tickets/*.json",
    "../locales/account/*.json",
  ],
  {
    eager: true,
    import: "default",
  },
);
const resources: Record<string, { translation: Record<string, string> }> = {};
for (const [path, translation] of Object.entries(files)) {
  const code = path
    .split("/")
    .pop()!
    .replace(/\.json$/, "");
  if (isLocale(code))
    resources[code] = {
      translation: {
        ...resources[code]?.translation,
        ...Object.fromEntries(Object.entries(translation).map(([key, value]) => [key, brandText(value)])),
      },
    };
}

export const i18n = createInstance();
void i18n.use(initReactI18next).init({
  resources,
  lng: getPreferences().locale,
  fallbackLng: "en",
  supportedLngs: Object.keys(resources),
  load: "currentOnly",
  initAsync: false,
  keySeparator: false,
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function t(key: string, values?: Record<string, unknown>): string {
  return i18n.t(key, values ?? {}) as string;
}
export function getLocale(): string {
  return i18n.resolvedLanguage ?? "en";
}
// Every localized component subscribes, including portals and memoized children.
export function useLocale(): string {
  useTranslation(undefined, { i18n });
  return getLocale();
}
export function LocaleSync() {
  const { preferences } = usePreferences();
  useEffect(() => {
    document.title = BRAND.productName;
    void i18n.changeLanguage(preferences.locale);
    document.documentElement.lang = preferences.locale;
    if ("__TAURI_INTERNALS__" in window) {
      void invoke("set_native_locale", { locale: preferences.locale }).catch(
        (error) => console.error("Failed to update tray language", error),
      );
    }
  }, [preferences.locale]);
  return null;
}
