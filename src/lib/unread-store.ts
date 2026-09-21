// Controle de "não lido" por conversa, compartilhado entre a lista de
// atendimento e o sino de notificações. Fica guardado no navegador.
import { useSyncExternalStore } from "react";

const KEY = "central-nao-lidas";

let unread: Record<string, number> = {};
const listeners = new Set<() => void>();
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) unread = JSON.parse(raw) as Record<string, number>;
  } catch {
    unread = {};
  }
}

function commit(next: Record<string, number>) {
  unread = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(unread));
    } catch {
      // persistência é opcional
    }
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function snapshot() {
  load();
  return unread;
}

const EMPTY: Record<string, number> = {};

// Conversa aberta na tela de atendimento: mensagens dela já chegam lidas.
let activeConversationId: string | null = null;

/** Define qual conversa está aberta na tela (null quando nenhuma). */
export function setActiveConversation(conversationId: string | null) {
  activeConversationId = conversationId;
  if (conversationId) markConversationRead(conversationId);
}

/** Diz se a conversa está aberta e visível agora. */
export function isConversationOpen(conversationId: string) {
  return (
    activeConversationId === conversationId &&
    (typeof document === "undefined" || document.visibilityState === "visible")
  );
}

/** Marca uma conversa como não lida (uma mensagem nova a mais). */
export function markConversationUnread(conversationId: string) {
  load();
  if (isConversationOpen(conversationId)) return;
  commit({ ...unread, [conversationId]: (unread[conversationId] ?? 0) + 1 });
}

/** Marca a conversa como lida. */
export function markConversationRead(conversationId: string) {
  load();
  if (!unread[conversationId]) return;
  const next = { ...unread };
  delete next[conversationId];
  commit(next);
}

/** Marca todas as conversas como lidas. */
export function markAllRead() {
  load();
  if (Object.keys(unread).length === 0) return;
  commit({});
}

/** Mapa de conversas não lidas. */
export function useUnreadMap() {
  return useSyncExternalStore(
    subscribe,
    snapshot,
    () => EMPTY,
  );
}

/** Total de mensagens não lidas. */
export function useUnreadTotal() {
  const map = useUnreadMap();
  return Object.values(map).reduce((sum, n) => sum + n, 0);
}
