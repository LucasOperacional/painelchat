import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/** Sincronização de segurança: mesmo sem tempo real, tudo atualiza neste intervalo. */
const FULL_SYNC_INTERVAL_MS = 90 * 1000;
/** Se o canal ficar mudo por este tempo, reconectamos do zero. */
const CANAL_MUDO_MS = 60 * 1000;

const CENTRAL_QUERY_KEYS = [
  "conversations",
  "messages",
  "transfers",
  "contacts",
  "contact-options",
  "queues",
  "departments",
  "profiles",
  "agents",
  "wa-connections",
  "whatsapp-devices",
  "whatsapp-status",
  "agent-connections",
  "queue-agents",
] as const;

type RealtimeMessage = {
  id?: string;
  conversation_id?: string;
  body?: string;
  direction?: string;
  created_at?: string;
};

type ConversationRow = {
  id: string;
  last_message_at?: string;
  last_message?: {
    id: string;
    body: string;
    direction: string;
    created_at: string;
  } | null;
};

// A prévia otimista some assim que a mensagem real chega do servidor.
function ehPrevia(id: unknown) {
  return String(id).startsWith("optimistic-");
}

export function useCentralSync() {
  const queryClient = useQueryClient();
  const lastFullSync = useRef(0);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let canalCadastros: RealtimeChannel | null = null;
    let ativo = true;
    let ultimoSinal = Date.now();
    let reconectando: number | null = null;

    // Agrupa várias atualizações seguidas numa única recarga, para não
    // sobrecarregar o banco a cada mensagem que chega.
    const pendentes = new Set<string>();
    let agrupando: number | null = null;
    const invalidate = (key: string) => {
      pendentes.add(key);
      if (agrupando !== null) return;
      agrupando = window.setTimeout(() => {
        agrupando = null;
        const chaves = [...pendentes];
        pendentes.clear();
        chaves.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
      }, 1_500);
    };
    const fullSync = () => {
      const now = Date.now();
      if (now - lastFullSync.current < 1_000) return;
      lastFullSync.current = now;
      CENTRAL_QUERY_KEYS.forEach(invalidate);
    };

    const sinal = () => {
      ultimoSinal = Date.now();
    };

    const aplicarMensagem = (payload: {
      eventType: string;
      new: unknown;
      old: unknown;
    }) => {
      const fresh = payload.new as RealtimeMessage | undefined;
      const removed = payload.old as RealtimeMessage | undefined;
      const conversationId = fresh?.conversation_id ?? removed?.conversation_id;

      if (conversationId && fresh?.id) {
        queryClient.setQueryData<RealtimeMessage[]>(["messages", conversationId], (current) => {
          if (!current) return current;
          if (payload.eventType === "DELETE") {
            return current.filter((message) => message.id !== fresh.id);
          }
          const existingIndex = current.findIndex((message) => message.id === fresh.id);
          if (existingIndex >= 0) {
            const next = [...current];
            next[existingIndex] = { ...next[existingIndex], ...fresh };
            return next;
          }
          // Chegou a mensagem real do atendente: tira a prévia que estava na tela.
          const semPrevia =
            fresh.direction === "outbound"
              ? current.filter((message) => !ehPrevia(message.id))
              : current.filter((message) => !(ehPrevia(message.id) && message.body === fresh.body));
          return [...semPrevia, fresh];
        });
      } else {
        invalidate("messages");
      }

      // A lista lateral já mostra a última mensagem e sobe a conversa na hora,
      // sem esperar a próxima recarga.
      if (conversationId && fresh?.id && payload.eventType !== "DELETE") {
        const quando = fresh.created_at ?? new Date().toISOString();
        queryClient.setQueriesData<ConversationRow[]>({ queryKey: ["conversations"] }, (current) => {
          if (!Array.isArray(current)) return current;
          const index = current.findIndex((conv) => conv.id === conversationId);
          if (index < 0) return current;
          const atual = current[index]!;
          const atualizada: ConversationRow = {
            ...atual,
            last_message_at: quando,
            last_message: {
              id: fresh.id!,
              body: fresh.body ?? "",
              direction: fresh.direction ?? "inbound",
              created_at: quando,
            },
          };
          const resto = current.filter((_, i) => i !== index);
          return [atualizada, ...resto];
        });
      }

      invalidate("conversations");
    };

    const tabela = (
      ch: RealtimeChannel,
      table: string,
      acao: (payload: { eventType: string; new: unknown; old: unknown }) => void,
    ) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        sinal();
        acao(payload as unknown as { eventType: string; new: unknown; old: unknown });
      });

    // O chat fica num canal só dele: qualquer problema nos cadastros (contatos,
    // filas, equipe) não pode deixar as mensagens sem tempo real.
    const conectar = () => {
      if (!ativo) return;

      let chat = supabase.channel(`central-chat-sync-${Date.now()}`);
      chat = tabela(chat, "messages", aplicarMensagem);
      chat = tabela(chat, "conversations", () => invalidate("conversations"));
      chat = tabela(chat, "transfers", () => {
        invalidate("transfers");
        invalidate("conversations");
        invalidate("messages");
      });

      let cadastros = supabase.channel(`central-cadastros-sync-${Date.now()}`);
      cadastros = tabela(cadastros, "contacts", () => {
        invalidate("contacts");
        invalidate("contact-options");
        invalidate("conversations");
      });
      cadastros = tabela(cadastros, "queues", () => {
        invalidate("queues");
        invalidate("conversations");
      });
      cadastros = tabela(cadastros, "departments", () => {
        invalidate("departments");
        invalidate("conversations");
      });
      cadastros = tabela(cadastros, "profiles", () => {
        invalidate("profiles");
        invalidate("agents");
        invalidate("conversations");
      });
      cadastros = tabela(cadastros, "agent_connections", () => {
        invalidate("agent-connections");
        invalidate("agents");
        invalidate("conversations");
      });
      cadastros = tabela(cadastros, "queue_agents", () => {
        invalidate("queue-agents");
        invalidate("queues");
        invalidate("conversations");
      });

      channel = chat.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          sinal();
          fullSync();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          fullSync();
          reconectar();
        }
      });
      canalCadastros = cadastros.subscribe((status) => {
        if (status === "SUBSCRIBED") sinal();
      });
    };

    const reconectar = () => {
      if (!ativo || reconectando !== null) return;
      reconectando = window.setTimeout(() => {
        reconectando = null;
        const antigo = channel;
        const antigoCadastros = canalCadastros;
        channel = null;
        canalCadastros = null;
        if (antigo) void supabase.removeChannel(antigo);
        if (antigoCadastros) void supabase.removeChannel(antigoCadastros);
        ultimoSinal = Date.now();
        conectar();
      }, 2_000);
    };

    conectar();

    // Rede de segurança: recarrega tudo e revive o canal se ele ficar mudo.
    const timer = window.setInterval(() => {
      fullSync();
      if (Date.now() - ultimoSinal > CANAL_MUDO_MS) reconectar();
    }, FULL_SYNC_INTERVAL_MS);

    const acordar = () => {
      fullSync();
      if (Date.now() - ultimoSinal > CANAL_MUDO_MS) reconectar();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acordar();
    };
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") reconectar();
    });

    window.addEventListener("online", acordar);
    window.addEventListener("focus", acordar);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      ativo = false;
      if (reconectando !== null) window.clearTimeout(reconectando);
      if (agrupando !== null) window.clearTimeout(agrupando);
      window.clearInterval(timer);
      window.removeEventListener("online", acordar);
      window.removeEventListener("focus", acordar);
      document.removeEventListener("visibilitychange", onVisible);
      auth.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
      if (canalCadastros) void supabase.removeChannel(canalCadastros);
    };
  }, [queryClient]);
}
