import React from "react";
import { cn } from "../../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-10 px-3 rounded-lg text-sm transition-all",
          "bg-slate-50/80 dark:bg-[#141724]/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-gray-200 placeholder:text-slate-400 dark:placeholder:text-gray-600",
          "focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white dark:focus:bg-[#141724]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
