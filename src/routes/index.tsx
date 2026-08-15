import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/gizmo/workspace";

// Keep the root render deterministic. The previous implementation generated a
// random thread ID during render when localStorage was empty. TanStack Start
// renders the route on the server and then hydrates it in the browser, so the
// two renders received different IDs and React could not attach the client
// event handlers reliably. A stable bootstrap ID lets hydration complete;
// Workspace persists it on the first client effect.
const BOOTSTRAP_THREAD_ID = "default";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  return <Workspace threadId={BOOTSTRAP_THREAD_ID} />;
}
