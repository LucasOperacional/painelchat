import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { markAllRead, markConversationUnread, isConversationOpen, useUnreadTotal } from "@/lib/unread-store";
import { bindAudioUnlock, playNotificationSound } from "@/lib/notification-sound";

const MUTE_KEY = "central-notif-muted";

/** Prévia amigável: figurinhas, imagens, áudios e arquivos não mostram o link. */
function messagePreview(body: string | null): string {
  let raw = (body ?? "").trim();
  if (!raw) return "Abra o atendimento para ver.";

  // Detecta a mídia antes de interpretar o prefixo de grupos. Assim, mesmo
  // nomes com dois-pontos ou variações no texto nunca deixam a URL escapar.
  const mediaLabel = raw.match(/(?:^|\s)(?:🖼(?:️)?\s*)?(Figurinha|Sticker)\s*:/i);
  if (mediaLabel) {
    const beforeMedia = raw.slice(0, mediaLabel.index ?? 0).replace(/\s*:\s*$/, "").trim();
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
    const channel = supabase
      .channel("central-notificacoes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const row = payload.new as InboundRow;
          if (row.direction !== "inbound") return;
          if (seen.current.has(row.id)) return;
          seen.current.add(row.id);

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
          if (seen.current.has(`t-${row.id}`)) return;
          seen.current.add(`t-${row.id}`);

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
          const contact = (conv as { contact?: { name?: string; phone?: string } } | null)?.contact;
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { unread, muted, toggleMuted, clearUnread };
}
