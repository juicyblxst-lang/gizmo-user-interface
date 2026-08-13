import gizmoCharacter from "@/assets/gizmo-character.png";
import gizmoMark from "@/assets/gizmo-mark.png";
import { cn } from "@/lib/utils";

export function GizmoMark({ className }: { className?: string }) {
  return (
    <img
      src={gizmoMark}
      alt="GIZMO"
      width={816}
      height={816}
      className={cn("size-8 shrink-0 select-none", className)}
    />
  );
}

export function GizmoCharacter({ className }: { className?: string }) {
  return (
    <img
      src={gizmoCharacter}
      alt="GIZMO, a teal pixel-art character wearing sunglasses with an owl companion"
      width={1024}
      height={1024}
      loading="lazy"
      className={cn("select-none", className)}
    />
  );
}