import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/** Sincronização de segurança: mesmo sem tempo real, tudo atualiza neste intervalo. */
const FULL_SYNC_INTERVAL_MS = 20 * 1000;
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
    let ativo = true;
    let ultimoSinal = Date.now();
    let reconectando: number | null = null;

    const invalidate = (key: string) => {
      void queryClient.invalidateQueries({ queryKey: [key] });
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

    const conectar = () => {
      if (!ativo) return;
      let ch = supabase.channel(`central-global-sync-${Date.now()}`);

      ch = tabela(ch, "conversations", () => invalidate("conversations"));
      ch = tabela(ch, "messages", aplicarMensagem);
      ch = tabela(ch, "transfers", () => {
        invalidate("transfers");
        invalidate("conversations");
        invalidate("messages");
      });
      ch = tabela(ch, "contacts", () => {
        invalidate("contacts");
        invalidate("contact-options");
        invalidate("conversations");
      });
      ch = tabela(ch, "queues", () => {
        invalidate("queues");
        invalidate("conversations");
      });
      ch = tabela(ch, "departments", () => {
        invalidate("departments");
        invalidate("conversations");
      });
      ch = tabela(ch, "profiles", () => {
        invalidate("profiles");
        invalidate("agents");
        invalidate("conversations");
      });
      ch = tabela(ch, "whatsapp_config", () => {
        invalidate("wa-connections");
        invalidate("whatsapp-devices");
        invalidate("whatsapp-status");
        invalidate("conversations");
      });
      ch = tabela(ch, "agent_connections", () => {
        invalidate("agent-connections");
        invalidate("agents");
        invalidate("conversations");
      });
      ch = tabela(ch, "queue_agents", () => {
        invalidate("queue-agents");
        invalidate("queues");
        invalidate("conversations");
      });

      channel = ch.subscribe((status) => {
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
    };

    const reconectar = () => {
      if (!ativo || reconectando !== null) return;
      reconectando = window.setTimeout(() => {
        reconectando = null;
        const antigo = channel;
        channel = null;
        if (antigo) void supabase.removeChannel(antigo);
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
      window.clearInterval(timer);
      window.removeEventListener("online", acordar);
      window.removeEventListener("focus", acordar);
      document.removeEventListener("visibilitychange", onVisible);
      auth.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
