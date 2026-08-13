"use client";

import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Workspace } from "@/components/gizmo/workspace";

export const Route = createFileRoute("/c/$threadId")({
  head: () => ({
    meta: [
      { title: "GIZMO Terminal — Session" },
      {
        name: "description",
        content:
          "An active GIZMO session: converse with the trading intelligence agent in its retro terminal workspace.",
      },
      { property: "og:title", content: "GIZMO Terminal — Session" },
      {
        property: "og:description",
        content: "An active GIZMO session inside the trading intelligence terminal.",
      },
    ],
  }),
  component: SessionRoute,
});

function SessionRoute() {
  const { threadId } = Route.useParams();
  return <Workspace threadId={threadId} />;
}
