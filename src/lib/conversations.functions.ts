import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Apaga uma conversa encerrada com todo o histórico (mensagens, sessões do robô e transferências). */
export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ conversationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: conv, error: loadError } = await context.supabase
      .from("conversations")
      .select("id, status")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    // Já apagada por outra aba/usuário: nada a fazer, mantém a operação idempotente.
    if (!conv) return { ok: true, alreadyRemoved: true };
    if (conv.status !== "closed")
      throw new Error("Só é possível apagar conversas encerradas.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.conversationId;
    await supabaseAdmin.from("messages").delete().eq("conversation_id", id);
    await supabaseAdmin.from("chatbot_sessions").delete().eq("conversation_id", id);
    await supabaseAdmin.from("transfers").delete().eq("conversation_id", id);
    const { error } = await supabaseAdmin.from("conversations").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true, alreadyRemoved: false };
  });
