import { t, useLocale } from "../../lib/i18n";
import * as Popover from "@radix-ui/react-popover";
import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export default function HelpPopover({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  useLocale();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t("ui.353ed541e9ee", { v0: title })}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-blue-500"
        >
          <CircleHelp size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          role="dialog"
          aria-label={t("ui.353ed541e9ee", { v0: title })}
          className="z-[240] w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-600 shadow-xl dark:border-white/10 dark:bg-[#292b33] dark:text-gray-200"
        >
          <strong className="block text-slate-900 dark:text-white">
            {title}
          </strong>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
