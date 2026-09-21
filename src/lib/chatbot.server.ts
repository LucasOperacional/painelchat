import { ADMIN_BOT_NAME } from "@/lib/admin-bot";
// Motor do chatbot de auto atendimento (menu numérico + IA).
// Uso exclusivo no servidor.

export type ChatbotHours = { day: number; enabled: boolean; start: string; end: string };

export type Chatbot = {
  id: string;
  name: string;
  is_active: boolean;
  welcome_message: string;
  menu_footer: string;
  invalid_option_message: string;
  fallback_message: string;
  attempt_limit: number;
  transfer_keywords: string[];
  ai_enabled: boolean;
  ai_instructions: string;
  ai_transfer_on_unknown: boolean;
  hours_enabled: boolean;
  timezone: string;
  business_hours: ChatbotHours[];
  outside_hours_message: string;
};

export type ChatbotOption = {
  id: string;
  option_key: string;
  label: string;
  response: string;
  action: "message" | "transfer_queue" | "transfer_department" | "ai" | "close" | "loja";
  queue_id: string | null;
  department_id: string | null;
  sort_order: number;
  is_active: boolean;
};

export async function loadActiveChatbot(): Promise<{
  bot: Chatbot;
  options: ChatbotOption[];
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("chatbots")
    .select("*")
    .eq("is_active", true)
    .neq("name", ADMIN_BOT_NAME)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const bot = data as Chatbot | null;
  if (!bot) return null;

  const { data: options } = await supabaseAdmin
    .from("chatbot_options")
    .select("*")
    .eq("chatbot_id", bot.id)
    .eq("is_active", true)
    .order("sort_order");

  return { bot, options: (options ?? []) as ChatbotOption[] };
}

/** Monta o texto do menu de opções. */
export function buildMenuText(bot: Chatbot, options: ChatbotOption[]): string {
  const lines = options.map((o) => `*${o.option_key}* - ${o.label}`);
  return [bot.welcome_message.trim(), lines.join("\n"), bot.menu_footer.trim()]
    .filter(Boolean)
    .join("\n\n");
}

/** Verifica se o horário atual está dentro do funcionamento configurado. */
export function isWithinBusinessHours(bot: Chatbot, now = new Date()): boolean {
  if (!bot.hours_enabled) return true;
  const hours = Array.isArray(bot.business_hours) ? bot.business_hours : [];
  if (hours.length === 0) return true;

  const zone = bot.timezone || "America/Sao_Paulo";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[parts.find((p) => p.type === "weekday")?.value ?? ""] ?? 0;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;

  const today = hours.find((h) => Number(h.day) === weekday);
  if (!today || !today.enabled) return false;

  const toMinutes = (value: string) => {
    const [h, m] = String(value || "00:00").split(":");
    return Number(h ?? 0) * 60 + Number(m ?? 0);
  };
  const start = toMinutes(today.start);
  const end = toMinutes(today.end);
  if (end <= start) return current >= start; // vira o dia
  return current >= start && current <= end;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Executa o auto atendimento para uma mensagem recebida.
 * Retorna true quando o robô assumiu a resposta (o auto-reply da IA não deve rodar).
 */
export async function runChatbot(input: {
  conversationId: string;
  phoneDigits: string;
  body: string;
  configId?: string | null;
  isNewConversation: boolean;
}): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendWhatsappText } = await import("@/lib/inbound.server");

    const loaded = await loadActiveChatbot();
    if (!loaded) return false;
    const { bot, options } = loaded;

    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("id, assigned_to, status")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!conversation) return false;
    // Atendente humano já assumiu: o robô não interfere.
    if ((conversation as { assigned_to: string | null }).assigned_to) return false;

    const { data: sessionRow } = await supabaseAdmin
      .from("chatbot_sessions")
      .select("id, state, attempts")
      .eq("conversation_id", input.conversationId)
      .maybeSingle();
    let session = sessionRow as { id: string; state: string; attempts: number } | null;

    if (session?.state === "handoff" || session?.state === "done") return false;

    const reply = async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      let externalId: string | null = null;
      try {
        const sent = await sendWhatsappText({
          phoneDigits: input.phoneDigits,
          text: trimmed,
          configId: input.configId ?? null,
        });
        externalId = sent.externalId;
      } catch (error) {
        console.error("Chatbot: falha ao enviar mensagem:", (error as Error).message);
      }
      await supabaseAdmin.from("messages").insert({
        conversation_id: input.conversationId,
        direction: "outbound",
        body: trimmed,
        external_id: externalId,
      });
      await supabaseAdmin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", input.conversationId);
    };

    type SessionState = "menu" | "ai" | "handoff" | "done";
    const saveSession = async (state: SessionState, attempts = 0) => {
      const patch = {
        conversation_id: input.conversationId,
        chatbot_id: bot.id,
        state,
        attempts,
        updated_at: new Date().toISOString(),
      };
      if (session) {
        await supabaseAdmin
          .from("chatbot_sessions")
          .update(patch)
          .eq("conversation_id", input.conversationId);
        session = { id: session.id, state, attempts };
      } else {
        const created = await supabaseAdmin
          .from("chatbot_sessions")
          .insert(patch)
          .select("id")
          .single();
        session = { id: created.data?.id ?? "", state, attempts };
      }
    };

    const handoff = async (message: string, target?: { queueId?: string | null; departmentId?: string | null }) => {
      if (message) await reply(message);
      await supabaseAdmin
        .from("conversations")
        .update({
          status: "waiting" as const,
          ...(target?.queueId ? { queue_id: target.queueId } : {}),
          ...(target?.departmentId ? { department_id: target.departmentId } : {}),
        })
        .eq("id", input.conversationId)
        // Nunca tira a conversa de um atendente que já assumiu.
        .is("assigned_to", null);
      await supabaseAdmin.from("messages").insert({
        conversation_id: input.conversationId,
        direction: "system",
        body: "🤖 Atendimento encaminhado para a equipe pelo chatbot.",
      });
      await saveSession("handoff");
    };

    // Entrega o menu já clicável (botões/lista). Se o WhatsApp recusar, cai para texto.
    const showMenu = async () => {
      const menuText = buildMenuText(bot, options);
      if (options.length === 0) {
        await reply(menuText);
        return;
      }
      try {
        const { sendWhatsappMenu } = await import("@/lib/inbound.server");
        const sent = await sendWhatsappMenu({
          phoneDigits: input.phoneDigits,
          title: bot.welcome_message.trim() || "Atendimento",
          description: options.map((o) => `*${o.option_key}* - ${o.label}`).join("\n"),
          footer: bot.menu_footer.trim(),
          buttonText: "Ver menu",
          options: options.map((o) => ({ id: o.option_key, label: o.label })),
          configId: input.configId ?? null,
        });
        await supabaseAdmin.from("messages").insert({
          conversation_id: input.conversationId,
          direction: "outbound",
          body: menuText,
          external_id: sent.externalId,
        });
        await supabaseAdmin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", input.conversationId);
      } catch (error) {
        console.error("Chatbot: menu clicável falhou, enviando texto:", (error as Error).message);
        await reply(menuText);
      }
    };

    // Fora do horário: avisa e deixa na fila para a equipe responder depois.
    if (!isWithinBusinessHours(bot)) {
      if (!session || session.state !== "handoff") {
        await handoff(bot.outside_hours_message);
      }
      return true;
    }

    const text = input.body.trim();
    const normalized = normalize(text);

    // Nova conversa: apresenta o menu.
    if (!session) {
      await saveSession("menu", 0);
      await showMenu();
      return true;
    }

    // Cliente pediu atendimento humano.
    const wantsHuman = (bot.transfer_keywords ?? []).some((keyword) => {
      const k = normalize(keyword);
      return !!k && (normalized === k || normalized.includes(k));
    });
    if (wantsHuman) {
      await handoff(bot.fallback_message);
      return true;
    }

    if (session.state === "ai") {
      await answerWithAi({ bot, conversationId: input.conversationId, reply, handoff });
      return true;
    }

    // Estado menu: tenta casar com uma opção.
    const chosen = options.find(
      (o) => normalize(o.option_key) === normalized || normalize(o.label) === normalized,
    );

    if (chosen) {
      if (chosen.action === "transfer_queue" || chosen.action === "transfer_department") {
        await handoff(chosen.response, {
          queueId: chosen.queue_id,
          departmentId: chosen.department_id,
        });
        return true;
      }
      if (chosen.action === "loja") {
        if (chosen.response) await reply(chosen.response);
        const { enviarLojaParaConversa } = await import("@/lib/loja.server");
        const enviado = await enviarLojaParaConversa({
          conversationId: input.conversationId,
          phoneDigits: input.phoneDigits,
          configId: input.configId ?? null,
        });
        if (!enviado) await reply("Nenhum produto disponível na loja agora.");
        await saveSession("menu", 0);
        return true;
      }
      if (chosen.action === "ai") {
        await saveSession("ai", 0);
        if (chosen.response) await reply(chosen.response);
        return true;
      }
      if (chosen.action === "close") {
        if (chosen.response) await reply(chosen.response);
        await supabaseAdmin
          .from("conversations")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("id", input.conversationId)
          .is("assigned_to", null);
        await saveSession("done");
        return true;
      }
      // message
      if (chosen.response) await reply(chosen.response);
      await showMenu();
      return true;
    }

    // Sem opção: IA responde livremente quando habilitada.
    if (bot.ai_enabled) {
      await answerWithAi({ bot, conversationId: input.conversationId, reply, handoff });
      return true;
    }

    const attempts = (session.attempts ?? 0) + 1;
    if (attempts >= (bot.attempt_limit || 3)) {
      await handoff(bot.fallback_message);
      return true;
    }
    await saveSession("menu", attempts);
    await reply(bot.invalid_option_message);
    await showMenu();
    return true;
  } catch (error) {
    console.error("Falha no chatbot:", (error as Error).message);
    return false;
  }
}

const TRANSFER_MARK = "TRANSFERIR_HUMANO";

async function answerWithAi(input: {
  bot: Chatbot;
  conversationId: string;
  reply: (text: string) => Promise<void>;
  handoff: (message: string) => Promise<void>;
}) {
  const { bot } = input;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadAiConfig, aiGenerate } = await import("@/lib/ai.server");

  const aiConfig = await loadAiConfig();
  if (!aiConfig || !aiConfig.is_enabled) {
    await input.handoff(bot.fallback_message);
    return;
  }

  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("direction, body, created_at")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(14);

  const transcript = ((history ?? []) as { direction: string; body: string }[])
    .filter((m) => m.direction === "inbound" || m.direction === "outbound")
    .reverse()
    .map((m) => `${m.direction === "inbound" ? "Cliente" : "Assistente"}: ${m.body}`)
    .join("\n");

  const systemPrompt =
    `${bot.ai_instructions}\n\n` +
    (bot.ai_transfer_on_unknown
      ? `Se você não souber a resposta com segurança, ou o cliente pedir uma pessoa, responda exatamente com ${TRANSFER_MARK} e nada mais.`
      : "Se não souber a resposta, peça mais detalhes ao cliente.");

  try {
    const text = await aiGenerate({
      config: aiConfig,
      systemPrompt,
      prompt:
        "Histórico da conversa:\n\n" +
        transcript +
        "\n\nEscreva apenas a próxima mensagem do assistente para o cliente.",
    });

    if (bot.ai_transfer_on_unknown && text.toUpperCase().includes(TRANSFER_MARK)) {
      await input.handoff(bot.fallback_message);
      return;
    }
    await input.reply(text);
  } catch (error) {
    console.error("Chatbot IA falhou:", (error as Error).message);
    await input.handoff(bot.fallback_message);
  }
}
