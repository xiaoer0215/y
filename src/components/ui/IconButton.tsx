import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  hint?: string;
}
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      hint,
      disabled,
      className,
      children,
      onClick,
      onPointerEnter,
      onPointerLeave,
      onFocus,
      onBlur,
      ...props
    },
    forwarded,
  ) {
    const ref = useRef<HTMLButtonElement | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const id = useId();
    const [tip, setTip] = useState<{
      left: number;
      top: number;
      above: boolean;
      container: Element;
    } | null>(null);
    const hide = () => {
      clearTimeout(timer.current);
      setTip(null);
    };
    const show = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const above = r.bottom + 70 > window.innerHeight;
      setTip({
        left: Math.max(
          140,
          Math.min(window.innerWidth - 140, r.left + r.width / 2),
        ),
        top: above ? r.top - 8 : r.bottom + 8,
        above,
        container: el.closest("dialog") ?? document.body,
      });
    };
    useEffect(() => {
      const close = () => setTip(null);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
      return () => {
        clearTimeout(timer.current);
        window.removeEventListener("scroll", close, true);
        window.removeEventListener("resize", close);
      };
    }, []);
    return (
      <>
        <button
          {...props}
          ref={(node) => {
            ref.current = node;
            if (typeof forwarded === "function") forwarded(node);
            else if (forwarded) forwarded.current = node;
          }}
          type={props.type ?? "button"}
          aria-label={label}
          aria-describedby={tip ? id : undefined}
          aria-disabled={disabled || undefined}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-slate-200/70 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100",
            className,
          )}
          onPointerEnter={(e) => {
            onPointerEnter?.(e);
            timer.current = setTimeout(show, 250);
          }}
          onPointerLeave={(e) => {
            onPointerLeave?.(e);
            hide();
          }}
          onFocus={(e) => {
            onFocus?.(e);
            show();
          }}
          onBlur={(e) => {
            onBlur?.(e);
            hide();
          }}
          onClick={(e) => {
            hide();
            if (disabled) {
              e.preventDefault();
              return;
            }
            onClick?.(e);
          }}
        >
          {children}
        </button>
        {tip &&
          createPortal(
            <div
              id={id}
              role="tooltip"
              className="pointer-events-none fixed z-[250] max-w-[260px] rounded-md border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700 shadow-lg dark:border-white/10 dark:bg-[#292b33] dark:text-gray-200"
              style={{
                left: tip.left,
                top: tip.top,
                transform: `translate(-50%,${tip.above ? "-100%" : "0"})`,
              }}
            >
              {hint ?? label}
            </div>,
            tip.container,
          )}
      </>
    );
  },
);
