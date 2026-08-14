"use client";

import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/gizmo/workspace";
import { readThreadsSync } from "@/lib/gizmo/use-threads";
import { newThread } from "@/lib/gizmo/storage";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const threads = readThreadsSync();
  const activeThreadId = threads.length > 0 ? threads[0].id : newThread();
  return <Workspace threadId={activeThreadId} />;
}
