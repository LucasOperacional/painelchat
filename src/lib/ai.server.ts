// Integrações de IA: Google Gemini (ai.google.dev) e Manus API v2 (open.manus.ai).
// Uso exclusivo no servidor.

import { fetchComPrazo, fetchResiliente } from "./http.server";

// Consultar o andamento da tarefa é rápido; criar a tarefa pode demorar mais.
const MANUS_GET_TIMEOUT_MS = 20_000;
const MANUS_POST_TIMEOUT_MS = 45_000;
const GEMINI_TIMEOUT_MS = 30_000;
/** Modelo usado quando nada foi escolhido na tela de IA. */
export const MODELO_GEMINI_PADRAO = "gemini-3.8-flash";

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
  const { data, error } = await supabaseAdmin
    .from("ai_secrets")
    .select("api_key")
    .eq("provider", provider)
    .maybeSingle();
  // A chave ainda pode estar no ambiente, então a falha de leitura não derruba
  // a integração — mas precisa aparecer no log, em vez de sumir calada.
  if (error) console.error(`[ia] falha ao ler a chave de ${provider}:`, error.message);
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

/** Traduz a falha do Gemini para algo que o operador entenda e possa resolver. */
function explicarErroGemini(status: number, model: string, detalhe?: string): string {
  const extra = detalhe ? ` (${detalhe})` : "";
  if (status === 400 && /api key|API_KEY/i.test(detalhe ?? "")) {
    return `A chave do Gemini foi recusada. Gere outra em aistudio.google.com/apikey${extra}`;
  }
  if (status === 401 || status === 403) {
    return `A chave do Gemini não tem permissão para usar a API${extra}`;
  }
  if (status === 404) {
    return `O modelo "${model}" não existe ou não está disponível para esta chave. Escolha outro modelo em Inteligência artificial${extra}`;
  }
  if (status === 429) {
    return `Limite de uso do Gemini atingido. Aguarde um instante e tente de novo${extra}`;
  }
  if (status >= 500) {
    return `O Gemini está instável no momento. Tente novamente em alguns segundos${extra}`;
  }
  return `Falha na API do Gemini (HTTP ${status})${extra}`;
}

/** Google Gemini — generateContent (https://ai.google.dev/gemini-api/docs) */
export async function geminiGenerate(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Promise<string> {
  const apiKey = await loadApiKey("gemini");
  if (!apiKey) {
    throw new Error(
      "Token do Google Gemini não configurado. Cole a chave em Inteligência artificial.",
    );
  }
  // Modelos antigos (ex.: gemini-2.5-*) foram desligados pelo Google para novas
  // contas: quem tiver essa escolha salva é levado para o modelo atual.
  const pedido = (input.model || MODELO_GEMINI_PADRAO).trim();
  const model = /^gemini-(1|2)\./.test(pedido) ? MODELO_GEMINI_PADRAO : pedido;

  // Gerar texto é idempotente para o nosso uso (nada é cobrado nem enviado ao
  // cliente sem revisão), então vale repetir quando o serviço oscila.
  const chamar = (m: string) =>
    fetchResiliente(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
        }),
      },
      { label: "a IA do Gemini", timeoutMs: GEMINI_TIMEOUT_MS },
    );

  // Modelo inexistente ou indisponível para a chave: tenta o padrão antes de
  // desistir, para o atendente não ficar sem resposta por causa da escolha.
  let response = await chamar(model);
  if (response.status === 404 && model !== MODELO_GEMINI_PADRAO) {
    console.warn(`[ia] modelo "${model}" indisponível; usando ${MODELO_GEMINI_PADRAO}.`);
    response = await chamar(MODELO_GEMINI_PADRAO);
  }

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
  } | null;

  if (!response.ok) {
    throw new Error(explicarErroGemini(response.status, model, payload?.error?.message));
  }

  // Pedido recusado pelos filtros de segurança: sem candidato nenhum.
  if (payload?.promptFeedback?.blockReason) {
    throw new Error(
      `O Gemini recusou o pedido (${payload.promptFeedback.blockReason}). Ajuste as instruções do agente.`,
    );
  }

  const candidato = payload?.candidates?.[0];
  const text = (candidato?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    // Sem texto, o motivo do fim explica o que aconteceu de verdade.
    const motivo = candidato?.finishReason;
    if (motivo === "MAX_TOKENS") {
      throw new Error("A resposta do Gemini ficou longa demais e foi cortada. Tente novamente.");
    }
    if (motivo === "SAFETY" || motivo === "PROHIBITED_CONTENT" || motivo === "BLOCKLIST") {
      throw new Error("O Gemini bloqueou a resposta por política de conteúdo.");
    }
    if (motivo === "RECITATION") {
      throw new Error("O Gemini bloqueou a resposta por repetir conteúdo protegido.");
    }
    throw new Error(
      motivo
        ? `O Gemini não retornou texto (${motivo}).`
        : "O Gemini não retornou texto. Tente novamente.",
    );
  }
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

  // GET (consulta de andamento) pode ser repetido; POST cria tarefa e não pode.
  const enviar = options.method === "GET" ? fetchResiliente : fetchComPrazo;
  const response = await enviar(url, init, {
    label: "o Manus",
    timeoutMs: options.method === "GET" ? MANUS_GET_TIMEOUT_MS : MANUS_POST_TIMEOUT_MS,
  });
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
    await new Promise((r) => setTimeout(r, 2000));

    const page = await manusRequest<{
      messages?: {
        type?: string;
        status?: string;
        content?: unknown;
        text?: string;
        assistant_message?: { content?: unknown };
        status_update?: { agent_status?: string };
        error_message?: { content?: unknown; message?: string };
      }[];
    }>("/v2/task.listMessages", {
      method: "GET",
      query: { task_id: taskId, order: "asc", limit: "50" },
    });

    const messages = page.messages ?? [];
    for (const event of messages) {
      if (event.type === "assistant_message") {
        const raw = event.assistant_message?.content ?? event.content ?? event.text;
        const text =
          typeof raw === "string"
            ? raw
            : Array.isArray(raw)
              ? (raw as { text?: string }[]).map((p) => p.text ?? "").join("")
              : "";
        if (text.trim()) lastAssistant = text.trim();
      }
      if (event.type === "error_message") {
        const raw = event.error_message?.content ?? event.error_message?.message ?? event.content;
        throw new Error(typeof raw === "string" ? raw : "O Manus retornou um erro.");
      }
    }

    const finished = messages.some(
      (e) => {
        if (e.type !== "status_update") return false;
        const st = e.status_update?.agent_status ?? e.status;
        return st === "stopped" || st === "error";
      },
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
