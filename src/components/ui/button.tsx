import React from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
  size?: "sm" | "md";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800":
              variant === "default",
            "bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/10":
              variant === "ghost",
            "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-[#141724]/60 dark:text-gray-300 dark:hover:bg-white/10":
              variant === "outline",
          },
          {
            "h-8 px-3 text-sm": size === "sm",
            "h-10 px-4 text-sm": size === "md",
          },
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
