import { useCallback, useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

import { deriveTitle, newThread, readThreads, writeThreads } from "./storage";
import type { GizmoThread } from "./types";

let cache: GizmoThread[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function getSnapshot(): GizmoThread[] {
  if (cache === null) cache = readThreads();
  return cache;
}

function getServerSnapshot(): GizmoThread[] {
  return [];
}

function setThreads(next: GizmoThread[]) {
  cache = next;
  writeThreads(next);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThreads() {
  const threads = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const ensureThread = useCallback((id: string) => {
    const current = getSnapshot();
    if (current.some((t) => t.id === id)) return;
    setThreads([newThread(id), ...current]);
  }, []);

  const createThread = useCallback(() => {
    const thread = newThread();
    setThreads([thread, ...getSnapshot()]);
    return thread.id;
  }, []);

  const deleteThread = useCallback((id: string) => {
    setThreads(getSnapshot().filter((t) => t.id !== id));
  }, []);

  const saveMessages = useCallback((id: string, messages: UIMessage[]) => {
    const current = getSnapshot();
    const existing = current.find((t) => t.id === id);
    if (!existing) return;
    if (JSON.stringify(existing.messages) === JSON.stringify(messages)) return;
    setThreads(
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              messages,
              updatedAt: Date.now(),
              title: deriveTitle(messages) ?? t.title,
            }
          : t,
      ),
    );
  }, []);

  return { threads, ensureThread, createThread, deleteThread, saveMessages };
}

export function readThreadsSync() {
  return getSnapshot();
}