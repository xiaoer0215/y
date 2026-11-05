import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "success" | "error";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "success", ...props }, ref) => {
    return (
      <div
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
          variant === "success" && "bg-green-900/50 text-green-400",
          variant === "error" && "bg-red-900/50 text-red-400",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

export { Badge };
