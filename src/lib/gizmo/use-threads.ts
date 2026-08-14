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
  const current = getSnapshot();

  const sessionNumber =
    current.reduce((max, thread) => {
      const match = thread.title.match(/^Session (\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

  const thread = newThread(undefined, sessionNumber);

  setThreads([thread, ...current]);

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