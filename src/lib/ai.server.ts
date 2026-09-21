// Integrações de IA: Google Gemini (ai.google.dev) e Manus API v2 (open.manus.ai).
// Uso exclusivo no servidor.

export type AiConfig = {
  id: string;
  provider: string;
  model: string;
  system_prompt: string;
  is_enabled: boolean;
  auto_reply: boolean;
  manus_agent_profile: string;
};

export async function loadAiConfig(): Promise<AiConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_config")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AiConfig | null) ?? null;
}

/** Token salvo na central (tabela protegida) ou variável de ambiente. */
export async function loadApiKey(provider: "gemini" | "manus"): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ai_secrets")
    .select("api_key")
    .eq("provider", provider)
    .maybeSingle();
  const saved = (data as { api_key?: string } | null)?.api_key?.trim();
  if (saved) return saved;
  const env = provider === "manus" ? process.env["MANUS_API_KEY"] : process.env["GEMINI_API_KEY"];
  return env?.trim() || null;
}

export async function saveApiKey(provider: "gemini" | "manus", apiKey: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("ai_secrets")
    .upsert(
      { provider, api_key: apiKey.trim(), updated_at: new Date().toISOString() },
      { onConflict: "provider" },
    );
  if (error) throw new Error(error.message);
}

export async function clearApiKey(provider: "gemini" | "manus") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ai_secrets").delete().eq("provider", provider);
  if (error) throw new Error(error.message);
}

/** Google Gemini — generateContent (https://ai.google.dev/gemini-api/docs) */
export async function geminiGenerate(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Promise<string> {
  const apiKey = await loadApiKey("gemini");
  if (!apiKey) throw new Error("Token do Google Gemini não configurado.");
  const model = input.model || "gemini-3.6-flash";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? `Falha na API do Gemini (HTTP ${response.status}).`,
    );
  }

  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("O Gemini não retornou texto.");
  return text;
}

type ManusEnvelope<T> = { ok?: boolean; error?: { message?: string } } & T;

async function manusRequest<T>(
  path: string,
  options: { method: "GET" | "POST"; body?: unknown; query?: Record<string, string> },
): Promise<ManusEnvelope<T>> {
  const apiKey = await loadApiKey("manus");
  if (!apiKey) throw new Error("Token do Manus não configurado.");

  const url = new URL(`https://api.manus.ai${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const init: RequestInit = {
    method: options.method,
    headers: { "Content-Type": "application/json", "x-manus-api-key": apiKey },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as ManusEnvelope<T> | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error?.message ?? `Falha na API do Manus (HTTP ${response.status}).`);
  }
  return (payload ?? ({} as ManusEnvelope<T>));
}

/** Manus API v2 — cria a tarefa e aguarda a resposta do agente. */
export async function manusGenerate(input: {
  systemPrompt: string;
  prompt: string;
  agentProfile?: string;
  timeoutMs?: number;
}): Promise<string> {
  const created = await manusRequest<{ task_id?: string }>("/v2/task.create", {
    method: "POST",
    body: {
      message: { content: `${input.systemPrompt}\n\n---\n\n${input.prompt}` },
      locale: "pt-BR",
      interactive_mode: false,
      hide_in_task_list: true,
      agent_profile: input.agentProfile || "lite",
    },
  });

  const taskId = created.task_id;
  if (!taskId) throw new Error("O Manus não retornou o identificador da tarefa.");

  const deadline = Date.now() + (input.timeoutMs ?? 90_000);
  let lastAssistant = "";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

    const page = await manusRequest<{
      messages?: {
        type?: string;
        status?: string;
        content?: unknown;
        text?: string;
      }[];
    }>("/v2/task.listMessages", {
      method: "GET",
      query: { task_id: taskId, order: "asc", limit: "50" },
    });

    const messages = page.messages ?? [];
    for (const event of messages) {
      if (event.type === "assistant_message") {
        const text =
          typeof event.content === "string"
            ? event.content
            : Array.isArray(event.content)
              ? (event.content as { text?: string }[]).map((p) => p.text ?? "").join("")
              : (event.text ?? "");
        if (text.trim()) lastAssistant = text.trim();
      }
      if (event.type === "error_message") {
        throw new Error(
          typeof event.content === "string" ? event.content : "O Manus retornou um erro.",
        );
      }
    }

    const finished = messages.some(
      (e) => e.type === "status_update" && (e.status === "stopped" || e.status === "error"),
    );
    if (finished && lastAssistant) return lastAssistant;
  }

  if (lastAssistant) return lastAssistant;
  throw new Error("O Manus não respondeu no tempo esperado.");
}

/** Gera texto com o provedor configurado na central. */
export async function aiGenerate(input: {
  config: AiConfig;
  prompt: string;
  systemPrompt?: string;
}): Promise<string> {
  const systemPrompt = input.systemPrompt ?? input.config.system_prompt;
  if (input.config.provider === "manus") {
    return manusGenerate({
      systemPrompt,
      prompt: input.prompt,
      agentProfile: input.config.manus_agent_profile,
    });
  }
  return geminiGenerate({ model: input.config.model, systemPrompt, prompt: input.prompt });
}
