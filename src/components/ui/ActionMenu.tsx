import { t, useLocale } from "../../lib/i18n";
import { useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "./IconButton";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  action: () => void;
  disabled?: boolean;
  description?: string;
  danger?: boolean;
  separator?: boolean;
}
export default function ActionMenu({
  label = t("ui.77836d3a9942"),
  actions,
  disabled,
}: {
  label?: string;
  actions: MenuAction[];
  disabled?: boolean;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setContainer(trigger.current?.closest("dialog") ?? undefined);
        setOpen(value);
      }}
    >
      <Popover.Trigger asChild>
        <IconButton
          ref={trigger}
          label={label}
          disabled={disabled}
          aria-haspopup="menu"
        >
          <MoreHorizontal size={17} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          role="menu"
          aria-label={label}
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          className="z-[210] w-56 rounded-lg border border-slate-200 bg-white p-1.5 text-xs text-slate-700 shadow-xl outline-none dark:border-white/10 dark:bg-[#2b2c32] dark:text-gray-200"
          onKeyDown={(e) => {
            const items = [
              ...e.currentTarget.querySelectorAll<HTMLElement>(
                "[role='menuitem']:not([aria-disabled='true'])",
              ),
            ];
            const index = items.indexOf(document.activeElement as HTMLElement);
            const next =
              e.key === "ArrowDown"
                ? (index + 1) % items.length
                : e.key === "ArrowUp"
                  ? (index - 1 + items.length) % items.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? items.length - 1
                      : -1;
            if (next >= 0) {
              e.preventDefault();
              items[next]?.focus();
            }
          }}
        >
          {actions.map((item) => (
            <div
              key={item.label}
              className={
                item.separator
                  ? "mt-1 border-t border-slate-200 pt-1 dark:border-white/10"
                  : ""
              }
            >
              <button
                type="button"
                role="menuitem"
                aria-disabled={item.disabled || undefined}
                tabIndex={item.disabled ? -1 : 0}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.action();
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-white/10 ${item.disabled ? "cursor-not-allowed opacity-40" : item.danger ? "text-red-500 hover:bg-red-500/10" : "hover:bg-slate-100 dark:hover:bg-white/10"}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
              {item.description && (
                <p className="px-2.5 pb-2 text-[11px] leading-5 text-slate-400 dark:text-gray-500">
                  {item.description}
                </p>
              )}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
