import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import SegmentedTabs from "./ui/SegmentedTabs";

export default function WorkspaceTabs({
  label,
  tabs,
  value,
  change,
}: {
  label: string;
  tabs: { id: string; label: string; icon?: ReactNode }[];
  value: string;
  change: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-white/[0.07]",
      )}
    >
      <p className="text-xs font-medium text-slate-400 dark:text-gray-500">
        {label}
      </p>
      <div className="ml-auto max-w-full overflow-x-auto pb-1">
        <SegmentedTabs
          label={label}
          tabs={tabs}
          value={value}
          change={change}
          className="ml-auto"
        />
      </div>
    </div>
  );
}
