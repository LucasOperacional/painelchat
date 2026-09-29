import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  markAllRead,
  markConversationUnread,
  isConversationOpen,
  useUnreadTotal,
} from "@/lib/unread-store";
import { bindAudioUnlock, playNotificationSound } from "@/lib/notification-sound";
import { isConversationMuted } from "@/lib/muted-contacts";

const MUTE_KEY = "central-notif-muted";
/**
 * Quantos identificadores de mensagem já avisada ficam guardados. A lista servia
 * para não avisar duas vezes, mas crescia para sempre: num plantão longo ela
 * consumia memória até a aba travar — e aba travada é mensagem não vista.
 */
const MAX_VISTOS = 500;

/** Prévia amigável: figurinhas, imagens, áudios e arquivos não mostram o link. */
function messagePreview(body: string | null): string {
  let raw = (body ?? "").trim();
  if (!raw) return "Abra o atendimento para ver.";

  // Detecta a mídia antes de interpretar o prefixo de grupos. Assim, mesmo
  // nomes com dois-pontos ou variações no texto nunca deixam a URL escapar.
  const mediaLabel = raw.match(/(?:^|\s)(?:🖼(?:️)?\s*)?(Figurinha|Sticker)\s*:/i);
  if (mediaLabel) {
    const beforeMedia = raw
      .slice(0, mediaLabel.index ?? 0)
      .replace(/\s*:\s*$/, "")
      .trim();
    const authorName = beforeMedia.replace(/\s*\(.*?\)\s*$/, "").trim();
    return authorName ? `${authorName}: Figurinha` : "Figurinha";
  }

  // Em grupos o corpo vem como "Nome (+55 ...): conteúdo".
  let autor = "";
  const grupo = raw.match(/^([^\n:]{1,120}?)\s*:\s*\n?([\s\S]*)$/);
  if (grupo && /🖼|🎵|🎬|📍|📎|https?:\/\//.test(grupo[2] ?? "")) {
    autor = `${(grupo[1] ?? "").replace(/\s*\(.*?\)\s*$/, "").trim()}: `;
    raw = (grupo[2] ?? "").trim();
  }

  const rotulo = (texto: string) => `${autor}${texto}`;

  const sticker = raw.match(/🖼(?:️)?\s*(Figurinha|Imagem)\s*:/i);
  if (sticker?.[1]) return rotulo(/^f/i.test(sticker[1]) ? "Figurinha" : "Imagem");
  if (/🎵\s*(?:Áudio|Audio)\s*:/i.test(raw)) return rotulo("Áudio");
  if (/🎬\s*(?:Vídeo|Video)\s*:/i.test(raw)) return rotulo("Vídeo");
  if (/📍\s*Localização\s*:/i.test(raw)) return rotulo("Localização");
  const file = raw.match(/📎\s*(.+?)\s*:\s*https?:\/\//i);
  if (file?.[1]) return rotulo(`Arquivo: ${file[1].trim()}`);

  const semLink = raw
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/figurinha|sticker/i.test(semLink)) return rotulo("Figurinha");
  return rotulo(semLink).slice(0, 120);
}

type InboundRow = {
  id: string;
  conversation_id: string;
  direction: string;
  body: string | null;
  sender_name?: string | null;
};

export function useMessageNotifications() {
  const queryClient = useQueryClient();
  const unread = useUnreadTotal();
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const seen = useRef<Set<string>>(new Set());

  /** Registra o aviso já dado, descartando os mais antigos quando passa do teto. */
  const marcarVisto = useCallback((chave: string) => {
    const lista = seen.current;
    if (lista.has(chave)) return false;
    lista.add(chave);
    if (lista.size > MAX_VISTOS) {
      // Set preserva a ordem de inserção: os primeiros são os mais antigos.
      const sobrando = lista.size - MAX_VISTOS;
      let i = 0;
      for (const antigo of lista) {
        if (i >= sobrando) break;
        lista.delete(antigo);
        i += 1;
      }
    }
    return true;
  }, []);

  useEffect(() => {
    bindAudioUnlock();
    const stored = window.localStorage.getItem(MUTE_KEY) === "true";
    setMuted(stored);
    mutedRef.current = stored;
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      window.localStorage.setItem(MUTE_KEY, String(next));
      return next;
    });
  }, []);

  const clearUnread = useCallback(() => markAllRead(), []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let ativo = true;
    let religando: number | null = null;
    let espera = 1_000;

    // Este canal é o que faz o som tocar e o aviso aparecer. Sem reconexão, uma
    // única queda deixava o atendente sem ser avisado de nada pelo resto do
    // plantão — a mensagem chegava no banco e ninguém ficava sabendo.
    const religar = () => {
      if (!ativo || religando !== null) return;
      const atraso = espera;
      espera = Math.min(espera * 2, 30_000);
      religando = window.setTimeout(() => {
        religando = null;
        const antigo = channel;
        channel = null;
        if (antigo) void supabase.removeChannel(antigo);
        conectar();
      }, atraso);
    };

    const conectar = () => {
      if (!ativo) return;
      channel = supabase
        .channel(`central-notificacoes-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          async (payload) => {
            const row = payload.new as InboundRow;
            if (row.direction !== "inbound") return;
            if (!marcarVisto(row.id)) return;

            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["messages"] });

            let who = row.sender_name ?? null;
            let isGroup = false;
            const { data } = await supabase
              .from("conversations")
              .select("contact:contacts(name, phone, wa_jid)")
              .eq("id", row.conversation_id)
              .maybeSingle();
            const contact = (
              data as { contact?: { name?: string; phone?: string; wa_jid?: string | null } } | null
            )?.contact;
            if (!who) who = contact?.name || contact?.phone || null;
            if (contact?.wa_jid?.endsWith("@g.us")) isGroup = true;

            const title = who ? `Nova mensagem de ${who}` : "Nova mensagem recebida";
            const preview = messagePreview(row.body);

            // Grupos: recebemos e gravamos a mensagem, mas sem aviso nenhum
            // (sem som, sem toast, sem contador de não lidas).
            if (isGroup) return;
            // Contato silenciado: a mensagem chega no chat, mas sem aviso.
            if (isConversationMuted(row.conversation_id)) return;

            const alreadyOpen = isConversationOpen(row.conversation_id);
            markConversationUnread(row.conversation_id);
            if (!alreadyOpen) toast(title, { description: preview });

            if (alreadyOpen) return;
            if (mutedRef.current) return;
            playNotificationSound();
            if (
              "Notification" in window &&
              Notification.permission === "granted" &&
              document.visibilityState !== "visible"
            ) {
              try {
                new Notification(title, { body: preview, tag: row.conversation_id });
              } catch {
                // notificação do navegador é opcional
              }
            }
          },
        )
        // Transferência recebida: quem assume o atendimento é avisado na hora.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "transfers" },
          async (payload) => {
            const row = payload.new as {
              id: string;
              conversation_id: string;
              to_user: string | null;
              note: string | null;
            };
            if (!marcarVisto(`t-${row.id}`)) return;

            const { data: auth } = await supabase.auth.getUser();
            const myId = auth.user?.id ?? null;
            if (!row.to_user || !myId || row.to_user !== myId) return;

            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["messages"] });

            const { data: conv } = await supabase
              .from("conversations")
              .select("contact:contacts(name, phone)")
              .eq("id", row.conversation_id)
              .maybeSingle();
            const contact = (conv as { contact?: { name?: string; phone?: string } } | null)
              ?.contact;
            const who = contact?.name || contact?.phone || "um contato";
            const title = `Atendimento transferido para você`;
            const preview = row.note?.trim()
              ? `${who} — ${row.note.trim()}`
              : `Conversa com ${who}`;

            const alreadyOpen = isConversationOpen(row.conversation_id);
            if (!alreadyOpen) markConversationUnread(row.conversation_id);
            toast(title, { description: preview });
            if (mutedRef.current || alreadyOpen) return;
            playNotificationSound();
            if (
              "Notification" in window &&
              Notification.permission === "granted" &&
              document.visibilityState !== "visible"
            ) {
              try {
                new Notification(title, { body: preview, tag: row.conversation_id });
              } catch {
                // notificação do navegador é opcional
              }
            }
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            espera = 1_000;
            // Pode ter chegado mensagem enquanto o canal estava fora: recarrega a
            // lista para o contador de não lidas refletir o que existe de verdade.
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["messages"] });
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            religar();
          }
        });
    };

    conectar();

    return () => {
      ativo = false;
      if (religando !== null) window.clearTimeout(religando);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient, marcarVisto]);

  return { unread, muted, toggleMuted, clearUnread };
}
