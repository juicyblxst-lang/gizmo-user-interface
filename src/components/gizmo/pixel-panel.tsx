import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PixelPanel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("pixel-frame bg-card", className)} {...props} />;
}

export function PixelPanelHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b-2 border-border bg-secondary px-3 py-2",
        className,
      )}
    >
      <span className="text-pixel text-[10px] text-primary uppercase">{title}</span>
      {right}
    </div>
  );
}