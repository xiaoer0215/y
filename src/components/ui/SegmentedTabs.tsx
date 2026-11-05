import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export default function SegmentedTabs({
  label,
  tabs,
  value,
  change,
  className,
}: {
  label: string;
  tabs: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  change: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "segmented-tabs flex w-fit max-w-full items-stretch gap-1 overflow-x-auto rounded-md bg-slate-100/70 dark:bg-white/[0.04]",
        className,
      )}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-label={tab.label}
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          onClick={() => change(tab.id)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (index - 1 + tabs.length) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : -1;
            if (next >= 0) {
              event.preventDefault();
              change(tabs[next].id);
              (
                event.currentTarget.parentElement?.children[
                  next
                ] as HTMLButtonElement
              )?.focus();
            }
          }}
          className={cn(
            "flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2.5 text-xs font-medium transition-colors [&>svg]:shrink-0",
            value === tab.id
              ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.09] dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-gray-500 dark:hover:text-gray-200",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
