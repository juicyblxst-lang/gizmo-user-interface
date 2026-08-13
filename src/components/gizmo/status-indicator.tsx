import { cn } from "@/lib/utils";

export type GizmoStatus = "idle" | "thinking" | "streaming" | "error";

const LABELS: Record<GizmoStatus, string> = {
  idle: "STANDBY",
  thinking: "PROCESSING",
  streaming: "TRANSMITTING",
  error: "FAULT",
};

const DOT: Record<GizmoStatus, string> = {
  idle: "bg-primary",
  thinking: "bg-accent animate-pulse",
  streaming: "bg-signal animate-pulse",
  error: "bg-destructive",
};

export function StatusIndicator({
  status,
  className,
}: {
  status: GizmoStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 border-2 border-input bg-terminal px-2 py-1",
        className,
      )}
    >
      <span className={cn("size-2", DOT[status])} />
      <span className="text-pixel text-[8px] text-muted-foreground">{LABELS[status]}</span>
    </span>
  );
}