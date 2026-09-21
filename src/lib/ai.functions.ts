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
    throw new Error("Apenas administradores podem gerenciar a integração com IA.");
  }
}

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { loadAiConfig, loadApiKey } = await import("@/lib/ai.server");
    const config = await loadAiConfig();
    const [geminiKey, manusKey] = await Promise.all([loadApiKey("gemini"), loadApiKey("manus")]);
    return {
      hasGeminiKey: !!geminiKey,
      hasManusKey: !!manusKey,
      config: config
        ? {
            id: config.id,
            provider: config.provider,
            model: config.model,
            systemPrompt: config.system_prompt,
            isEnabled: config.is_enabled,
            autoReply: config.auto_reply,
            manusAgentProfile: config.manus_agent_profile,
          }
        : null,
    };
  });

const saveInput = z.object({
  provider: z.enum(["gemini", "manus"]).default("gemini"),
  model: z.string().min(1).default("gemini-3.6-flash"),
  systemPrompt: z.string().min(1),
  isEnabled: z.boolean().default(false),
  autoReply: z.boolean().default(false),
  manusAgentProfile: z.enum(["lite", "standard", "max"]).default("lite"),
});

export const saveAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { loadAiConfig } = await import("@/lib/ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await loadAiConfig();

    const patch = {
      provider: data.provider,
      model: data.model.trim(),
      system_prompt: data.systemPrompt.trim(),
      is_enabled: data.isEnabled,
      auto_reply: data.autoReply,
      manus_agent_profile: data.manusAgentProfile,
      updated_at: new Date().toISOString(),
    };

    if (config) {
      const { error } = await supabaseAdmin.from("ai_config").update(patch).eq("id", config.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("ai_config").insert(patch);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const testInput = z.object({ prompt: z.string().min(1) });

/** Envia uma mensagem de teste para o provedor configurado. */
export const testAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => testInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { loadAiConfig, aiGenerate } = await import("@/lib/ai.server");
    const config = await loadAiConfig();
    if (!config) throw new Error("Salve a configuração de IA primeiro.");
    const text = await aiGenerate({ config, prompt: data.prompt });
    return { text };
  });

const keyInput = z.object({
  provider: z.enum(["gemini", "manus"]),
  apiKey: z.string().min(8),
});

/** Salva o token de acesso do provedor de IA. */
export const saveAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => keyInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { saveApiKey } = await import("@/lib/ai.server");
    await saveApiKey(data.provider, data.apiKey);
    return { ok: true };
  });

/** Remove o token salvo do provedor de IA. */
export const removeAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ provider: z.enum(["gemini", "manus"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { clearApiKey } = await import("@/lib/ai.server");
    await clearApiKey(data.provider);
    return { ok: true };
  });

/** Corrige ortografia e pontuação do texto do atendente, sem mudar o sentido. */
export const correctText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ text: z.string().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { loadAiConfig, aiGenerate } = await import("@/lib/ai.server");
    const config = await loadAiConfig();
    if (!config || !config.is_enabled) {
      throw new Error("A integração com IA está desativada. Ative em Inteligência artificial.");
    }
    const text = await aiGenerate({
      config,
      prompt:
        "Corrija a ortografia, acentuação, pontuação e clareza do texto abaixo em português do Brasil. " +
        "Mantenha o mesmo sentido, tom e emojis. Responda apenas com o texto corrigido, sem comentários.\n\n" +
        data.text,
    });
    return { text: text.trim() };
  });

const suggestInput = z.object({ conversationId: z.string().uuid() });


/** Sugere uma resposta para o atendente com base no histórico da conversa. */
export const suggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => suggestInput.parse(data))
  .handler(async ({ data, context }) => {
    const { loadAiConfig, aiGenerate } = await import("@/lib/ai.server");
    const config = await loadAiConfig();
    if (!config || !config.is_enabled) {
      throw new Error("A integração com IA está desativada. Ative em Inteligência artificial.");
    }

    const { data: messages, error } = await context.supabase
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);

    const transcript = ((messages ?? []) as { direction: string; body: string }[])
      .filter((m) => m.direction === "inbound" || m.direction === "outbound")
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${m.body}`)
      .join("\n");

    if (!transcript) throw new Error("Ainda não há mensagens nesta conversa.");

    const text = await aiGenerate({
      config,
      prompt:
        "Histórico do atendimento:\n\n" +
        transcript +
        "\n\nEscreva apenas a próxima mensagem do atendente, sem títulos nem explicações.",
    });
    return { text };
  });
