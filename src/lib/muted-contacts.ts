// Conversas silenciadas: sem som, aviso ou contador. Fica guardado no navegador.
import { useSyncExternalStore } from "react";

const KEY = "central-conversas-silenciadas";
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    cache = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

export function isConversationMuted(id: string) {
  return read().includes(id);
}

export function toggleConversationMuted(id: string): boolean {
  const atual = read();
  const muted = !atual.includes(id);
  cache = muted ? [...atual, id] : atual.filter((x) => x !== id);
  window.localStorage.setItem(KEY, JSON.stringify(cache));
  listeners.forEach((l) => l());
  return muted;
}

const empty: string[] = [];
export function useMutedConversations(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => empty,
  );
}
