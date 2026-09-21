import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem configurar o chatbot.");
  }
}

const hoursSchema = z.array(
  z.object({
    day: z.number(),
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  }),
);

const actionSchema = z.enum([
  "message",
  "transfer_queue",
  "transfer_department",
  "ai",
  "close",
  "loja",
]);

/** Configuração do chatbot, opções do menu, filas e departamentos. */
export const getChatbot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildMenuText, isWithinBusinessHours } = await import("@/lib/chatbot.server");

    const { data: bots, error } = await supabaseAdmin
      .from("chatbots")
      .select("*")
      .neq("name", ADMIN_BOT_NAME)
      .order("created_at")
      .limit(1);
    if (error) throw new Error(error.message);
    const bot = (bots ?? [])[0] ?? null;
    if (!bot) return { bot: null, options: [], queues: [], departments: [], preview: "", isOpenNow: true };

    const [{ data: options }, { data: queues }, { data: departments }] = await Promise.all([
      supabaseAdmin.from("chatbot_options").select("*").eq("chatbot_id", bot.id).order("sort_order"),
      supabaseAdmin.from("queues").select("id, name, department_id").order("name"),
      supabaseAdmin.from("departments").select("id, name").order("name"),
    ]);

    const activeOptions = (options ?? []).filter((o: { is_active: boolean }) => o.is_active);
    return {
      bot,
      options: options ?? [],
      queues: queues ?? [],
      departments: departments ?? [],
      preview: buildMenuText(bot as never, activeOptions as never),
      isOpenNow: isWithinBusinessHours(bot as never),
    };
  });

const settingsSchema = z.object({
  name: z.string().min(1),
  isActive: z.boolean(),
  welcomeMessage: z.string().min(1),
  menuFooter: z.string().default(""),
  invalidOptionMessage: z.string().min(1),
  fallbackMessage: z.string().min(1),
  attemptLimit: z.number().int().min(1).max(10),
  transferKeywords: z.array(z.string()),
  aiEnabled: z.boolean(),
  aiInstructions: z.string().min(1),
  aiTransferOnUnknown: z.boolean(),
  hoursEnabled: z.boolean(),
  timezone: z.string().min(1),
  businessHours: hoursSchema,
  outsideHoursMessage: z.string().min(1),
});

/** Salva a configuração geral do chatbot. */
export const saveChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch = {
      name: data.name.trim(),
      is_active: data.isActive,
      welcome_message: data.welcomeMessage.trim(),
      menu_footer: data.menuFooter.trim(),
      invalid_option_message: data.invalidOptionMessage.trim(),
      fallback_message: data.fallbackMessage.trim(),
      attempt_limit: data.attemptLimit,
      transfer_keywords: data.transferKeywords.map((k) => k.trim()).filter(Boolean),
      ai_enabled: data.aiEnabled,
      ai_instructions: data.aiInstructions.trim(),
      ai_transfer_on_unknown: data.aiTransferOnUnknown,
      hours_enabled: data.hoursEnabled,
      timezone: data.timezone.trim(),
      business_hours: data.businessHours,
      outside_hours_message: data.outsideHoursMessage.trim(),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .neq("name", ADMIN_BOT_NAME)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin.from("chatbots").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { id: existing.id };
    }
    const created = await supabaseAdmin.from("chatbots").insert(patch).select("id").single();
    if (created.error) throw new Error(created.error.message);
    return { id: created.data.id };
  });

const optionSchema = z.object({
  id: z.string().uuid().nullable().default(null),
  optionKey: z.string().min(1).max(4),
  label: z.string().min(1),
  response: z.string().default(""),
  action: actionSchema,
  queueId: z.string().uuid().nullable().default(null),
  departmentId: z.string().uuid().nullable().default(null),
  sortOrder: z.number().int().min(1).max(99).default(1),
  isActive: z.boolean().default(true),
});

/** Cria ou atualiza uma opção do menu do chatbot. */
export const saveChatbotOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => optionSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bot } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .neq("name", ADMIN_BOT_NAME)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!bot) throw new Error("Salve a configuração do chatbot primeiro.");

    const patch = {
      chatbot_id: bot.id,
      option_key: data.optionKey.trim(),
      label: data.label.trim(),
      response: data.response.trim(),
      action: data.action,
      queue_id: data.action === "transfer_queue" ? data.queueId : null,
      department_id:
        data.action === "transfer_queue" || data.action === "transfer_department"
          ? data.departmentId
          : null,
      sort_order: data.sortOrder,
      is_active: data.isActive,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("chatbot_options").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("chatbot_options").insert(patch);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Remove uma opção do menu. */
export const deleteChatbotOption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("chatbot_options").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Simula o chatbot: mostra a resposta que o cliente receberia, sem enviar no WhatsApp. */
export const simulateChatbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ message: z.string().min(1).max(2000), state: z.enum(["menu", "ai"]).default("menu") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { loadActiveChatbot, buildMenuText, isWithinBusinessHours } = await import(
      "@/lib/chatbot.server"
    );
    const loaded = await loadActiveChatbot();
    if (!loaded) {
      return {
        reply: "Ative o chatbot para simular o atendimento.",
        nextState: "menu" as const,
      };
    }
    const { bot, options } = loaded;

    if (!isWithinBusinessHours(bot)) {
      return { reply: bot.outside_hours_message, nextState: "handoff" as const };
    }

    const normalize = (t: string) =>
      t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const normalized = normalize(data.message);

    if ((bot.transfer_keywords ?? []).some((k) => normalize(k) && normalized.includes(normalize(k)))) {
      return { reply: bot.fallback_message, nextState: "handoff" as const };
    }

    if (data.state === "menu") {
      const chosen = options.find((o) => normalize(o.option_key) === normalized);
      if (chosen) {
        if (chosen.action === "ai") {
          return { reply: chosen.response || "Pode escrever sua dúvida.", nextState: "ai" as const };
        }
        if (chosen.action === "loja") {
          const { carregarProdutosLoja, carregarLojaBotSettings, textoDoCatalogo } = await import(
            "@/lib/loja.server"
          );
          const [produtos, lojaBot] = await Promise.all([
            carregarProdutosLoja(),
            carregarLojaBotSettings(),
          ]);
          const catalogo = produtos.length
            ? textoDoCatalogo(produtos, lojaBot.botTitulo, lojaBot.botSaudacao)
            : "Nenhum produto disponível na loja agora.";
          return {
            reply: [chosen.response, catalogo].filter(Boolean).join("\n\n"),
            nextState: "menu" as const,
          };
        }
        if (chosen.action === "close") {
          return { reply: chosen.response, nextState: "handoff" as const };
        }
        if (chosen.action === "message") {
          return {
            reply: `${chosen.response}\n\n${buildMenuText(bot, options)}`,
            nextState: "menu" as const,
          };
        }
        return { reply: chosen.response || bot.fallback_message, nextState: "handoff" as const };
      }
      if (!bot.ai_enabled) {
        return {
          reply: `${bot.invalid_option_message}\n\n${buildMenuText(bot, options)}`,
          nextState: "menu" as const,
        };
      }
    }

    const { loadAiConfig, aiGenerate } = await import("@/lib/ai.server");
    const aiConfig = await loadAiConfig();
    if (!aiConfig || !aiConfig.is_enabled) {
      return { reply: bot.fallback_message, nextState: "handoff" as const };
    }
    const text = await aiGenerate({
      config: aiConfig,
      systemPrompt: bot.ai_instructions,
      prompt: `Cliente: ${data.message}\n\nEscreva apenas a próxima mensagem do assistente.`,
    });
    return { reply: text, nextState: data.state === "ai" ? ("ai" as const) : ("menu" as const) };
  });
