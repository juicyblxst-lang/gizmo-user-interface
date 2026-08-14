import type { UIMessage } from "ai";

import type { GizmoThread } from "./types";

const STORAGE_KEY = "gizmo.threads.v1";

const isBrowser = () => typeof window !== "undefined";

export function createThreadId() {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 12);
}

export function readThreads(): GizmoThread[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GizmoThread[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && typeof t.id === "string");
  } catch {
    return [];
  }
}

export function writeThreads(threads: GizmoThread[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch {
    /* storage unavailable — session stays in memory */
  }
}

export function newThread(
  id = createThreadId(),
  sessionNumber = 1,
): GizmoThread {
  const now = Date.now();

  return {
    id,
    title: `Session ${sessionNumber}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();
}

export function deriveTitle(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user");
  if (!first) return null;
  const text = messageText(first);
  if (!text) return null;
  return text.length > 38 ? `${text.slice(0, 38)}…` : text;
}