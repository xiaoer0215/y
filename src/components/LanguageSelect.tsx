import { t, useLocale } from "../lib/i18n";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { languages } from "../lib/locales";
import { usePreferences } from "../lib/preferences";
import { toast } from "sonner";

export default function LanguageSelect() {
  useLocale();
  const { preferences, setPreferences } = usePreferences();
  const [open, setOpen] = useState(false);
  const current = languages.find((item) => item.code === preferences.locale)!;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t("settings.language")}
          aria-haspopup="listbox"
          className="inline-flex h-9 min-w-32 shrink-0 items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-xs dark:border-white/10 dark:bg-white/5"
        >
          <span lang={current.code}>{current.nativeName}</span>
          <ChevronDown size={13} className="text-slate-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          role="listbox"
          aria-label={t("settings.language")}
          align="end"
          sideOffset={5}
          collisionPadding={12}
          className="z-[250] min-w-40 rounded-md border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-xl outline-none dark:border-white/10 dark:bg-[#292b33] dark:text-gray-200"
          onKeyDown={(event) => {
            const options = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                "[role=option]",
              ),
            ];
            const index = options.indexOf(
              document.activeElement as HTMLElement,
            );
            const next =
              event.key === "ArrowDown"
                ? (index + 1) % options.length
                : event.key === "ArrowUp"
                  ? (index - 1 + options.length) % options.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? options.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              options[next]?.focus();
            }
          }}
        >
          {languages.map((language) => (
            <button
              key={language.code}
              type="button"
              role="option"
              aria-selected={preferences.locale === language.code}
              lang={language.code}
              onClick={() => {
                try {
                  setPreferences({ locale: language.code });
                  setOpen(false);
                } catch {
                  toast.error(t("ui.02114b9e8893"));
                }
              }}
              className={`flex h-9 w-full items-center justify-between gap-4 rounded-md px-2.5 text-left outline-none hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10 ${preferences.locale === language.code ? "bg-blue-50 text-blue-500 dark:bg-blue-500/10" : ""}`}
            >
              {language.nativeName}
              {preferences.locale === language.code && <Check size={13} />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
