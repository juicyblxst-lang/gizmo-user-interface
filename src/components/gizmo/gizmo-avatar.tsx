import gizmoCharacter from "@/assets/gizmo-character.png";
import gizmoMark from "@/assets/gizmo-mark.png";
import { cn } from "@/lib/utils";

export function GizmoMark({ className, onClick }: { className?: string; onClick?: () => void }) {
  const image = <img src={gizmoMark} alt="GIZMO" width={816} height={816} className={cn("size-8 shrink-0 select-none", className)} />;
  if (!onClick) return image;
  return <button type="button" aria-label="GIZMO home" onClick={onClick} className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{image}</button>;
}

export function GizmoCharacter({ className, onClick }: { className?: string; onClick?: () => void }) {
  const image = <img src={gizmoCharacter} alt="GIZMO, a teal pixel-art character wearing sunglasses with an owl companion" width={1024} height={1024} loading="lazy" className={cn("select-none", className)} />;
  if (!onClick) return image;
  return <button type="button" aria-label="GIZMO home" onClick={onClick} className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{image}</button>;
}
