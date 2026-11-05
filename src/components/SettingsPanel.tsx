import { t, useLocale } from "../lib/i18n";
import { useEffect, useState } from "react";
import {
  Bell,
  Globe2,
  LayoutPanelLeft,
  Monitor,
  Moon,
  Sun,
  Power,
  PanelBottomClose,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { usePreferences, type AppPreferences } from "../lib/preferences";
import { useTheme, type Theme } from "./theme-provider";
import { cardClass, fieldClass } from "./AccountDataUI";
import WorkspaceTabs from "./WorkspaceTabs";
import HelpPopover from "./ui/HelpPopover";
import LanguageSelect from "./LanguageSelect";
import FeedbackPanel from "./FeedbackPanel";
import {
  getDesktopSettings,
  saveDesktopSettings,
  checkUpstreamVersion,
  type DesktopSettings,
} from "../lib/desktop-settings";
import { buttonClass } from "./AccountDataUI";

export default function SettingsPanel({
  version,
  collapsed,
  setCollapsed,
}: {
  version: string;
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
}) {
  useLocale();
  const [tab, setTab] = useState("general");
  const [desktop, setDesktop] = useState<DesktopSettings | null>(null);
  const [desktopError, setDesktopError] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  useEffect(() => {
    let active = true;
    getDesktopSettings()
      .then((value) => {
        if (active) setDesktop(value);
      })
      .catch((e) => {
        if (active) setDesktopError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const saveDesktop = async (patch: Partial<DesktopSettings>) => {
    if (!desktop || saving) return;
    const previous = desktop;
    const next = { ...desktop, ...patch };
    setDesktop(next);
    setSaving(true);
    try {
      await saveDesktopSettings(next);
    } catch (e) {
      setDesktop(previous);
      toast.error(t("ui.3aa3af7f80ec", { v0: String(e) }));
    } finally {
      setSaving(false);
    }
  };
  const checkUpdates = async () => {
    setChecking(true);
    setUpdateMessage("");
    try {
      const info = await checkUpstreamVersion();
      setUpdateMessage(
        info.has_update
          ? t("ui.a9d97395224f", { v0: info.latest_version })
          : t("ui.35d1a26dcd3b", { v0: info.latest_version }),
      );
    } catch (e) {
      setUpdateMessage(t("ui.1ee8e6cc7e71", { v0: String(e) }));
    } finally {
      setChecking(false);
    }
  };
  const { theme, setTheme } = useTheme();
  const { preferences, setPreferences } = usePreferences();
  const save = (patch: Partial<AppPreferences>) => {
    try {
      setPreferences(patch);
    } catch {
      toast.error(t("ui.02114b9e8893"));
    }
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {t("settings.title")}
        </h1>
        <p className="mt-1 text-xs text-slate-500">{t("ui.5f1c31c73cc9")}</p>
      </header>
      <WorkspaceTabs
        label={t("ui.0c79c22aab6d")}
        value={tab}
        change={setTab}
        tabs={[
          { id: "general", label: t("settings.general") },
          { id: "appearance", label: t("settings.appearance") },
          { id: "feedback", label: t("feedback.title") },
          { id: "about", label: t("settings.about") },
        ]}
      />
      {tab === "general" && (
        <div
          className={
            cardClass + " divide-y divide-slate-200/70 dark:divide-white/10"
          }
        >
          {desktopError && (
            <p role="alert" className="p-5 text-xs text-red-500">
              {t("message.21703605133e", { v0: desktopError })}
            </p>
          )}
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <Power size={18} className="mt-1 text-slate-400" />
              <div>
                <div className="flex items-center gap-1">
                  <h2 className="text-sm font-semibold">
                    {t("ui.e0f22186511b")}
                  </h2>
                  <HelpPopover title={t("ui.e0f22186511b")}>
                    {t("ui.ac61d6097ea6")}
                  </HelpPopover>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t("ui.f474a7890fd0")}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              aria-label={t("ui.e0f22186511b")}
              disabled={!desktop || saving}
              checked={desktop?.autostart ?? false}
              onChange={(e) =>
                void saveDesktop({ autostart: e.target.checked })
              }
              className="h-4 w-4 accent-blue-500"
            />
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <PanelBottomClose size={18} className="mt-1 text-slate-400" />
              <div>
                <div className="flex items-center gap-1">
                  <h2 className="text-sm font-semibold">
                    {t("ui.03ea933557da")}
                  </h2>
                  <HelpPopover title={t("ui.03ea933557da")}>
                    {t("ui.4fa210949418")}
                  </HelpPopover>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t("ui.42cf7b9241aa")}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              aria-label={t("ui.03ea933557da")}
              disabled={!desktop || saving}
              checked={desktop?.close_to_tray ?? true}
              onChange={(e) =>
                void saveDesktop({ close_to_tray: e.target.checked })
              }
              className="h-4 w-4 accent-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <LayoutPanelLeft size={18} className="mt-1 text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold">
                  {t("ui.87cde3cf3674")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("ui.abc18ea87690")}
                </p>
              </div>
            </div>
            <select
              aria-label={t("ui.87cde3cf3674")}
              className={fieldClass}
              value={preferences.startPage}
              onChange={(e) =>
                save({
                  startPage: e.target.value as AppPreferences["startPage"],
                })
              }
            >
              <option value="workspace">{t("nav.workspace")}</option>
              <option value="keys">{t("nav.keys")}</option>
              <option value="account">{t("nav.account")}</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <Bell size={18} className="mt-1 text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold">
                  {t("ui.5ecc1238a179")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("ui.f4230aff5a9e")}
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              aria-label={t("ui.5ecc1238a179")}
              className="h-4 w-4 accent-blue-500"
              checked={preferences.announcementPush}
              onChange={(e) => save({ announcementPush: e.target.checked })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <Globe2 size={18} className="mt-1 text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold">
                  {t("settings.language")}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {t("ui.1c60e31e3089")}
                </p>
              </div>
            </div>
            <LanguageSelect />
          </div>
        </div>
      )}
      {tab === "appearance" && (
        <div className={cardClass + " space-y-6 p-5"}>
          <div>
            <h2 className="text-sm font-semibold">{t("ui.e848ddd48253")}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(
                [
                  { id: "light", name: t("ui.80ec9e2b1bc4"), icon: Sun },
                  { id: "dark", name: t("ui.30b2c979ac87"), icon: Moon },
                  { id: "system", name: t("ui.f4bbd91f79ba"), icon: Monitor },
                ] as const
              ).map(({ id, name, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={theme === id}
                  onClick={() => setTheme(id as Theme)}
                  className={`flex items-center justify-center gap-2 rounded-lg border p-4 text-xs transition-colors ${theme === id ? "border-blue-500/50 bg-blue-500/10 text-blue-500" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"}`}
                >
                  <Icon size={17} />
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-5 dark:border-white/10">
            <div>
              <h2 className="text-sm font-semibold">{t("ui.3a90f6219b5a")}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {t("ui.8c9d81deb132")}
              </p>
            </div>
            <input
              type="checkbox"
              aria-label={t("ui.3a90f6219b5a")}
              className="h-4 w-4 accent-blue-500"
              checked={collapsed}
              onChange={(e) => setCollapsed(e.target.checked)}
            />
          </div>
        </div>
      )}
      {tab === "feedback" && <FeedbackPanel version={version} />}
      {tab === "about" && (
        <div className={cardClass + " p-6"}>
          <h2 className="text-lg font-semibold">Uocode Client</h2>
          <p className="mt-2 text-xs text-slate-500">
            {t("message.36e384c2802b", { v0: version })}
          </p>
          <p className="mt-4 text-sm text-slate-500">{t("ui.c7c0222c023f")}</p>
          <div className="mt-6 border-t border-slate-200 pt-5 dark:border-white/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">
                  {t("ui.7e5ce811e80f")}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {t("ui.2634a6756ad6")}
                </p>
              </div>
              <button
                type="button"
                disabled={checking}
                className={buttonClass + " shrink-0"}
                onClick={() => void checkUpdates()}
              >
                <RefreshCw
                  size={14}
                  className={checking ? "animate-spin" : ""}
                />
                {checking ? t("ui.5fc65af5b3b0") : t("settings.checkUpdates")}
              </button>
            </div>
            {updateMessage && (
              <p
                role="status"
                className="mt-4 text-xs leading-6 text-slate-500"
              >
                {updateMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
