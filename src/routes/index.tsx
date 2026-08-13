import React from "react";
"use client";

import { createFileRoute } from "@tanstack/react-router";
import React from "react";
import { Workspace } from "@/components/gizmo/workspace";
import { readThreadsSync } from "@/lib/gizmo/use-threads";
import { newThread } from "@/lib/gizmo/storage";

class RouteErrorBoundary extends React.Component<any, { error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console for now
    // eslint-disable-next-line no-console
    console.error("Route render error:", error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <h2 style={{ color: "#ff6b6b" }}>Render error</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error)}</pre>
        </div>
      );
    }
    // access children via index signature to satisfy strict checks
    return (this.props as any)["children"];
  }
}

export const Route = createFileRoute("/")({
  component: () => {
    const threads = readThreadsSync();
    const thread = threads[0] ?? newThread();
    return (
      <RouteErrorBoundary>
        <Workspace threadId={thread.id} />
      </RouteErrorBoundary>
    );
  },
});