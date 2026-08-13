import type { UIMessage } from "ai";

export type GizmoThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
};

export type GizmoThreadSummary = Omit<GizmoThread, "messages">;