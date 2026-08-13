import { X } from "lucide-react";

export function AboutPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-gizmo-title"
        className="pixel-frame w-full max-w-md bg-terminal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-border px-3 py-2">
          <h2
            id="about-gizmo-title"
            className="text-pixel text-[10px] text-primary"
          >
            ABOUT GIZMO
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close about"
            className="pixel-frame-inset flex size-7 items-center justify-center bg-secondary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="px-4 py-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            GIZMO is a trading intelligence terminal designed to help users
            work with market information and their own research.
          </p>

          <p className="mt-3">
            Live market, wallet, and exchange integrations will only be shown
            when connected to verified data sources.
          </p>
        </div>
      </div>
    </div>
  );
}