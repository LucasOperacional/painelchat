// Cliente HTTP da Evolution Go — segue exclusivamente a documentação oficial:
// https://docs.evolutionfoundation.com.br/evolution-go
//
// Autenticação (docs → Webhooks / Configuração Inicial):
//   Header apikey      = GLOBAL_API_KEY do servidor Evolution Go
//   Header instanceId  = UUID da instância
// Uso exclusivo no servidor.

export const EVOLUTION_DEFAULT_BASE_URL = "https://api.nxsplus.xyz";
export { WUZAPI_DEFAULT_BASE_URL } from "@/lib/wuzapi.server";

/** Eventos assinados no webhook da instância (docs → Webhooks). */
// Todos os eventos oficiais marcados de forma explícita: assim a Evolution Go
// guarda a lista completa na instância e a conexão continua firme mesmo depois
// de uma queda ou reinício do servidor.
export const EVOLUTION_SUBSCRIBE = [
  "Message",
  "SendMessage",
  "Receipt",
  "Connected",
  "Disconnected",
  "LoggedOut",
  "PairSuccess",
  "QRCode",
  "OfflineSyncCompleted",
  "HistorySync",
  "ChatPresence",
  "Presence",
  "CallOffer",
  "CallTerminate",
  "GroupInfo",
  "Newsletter",
  "Picture",
  "UserAbout",
  "Label",
  "ButtonClick",
] as const;

/**
 * Nomes usados pelas versões da Evolution API baseadas em eventos
 * (MESSAGES_UPSERT e companhia). Servidores que recusam a lista do Evolution Go
 * costumam aceitar esta, então ela é a segunda tentativa.
 */
export const EVOLUTION_SUBSCRIBE_V2 = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
  "CONNECTION_UPDATE",
  "STATUS_INSTANCE",
  "QRCODE_UPDATED",
  "CONTACTS_UPSERT",
  "CHATS_UPSERT",
  "GROUPS_UPSERT",
] as const;

/** Atalho aceito por servidores antigos caso a lista explícita seja recusada. */
export const EVOLUTION_SUBSCRIBE_FALLBACK = ["ALL"] as const;

/** Assinatura guardada no banco para saber se o webhook precisa ser refeito. */
export function webhookEventsSignature(events: readonly string[]) {
  return [...events].sort().join(",");
}


/** A mensagem de erro indica recusa da lista de eventos do webhook? */
export function isWebhookEventsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /eventos?\s+para\s+webhook|invalid.*event|event.*invalid|subscribe/i.test(message);
}


export { digitsOnly, jidToPhone, formatBrPhone } from "@/lib/phone";

export type EvolutionConfig = {
  id: string;
  base_url: string;
  instance_id: string;
  instance_name: string;
  phone: string;
  status: string;
  last_qr: string | null;
  last_event: string | null;
  default_queue_id: string | null;
  provider: string;
  webhook_token: string;
  color: string;
  label: string;
  is_default: boolean;
  company: string;
  display_id: string | null;
  webhook_url?: string | null;
  webhook_events?: string | null;
  webhook_synced_at?: string | null;
  updated_at: string;
  created_at: string;
};

/** Envelope padrão das respostas: { data, message }. */
type EvolutionEnvelope<T> = { data?: T; message?: string };

/**
 * Carrega um dispositivo específico; sem id, usa o dispositivo padrão.
 * Quando um aparelho é indicado e não existe mais, a função falha em vez de
 * trocar silenciosamente para outro número — a resposta sempre sai do mesmo
 * número que recebeu a mensagem, salvo transferência explícita.
 */
export async function loadEvolutionConfig(
  configId?: string | null,
): Promise<EvolutionConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (configId) {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_config")
      .select("*")
      .eq("id", configId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as EvolutionConfig;
    throw new Error(
      "O aparelho desta conversa não está mais cadastrado. Transfira a conversa para outro aparelho antes de responder.",
    );
  }
  const { data, error } = await supabaseAdmin
    .from("whatsapp_config")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EvolutionConfig | null) ?? null;
}

/**
 * Descobre com qual aparelho a conversa deve responder e grava essa escolha.
 * Conversa sem aparelho definido herda o do último atendimento do contato;
 * nunca cai para o aparelho padrão por conta própria.
 */
export async function resolveConversationConfigId(
  conversationId: string,
  current?: string | null,
): Promise<string | null> {
  if (current) return current;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: conversa } = await supabaseAdmin
    .from("conversations")
    .select("contact_id, sem_conexao, contact:contacts(phone, wa_jid, project_id)")
    .eq("id", conversationId)
    .maybeSingle();
  const row = conversa as {
    contact_id?: string;
    sem_conexao?: boolean;
    contact?: { phone?: string | null; wa_jid?: string | null; project_id?: string | null } | null;
  } | null;
  const contactId = row?.contact_id;
  if (!contactId) return null;
  // O aparelho desta conversa foi removido: ela fica sem conexão até que
  // alguém escolha manualmente outra. Nada é herdado automaticamente.
  if (row?.sem_conexao) return null;

  // Primeiro procura outra conversa do mesmo cadastro. Se o contato tiver sido
  // duplicado, inclui todos os cadastros do mesmo telefone/JID no mesmo projeto.
  // Isso evita que uma conversa antiga, ainda visível no chat, perca o aparelho
  // que acabou de receber uma mensagem desse mesmo número.
  const contactIds = new Set<string>([contactId]);
  const phone = (row?.contact?.phone ?? "").trim();
  const waJid = (row?.contact?.wa_jid ?? "").trim();
  if (phone || waJid) {
    let matchingContacts = supabaseAdmin.from("contacts").select("id");
    if (row?.contact?.project_id) matchingContacts = matchingContacts.eq("project_id", row.contact.project_id);
    const alternatives = [phone ? `phone.eq.${phone}` : "", waJid ? `wa_jid.eq.${waJid}` : ""]
      .filter(Boolean)
      .join(",");
    if (alternatives) {
      const { data: matches } = await matchingContacts.or(alternatives);
      for (const match of (matches ?? []) as { id: string }[]) contactIds.add(match.id);
    }
  }

  const { data: anterior } = await supabaseAdmin
    .from("conversations")
    .select("whatsapp_config_id")
    .in("contact_id", [...contactIds])
    .not("whatsapp_config_id", "is", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const herdado = (anterior as { whatsapp_config_id?: string } | null)?.whatsapp_config_id ?? null;
  if (!herdado) return null;

  await supabaseAdmin
    .from("conversations")
    .update({ whatsapp_config_id: herdado } as never)
    .eq("id", conversationId);
  return herdado;
}

/**
 * Aparelho que deve responder a conversa. Se o aparelho dela foi removido,
 * recusa o envio em vez de usar o aparelho padrão.
 */
export async function ensureConversationDevice(
  conversationId: string,
  current?: string | null,
): Promise<EvolutionConfig> {
  const configId = await resolveConversationConfigId(conversationId, current);
  if (!configId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("conversations")
      .select("sem_conexao")
      .eq("id", conversationId)
      .maybeSingle();
    if ((data as { sem_conexao?: boolean } | null)?.sem_conexao) {
      throw new Error(
        "O aparelho desta conversa foi removido. Transfira a conversa para a conexão desejada antes de responder.",
      );
    }
  }
  return ensureEvolutionDevice(configId);
}

/** Lista todos os dispositivos de WhatsApp cadastrados na central. */
export async function listEvolutionConfigs(projectId?: string | null): Promise<EvolutionConfig[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin.from("whatsapp_config").select("*");
  // Cada endereço (franquia) enxerga só os próprios aparelhos.
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as EvolutionConfig[];
}

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "").trim().replace(/\/+$/, "");
}

/**
 * Cache curto em memória para credenciais e status de login.
 * Sem ele cada envio gastava 2 consultas ao banco antes do HTTP.
 */
const memo = new Map<string, { value: string | boolean; expires: number }>();

function memoGet<T extends string | boolean>(key: string): T | undefined {
  const hit = memo.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    memo.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function memoSet(key: string, value: string | boolean, ttlMs: number) {
  memo.set(key, { value, expires: Date.now() + ttlMs });
}

function memoClear(prefixOrKey: string) {
  for (const key of [...memo.keys()]) {
    if (key.startsWith(prefixOrKey)) memo.delete(key);
  }
}

/** Qual provedor atende este dispositivo: "evolution" (padrão) ou "wuzapi". */
async function providerOf(configId: string | null): Promise<string> {
  const cacheKey = `provider:${configId ?? "default"}`;
  const cached = memoGet<string>(cacheKey);
  if (cached !== undefined) return cached;
  let provider = "evolution";
  try {
    const config = await loadEvolutionConfig(configId);
    provider = (config?.provider || "evolution").trim().toLowerCase();
  } catch {
    provider = "evolution";
  }
  memoSet(cacheKey, provider, 30_000);
  return provider;
}

/** Provedor deste dispositivo ("evolution" ou "wuzapi"), para uso externo. */
export async function deviceProvider(configId: string | null): Promise<string> {
  return providerOf(configId);
}

/** Limpa o provedor em cache (usar ao trocar a API de um dispositivo). */
export function invalidateProviderCache() {
  memoClear("provider:");
  memoClear("token:");
  memoClear("key:");
  memoClear("apikey:");
}

/**
 * Credencial global de uma integração (token + endereço), salva sem depender
 * de nenhum dispositivo. Assim o token continua guardado mesmo antes de existir
 * um aparelho vinculado.
 */
export const GLOBAL_CONFIG_ID = "00000000-0000-0000-0000-000000000000";

export async function saveProviderGlobalCredentials(input: {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: current } = await supabaseAdmin
    .from("whatsapp_secrets")
    .select("instance_token, base_url")
    .eq("provider", input.provider)
    .eq("config_id", GLOBAL_CONFIG_ID)
    .maybeSingle();
  const previous = (current ?? {}) as { instance_token?: string; base_url?: string };

  const { error } = await supabaseAdmin.from("whatsapp_secrets").upsert(
    {
      provider: input.provider,
      config_id: GLOBAL_CONFIG_ID,
      instance_token: (input.apiKey ?? "").trim() || previous.instance_token || "",
      base_url: (input.baseUrl ?? "").trim() || previous.base_url || "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,config_id" },
  );
  if (error) throw new Error(error.message);
  invalidateProviderCache();
}

/** Endereço salvo (ou padrão) do servidor conforme a integração escolhida. */
export async function defaultBaseUrlFor(provider: string): Promise<string> {
  const { WUZAPI_DEFAULT_BASE_URL: wuz } = await import("@/lib/wuzapi.server");
  const { WAHA_DEFAULT_BASE_URL: waha } = await import("@/lib/waha.server");
  const fallback =
    provider === "wuzapi" ? wuz : provider === "waha" ? waha : EVOLUTION_DEFAULT_BASE_URL;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_secrets")
      .select("base_url")
      .eq("provider", provider)
      .eq("config_id", GLOBAL_CONFIG_ID)
      .maybeSingle();
    const saved = ((data as { base_url?: string } | null)?.base_url ?? "").trim();
    if (saved) return saved.replace(/\/+$/, "");
  } catch {
    /* sem credencial global salva: usa o padrão */
  }
  return fallback;
}

export async function evolutionRequest<T = unknown>(options: {
  baseUrl: string;
  instanceId?: string | undefined;
  configId?: string | null;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  /** Força a integração usada, sem depender do que está salvo/em cache. */
  provider?: string | undefined;
}): Promise<T> {
  // Rotas globais (/instance/all e /instance/create) usam a API Key global.
  // As demais são da instância e exigem o token dela como apikey.
  const isGlobalPath = /^\/instance\/(all|create)$/.test(options.path);

  // Conexões da WuzAPI falam outro dialeto: traduzimos a chamada mantendo a
  // mesma resposta { data } que o restante da central já consome.
  const resolvedProvider =
    (options.provider ?? "").trim().toLowerCase() || (await providerOf(options.configId ?? null));

  // Conexões da WAHA: cada dispositivo é uma "session" no servidor WAHA.
  // A WAHA usa somente a chave da API, então nem buscamos o token da instância
  // (uma consulta a menos no banco antes de cada envio).
  if (resolvedProvider === "waha") {
    const { wahaDispatch } = await import("@/lib/waha.server");
    let session = (options.instanceId ?? "").trim();
    if (!session) {
      const config = await loadEvolutionConfig(options.configId ?? null);
      session = (config?.instance_id || config?.instance_name || "").trim();
    }
    return (await wahaDispatch({
      baseUrl: options.baseUrl,
      path: options.path,
      ...(options.method ? { method: options.method } : {}),
      body: options.body,
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(session ? { session } : {}),
      apiKey: await loadWahaApiKey(options.configId ?? null),
    })) as T;
  }

  const instanceToken = isGlobalPath
    ? ""
    : await loadEvolutionInstanceToken(options.configId ?? null);

  if (resolvedProvider === "wuzapi") {
    const { wuzapiDispatch } = await import("@/lib/wuzapi.server");
    return (await wuzapiDispatch({
      baseUrl: options.baseUrl,
      path: options.path,
      ...(options.method ? { method: options.method } : {}),
      body: options.body,
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      token: instanceToken || (await loadEvolutionInstanceToken(options.configId ?? null)),
      adminToken: await loadWuzapiAdminToken(options.configId ?? null),
    })) as T;
  }




  const apiKey = instanceToken || (await loadEvolutionApiKey(options.configId ?? null));
  if (!apiKey)
    throw new Error(
      "Falta cadastrar a API Key global da Evolution Go em Administração → API de conexão.",
    );
  const base = normalizeBaseUrl(options.baseUrl) || EVOLUTION_DEFAULT_BASE_URL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: apiKey,
  };
  if (options.instanceId) headers["instanceId"] = options.instanceId;

  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  // A Evolution Go limita requisições (429 rate-overlimit). Em vez de quebrar a
  // tela, esperamos um pouco e tentamos de novo algumas vezes.
  let response!: Response;
  let text = "";
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      response = await fetch(`${base}${options.path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if ((error as Error).name === "AbortError")
        throw new Error(
          "O servidor Evolution Go não respondeu no tempo esperado. Tente novamente.",
        );
      throw new Error(
        "Não foi possível falar com o servidor Evolution Go. Confira o endereço em Administração → API de conexão.",
      );
    } finally {
      clearTimeout(timer);
    }

    text = await response.text();
    if ((response.status === 429 || response.status === 503) && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 10_000)
        : attempt * 1500;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    break;
  }

  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) throw new Error(describeEvolutionError(response.status, payload));
  return payload as T;
}

/** Traduz o ErrorResponse documentado ({ success, error: { code, message } }). */
function describeEvolutionError(status: number, payload: unknown): string {
  const raw = payload as
    | { error?: string | { code?: string; message?: string }; message?: string }
    | string
    | null;
  const errorField = typeof raw === "object" && raw ? raw.error : undefined;
  const message =
    (typeof errorField === "string" ? errorField : errorField?.message) ??
    (typeof raw === "object" && raw ? raw.message : typeof raw === "string" ? raw : undefined) ??
    `Falha na Evolution Go (HTTP ${status}).`;

  if (/client is nil|not logged|no session|logged\s*out/i.test(message)) {
    return "O WhatsApp deste dispositivo não está pareado. Abra Administração → Dispositivos e leia o QR Code para voltar a enviar mensagens.";
  }
  if (/not registered on whatsapp|not exists on whatsapp|invalid.*number/i.test(message)) {
    return "Esse número não tem WhatsApp ativo. Confira o DDD e os dígitos e tente novamente.";
  }
  if (status === 429 || /rate-?overlimit|too many requests/i.test(message)) {
    return "O servidor do WhatsApp recebeu pedidos demais e pediu uma pausa. Aguarde alguns segundos e tente novamente.";
  }
  if (status === 401 || status === 403) {
    return "A Evolution Go recusou as credenciais. Revise a API Key global em Administração → API de conexão.";
  }
  if (status === 404) {
    return "A Evolution Go não encontrou essa instância. Confira o ID da instância em Administração → API de conexão.";
  }
  return message;
}

// ---------------------------------------------------------------------------
// Instância (docs → Referência API › Instance)
// ---------------------------------------------------------------------------

type InstanceTarget = {
  baseUrl: string;
  instanceId?: string;
  configId?: string | null;
  timeoutMs?: number;
  provider?: string | undefined;
};

/** POST /instance/create → { data: { id, name, token } } */
export async function evolutionCreateInstance(
  target: { baseUrl: string; configId?: string | null; provider?: string | undefined },
  input: { name: string },
): Promise<{ id: string; name: string; token: string }> {
  // Embora o token seja opcional na documentação, algumas instalações da
  // Evolution Go não o devolvem quando ele é gerado automaticamente. Criá-lo
  // aqui garante que as chamadas seguintes da instância sempre sejam
  // autenticadas e evita o erro "token is required".
  const requestedToken = crypto.randomUUID();
  const res = await evolutionRequest<EvolutionEnvelope<{ id?: string; name?: string; token?: string }>>({
    baseUrl: target.baseUrl,
    configId: target.configId ?? null,
    path: "/instance/create",
    method: "POST",
    body: { name: input.name, token: requestedToken },
    provider: target.provider,
  });
  const id = res?.data?.id ?? "";
  if (!id)
    throw new Error(
      `O servidor ${target.provider === "wuzapi" ? "WuzAPI" : target.provider === "waha" ? "WAHA" : "Evolution Go"} não retornou o identificador da conexão criada.`,
    );
  return {
    id,
    name: res?.data?.name ?? input.name,
    token: res?.data?.token ?? requestedToken,
  };
}

/** POST /instance/connect — conecta e registra o webhook desta central. */
export async function evolutionConnectInstance(
  target: InstanceTarget,
  input: { webhookUrl: string; phone?: string; immediate?: boolean },
): Promise<{ qrcode: string | null; pairingCode: string | null; jid: string }> {
  const attempt = async (events: readonly string[], byEvents: boolean) => {
    const body: Record<string, unknown> = {
      webhookUrl: input.webhookUrl,
      // Formato exato da documentação: apenas "subscribe" (array).
      subscribe: [...events],
    };
    // Servidores baseados em eventos aceitam a entrega separada por evento.
    if (byEvents) {
      body["webhook_by_events"] = true;
      body["webhookByEvents"] = true;
      body["events"] = [...events];
    }
    if (input.phone) body["phone"] = input.phone;
    if (input.immediate) body["immediate"] = true;

    return evolutionRequest<
      EvolutionEnvelope<{ jid?: string; webhookUrl?: string; Qrcode?: string; Code?: string }>
    >({
      baseUrl: target.baseUrl,
      instanceId: target.instanceId,
      configId: target.configId ?? null,
      provider: target.provider,
      path: "/instance/connect",
      method: "POST",
      body,
    });
  };

  let res: EvolutionEnvelope<{
    jid?: string;
    webhookUrl?: string;
    Qrcode?: string;
    Code?: string;
  }>;
  // Tenta, em ordem: lista do Evolution Go → lista por eventos → "ALL".
  let aceitos: readonly string[] = EVOLUTION_SUBSCRIBE;
  try {
    res = await attempt(EVOLUTION_SUBSCRIBE, false);
  } catch (error) {
    // "Eventos para Webhook inválidos": o servidor recusou a lista completa.
    if (!isWebhookEventsError(error)) throw error;
    try {
      aceitos = EVOLUTION_SUBSCRIBE_V2;
      res = await attempt(EVOLUTION_SUBSCRIBE_V2, true);
    } catch (erroV2) {
      if (!isWebhookEventsError(erroV2)) throw erroV2;
      aceitos = EVOLUTION_SUBSCRIBE_FALLBACK;
      res = await attempt(EVOLUTION_SUBSCRIBE_FALLBACK, false);
    }
  }

  // Guarda o endereço e os eventos confirmados: se a Evolution Go cair ou a
  // lista mudar, a central sabe que precisa reafirmar o webhook na volta.
  if (target.configId) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("whatsapp_config")
        .update({
          webhook_url: res?.data?.webhookUrl || input.webhookUrl,
          webhook_events: webhookEventsSignature(aceitos),
          webhook_synced_at: new Date().toISOString(),
        } as never)
        .eq("id", target.configId);
    } catch {
      /* a conexão vale mesmo se o registro do webhook não for salvo */
    }
  }

  return {
    qrcode: extractEvolutionQr(res),
    pairingCode: res?.data?.Code ?? null,
    jid: res?.data?.jid ?? "",
  };
}

/**
 * Endereço público e estável desta central para receber os eventos.
 *
 * Precisa ser SEMPRE o mesmo, não importa quem chama (webhook, monitor a cada
 * minuto, sentinela a cada 5 minutos). Quando o endereço variava entre dois
 * nomes do mesmo site, cada rotina "corrigia" o endereço da outra e religava a
 * instância — o religamento reenviava o histórico (mensagens antigas voltavam a
 * notificar) e cortava a chegada das mensagens novas.
 */
export function evolutionPublicOrigin(_requestUrl?: string | null) {
  const configurado = (process.env["PUBLIC_SITE_URL"] ?? "").trim().replace(/\/+$/, "");
  if (/^https:\/\//.test(configurado)) return configurado;
  const projectId = process.env["LOVABLE_PROJECT_ID"] ?? "a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779";
  return `https://project--${projectId}.lovable.app`;
}

const WEBHOOK_SILENCE_MS = 10 * 60 * 1000;
const WEBHOOK_FORCE_COOLDOWN_MS = 30 * 60 * 1000;
/** Quando alguém pede à força (queda, silêncio, novo pareamento), a espera é curta. */
const WEBHOOK_FORCE_MIN_MS = 5 * 60 * 1000;


async function ultimoEventoRecebidoWebhook(token: string | null | undefined) {
  if (!token) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("webhook_eventos")
      .select("created_at")
      .eq("token", token)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as { created_at?: string } | null)?.created_at ?? null;
  } catch {
    return null;
  }
}

/** Nomes do site que apontam para esta mesma central. */
function hostsDaCentral() {
  const projectId = process.env["LOVABLE_PROJECT_ID"] ?? "a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779";
  const hosts = new Set<string>([
    `project--${projectId}.lovable.app`,
    "painelchat.lovable.app",
  ]);
  const configurado = (process.env["PUBLIC_SITE_URL"] ?? "").trim();
  try {
    if (configurado) hosts.add(new URL(configurado).host);
  } catch {
    /* endereço mal formado: ignora */
  }
  return hosts;
}

/**
 * Autocorreção do webhook: se o endereço registrado não for desta central ou a
 * lista de eventos estiver faltando/desatualizada, reconfigura na hora.
 */
export async function ensureEvolutionWebhook(
  configId: string,
  options?: { requestUrl?: string | null; force?: boolean },
): Promise<boolean> {
  try {
    const config = await loadEvolutionConfig(configId);
    if (!config?.base_url || !config.instance_id) return false;
    const origin = evolutionPublicOrigin(options?.requestUrl ?? null);
    const inboundUrl = `${origin}/api/public/evolution?token=${config.webhook_token ?? ""}`;
    const registrado = (config as { webhook_url?: string | null }).webhook_url ?? null;
    const eventos = (config as { webhook_events?: string | null }).webhook_events ?? null;
    const confirmadoEm = (config as { webhook_synced_at?: string | null }).webhook_synced_at;
    const eventosOk = [
      EVOLUTION_SUBSCRIBE,
      EVOLUTION_SUBSCRIBE_V2,
      EVOLUTION_SUBSCRIBE_FALLBACK,
    ].some((lista) => webhookEventsSignature(lista) === eventos);
    const idade = confirmadoEm ? Date.now() - new Date(confirmadoEm).getTime() : Infinity;
    // Endereço certo e eventos certos: nada a fazer. Religar sem motivo faz a
    // Evolution Go reenviar o histórico (mensagens antigas voltam a notificar) e
    // interrompe a chegada das novas.
    if (!options?.force && registrado && mesmoEndereco(registrado, inboundUrl) && eventosOk) {
      return false;
    }
    // Trava de segurança contra religamento em sequência. Quando o pedido é à
    // força (queda de conexão, silêncio de eventos, novo pareamento) a espera é
    // curta: o aparelho pode ter perdido a assinatura do webhook e ficaria meia
    // hora sem entregar mensagens.
    const espera = options?.force ? WEBHOOK_FORCE_MIN_MS : WEBHOOK_FORCE_COOLDOWN_MS;
    if (idade < espera && registrado && mesmoEndereco(registrado, inboundUrl) && eventosOk) {
      return false;
    }

    await evolutionConnectInstance(
      { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id, provider: config.provider },
      { webhookUrl: inboundUrl, immediate: true },
    );
    console.log(`[webhook] reconfigurado device=${config.id}`);
    return true;
  } catch (error) {
    console.error("[webhook] falha ao reconfigurar na Evolution", error);
    return false;
  }
}

/** Endereço de webhook realmente registrado na API (quando ela informa). */
export async function evolutionGetWebhook(target: InstanceTarget): Promise<string | null> {
  for (const path of ["/webhook", "/instance/webhook"]) {
    try {
      const res = await evolutionRequest<Record<string, unknown>>({
        baseUrl: target.baseUrl,
        instanceId: target.instanceId,
        configId: target.configId ?? null,
        provider: target.provider,
        path,
        timeoutMs: 12_000,
      });
      const bag = ((res?.["data"] as Record<string, unknown>) ?? res) || {};
      const url =
        bag["webhook"] ?? bag["Webhook"] ?? bag["webhookUrl"] ?? bag["WebhookURL"] ?? bag["url"];
      if (typeof url === "string" && url.trim()) return url.trim();
    } catch {
      /* API sem consulta de webhook: seguimos para o próximo caminho */
    }
  }

  // A Evolution Go não tem consulta de webhook, mas a lista de instâncias
  // informa o endereço registrado de cada uma. Assim a central confere o que
  // está valendo sem precisar religar a conexão para "corrigir" no escuro.
  if ((target.provider ?? "").toLowerCase() !== "wuzapi" && target.instanceId) {
    try {
      const instancias = await evolutionListInstances({
        baseUrl: target.baseUrl,
        configId: target.configId ?? null,
        ...(target.provider ? { provider: target.provider } : {}),
      });
      const encontrada = instancias.find(
        (item) => String(item["id"] ?? "").trim() === target.instanceId,
      );
      const url = encontrada?.["webhook"] ?? encontrada?.["Webhook"];
      if (typeof url === "string" && url.trim()) return url.trim();
    } catch {
      /* sem credencial global ou lista indisponível: segue sem informação */
    }
  }
  return null;
}

/**
 * Compara dois endereços de webhook. Os vários nomes do mesmo site (domínio
 * publicado e endereço do projeto) valem como o mesmo endereço: o que importa é
 * o caminho e o token. Sem isso, cada rotina trocava o endereço da outra e
 * religava a conexão sem parar.
 */
function mesmoEndereco(a: string, b: string) {
  const limpar = (v: string) => v.replace(/\/+$/, "").trim();
  if (limpar(a) === limpar(b)) return true;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const mesmaRota =
      ua.pathname.replace(/\/+$/, "") === ub.pathname.replace(/\/+$/, "") &&
      (ua.searchParams.get("token") ?? "") === (ub.searchParams.get("token") ?? "");
    if (!mesmaRota) return false;
    if (ua.host === ub.host) return true;
    const hosts = hostsDaCentral();
    return hosts.has(ua.host) && hosts.has(ub.host);
  } catch {
    return false;
  }
}

export type SincronizacaoWebhook = {
  ok: boolean;
  corrigido: boolean;
  esperado: string;
  registrado: string | null;
  detalhe: string;
};

/**
 * Sincronização do webhook: confere na própria API qual endereço está
 * registrado e, se estiver diferente/ausente, reassina na hora. Chamada a cada
 * verificação automática, então nenhuma mensagem deixa de chegar por webhook
 * perdido (troca de endereço, reinício do servidor, instância recriada).
 */
export async function sincronizarWebhook(
  configId: string,
  options?: { requestUrl?: string | null },
): Promise<SincronizacaoWebhook> {
  const config = await loadEvolutionConfig(configId);
  const origin = evolutionPublicOrigin(options?.requestUrl ?? null);
  const esperado = `${origin}/api/public/evolution?token=${config?.webhook_token ?? ""}`;
  if (!config?.base_url || !config.instance_id) {
    return {
      ok: false,
      corrigido: false,
      esperado,
      registrado: null,
      detalhe: "Aparelho sem instância configurada.",
    };
  }

  const alvo: InstanceTarget = {
    baseUrl: config.base_url,
    instanceId: config.instance_id,
    configId: config.id,
    provider: config.provider ?? undefined,
  };

  const registrado = await evolutionGetWebhook(alvo);
  if (registrado && mesmoEndereco(registrado, esperado)) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("whatsapp_config")
        .update({
          webhook_url: registrado,
          webhook_synced_at: new Date().toISOString(),
        } as never)
        .eq("id", config.id);
    } catch {
      /* confirmação é informativa */
    }
    return {
      ok: true,
      corrigido: false,
      esperado,
      registrado,
      detalhe: "Webhook já estava correto.",
    };
  }

  // A API não informa o webhook registrado: usamos o registro da própria
  // central. Se o aparelho fica conectado mas nenhum evento chega por muito
  // tempo, reassinamos uma vez por janela de segurança: isso recupera quedas em
  // que a Evolution Go perde a entrega do webhook sem derrubar a sessão.
  if (!registrado) {
    const ultimoEvento = await ultimoEventoRecebidoWebhook(config.webhook_token);
    const silencioMs = ultimoEvento ? Date.now() - new Date(ultimoEvento).getTime() : Infinity;
    const confirmadoEm = config.webhook_synced_at;
    const idadeSync = confirmadoEm ? Date.now() - new Date(confirmadoEm).getTime() : Infinity;
    const silencioso = silencioMs > WEBHOOK_SILENCE_MS && idadeSync > WEBHOOK_FORCE_MIN_MS;
    const refez = await ensureEvolutionWebhook(config.id, {
      requestUrl: options?.requestUrl ?? null,
      ...(silencioso ? { force: true } : {}),
    });
    return {
      ok: true,
      corrigido: refez,
      esperado,
      registrado: null,
      detalhe: refez
        ? silencioso
          ? "Webhook reassinado porque o aparelho estava sem entregar eventos recentes."
          : "Webhook reassinado (a API não informa o endereço atual)."
        : "Webhook confirmado pelo registro da central.",
    };
  }

  // Endereço diferente do desta central: reassina na hora.
  await ensureEvolutionWebhook(config.id, {
    requestUrl: options?.requestUrl ?? null,
    force: true,
  });
  const depois = await evolutionGetWebhook(alvo);
  const certo = depois ? mesmoEndereco(depois, esperado) : true;
  console.log(
    `[webhook] sincronizado device=${config.id} antes=${registrado} agora=${depois ?? "?"}`,
  );
  return {
    ok: certo,
    corrigido: true,
    esperado,
    registrado: depois ?? registrado,
    detalhe: certo
      ? "Webhook reassinado na API."
      : "Não foi possível confirmar o webhook na API.",
  };
}

/** Quanto tempo um aparelho conectado pode ficar sem entregar avisos. */
const SESSAO_MUDA_MS = 20 * 60 * 1000;
/** No máximo uma reinicialização de sessão por aparelho nessa janela. */
const SESSAO_REINICIO_COOLDOWN_MS = 30 * 60 * 1000;
const ultimoReinicioSessao = new Map<string, number>();

/**
 * Última linha de defesa contra perda de mensagens: às vezes a API aceita a
 * assinatura do webhook e mesmo assim para de entregar qualquer aviso. Quando o
 * aparelho está conectado e fica calado por muito tempo, reiniciamos a sessão
 * (desconecta e conecta de novo, sem pedir QR) e reafirmamos o endereço.
 */
export async function reiniciarSessaoMuda(
  configId: string,
  options?: { requestUrl?: string | null },
): Promise<{ reiniciado: boolean; detalhe: string }> {
  const config = await loadEvolutionConfig(configId);
  if (!config?.base_url || !config.instance_id) {
    return { reiniciado: false, detalhe: "Aparelho sem endereço da API." };
  }

  const ultimoEvento = await ultimoEventoRecebidoWebhook(config.webhook_token);
  const silencioMs = ultimoEvento ? Date.now() - new Date(ultimoEvento).getTime() : Infinity;
  if (silencioMs < SESSAO_MUDA_MS) {
    return { reiniciado: false, detalhe: "O aparelho está entregando avisos normalmente." };
  }

  const anterior = ultimoReinicioSessao.get(configId) ?? 0;
  if (Date.now() - anterior < SESSAO_REINICIO_COOLDOWN_MS) {
    return { reiniciado: false, detalhe: "Reinicialização recente: aguardando a próxima janela." };
  }
  ultimoReinicioSessao.set(configId, Date.now());

  const alvo: InstanceTarget = {
    baseUrl: config.base_url,
    instanceId: config.instance_id,
    configId: config.id,
    provider: config.provider,
  };
  const inboundUrl = `${evolutionPublicOrigin(options?.requestUrl ?? null)}/api/public/evolution?token=${config.webhook_token ?? ""}`;

  // Silêncio sozinho não prova defeito (pode só não ter chegado mensagem).
  // Nunca derrubamos uma sessão que a API informa como conectada: apenas
  // reassinamos o webhook, o que é seguro e não interrompe o recebimento.
  let conectado = false;
  try {
    const st = await evolutionGetStatus({ ...alvo, timeoutMs: 15_000 } as InstanceTarget);
    conectado = st.connected && st.loggedIn;
  } catch {
    conectado = false;
  }
  if (conectado) {
    // Silêncio não prova defeito. Chamar connect/start numa sessão saudável
    // interrompe o recebimento por alguns segundos e pode fazê-la não voltar.
    console.log(`[webhook] silêncio com sessão conectada: nenhuma ação device=${config.id}`);
    return { reiniciado: false, detalhe: "Sessão conectada; nenhuma reinicialização necessária." };
  }
  try {
    await evolutionConnectInstance(alvo, { webhookUrl: inboundUrl, immediate: true });
  } catch (error) {
    console.error(`[webhook] falha ao religar device=${config.id}`, (error as Error)?.message);
  }
  invalidateEvolutionSessionCache(config.instance_id);
  console.log(`[webhook] sessão religada por silêncio device=${config.id}`);
  const minutos = Number.isFinite(silencioMs) ? Math.round(silencioMs / 60000) : null;
  return {
    reiniciado: true,
    detalhe: minutos
      ? `A sessão foi reiniciada após ${minutos} minutos sem nenhum aviso da API.`
      : "A sessão foi reiniciada porque a API nunca entregou avisos.",
  };
}


/** GET /instance/qr → { data: { Qrcode, Code } } */
export async function evolutionGetQr(
  target: InstanceTarget,
): Promise<{ qrcode: string | null; code: string | null }> {
  const res = await evolutionRequest<EvolutionEnvelope<{ Qrcode?: string; Code?: string }>>({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    provider: target.provider,
    path: "/instance/qr",
  });
  return { qrcode: extractEvolutionQr(res), code: res?.data?.Code ?? null };
}

/** GET /instance/status → { data: { Connected, LoggedIn, Name } } */
export async function evolutionGetStatus(target: InstanceTarget): Promise<{
  connected: boolean;
  loggedIn: boolean;
  name: string;
  phone: string;
}> {
  const res = await evolutionRequest<
    EvolutionEnvelope<{ Connected?: boolean; LoggedIn?: boolean; Name?: string; Jid?: string }>
  >({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    provider: target.provider,
    path: "/instance/status",
    timeoutMs: target.timeoutMs ?? 20_000,
  });
  return extractEvolutionConnection(res);
}

/** POST /instance/pair → { data: { PairingCode } } */
export async function evolutionPair(
  target: InstanceTarget,
  input: { phone: string },
): Promise<string | null> {
  const attempt = (events: readonly string[]) =>
    evolutionRequest<EvolutionEnvelope<{ PairingCode?: string }>>({
      baseUrl: target.baseUrl,
      instanceId: target.instanceId,
      configId: target.configId ?? null,
      provider: target.provider,
      path: "/instance/pair",
      method: "POST",
      body: { phone: input.phone, subscribe: [...events] },
    });
  let res: EvolutionEnvelope<{ PairingCode?: string }>;
  try {
    res = await attempt(EVOLUTION_SUBSCRIBE);
  } catch (error) {
    if (!isWebhookEventsError(error)) throw error;
    res = await attempt(EVOLUTION_SUBSCRIBE_FALLBACK);
  }
  return res?.data?.PairingCode ?? null;
}


/** DELETE /instance/logout — encerra a sessão do WhatsApp na instância. */
export async function evolutionLogout(target: InstanceTarget) {
  return evolutionRequest({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    path: "/instance/logout",
    method: "DELETE",
  });
}

/** POST /instance/disconnect — desliga a instância sem apagar a sessão. */
export async function evolutionDisconnect(target: InstanceTarget) {
  return evolutionRequest({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    provider: target.provider,
    path: "/instance/disconnect",
    method: "POST",
  });
}

/** GET /instance/all — usado para validar a API Key global. */
export async function evolutionListInstances(target: {
  baseUrl: string;
  configId?: string | null;
  provider?: string | undefined;
}): Promise<Array<Record<string, unknown>>> {
  const res = await evolutionRequest<EvolutionEnvelope<Array<Record<string, unknown>>>>({
    baseUrl: target.baseUrl,
    configId: target.configId ?? null,
    path: "/instance/all",
    provider: target.provider,
  });
  return Array.isArray(res?.data) ? res.data : [];
}

// ---------------------------------------------------------------------------
// Envio de mensagens (docs → Referência API › Send Message)
// ---------------------------------------------------------------------------

type SendTarget = { baseUrl: string; instanceId: string; configId?: string | null };

/** Todas as rotas /send/* respondem { data: { Info: { ID } } }. */
function extractSentId(payload: unknown): string | null {
  const p = payload as
    | { data?: { Info?: { ID?: string }; ID?: string; id?: string } }
    | null;
  return p?.data?.Info?.ID ?? p?.data?.ID ?? p?.data?.id ?? null;
}

const NOT_PAIRED_MESSAGE =
  "O WhatsApp deste dispositivo não está pareado. Abra Administração → Dispositivos e leia o QR Code para voltar a enviar mensagens.";

/**
 * Antes de enviar, confirma que a sessão está logada.
 * Sem login a Evolution Go aceita a requisição e nunca responde (o envio ficava travando).
 * O resultado positivo fica em cache por 2 minutos para não somar um HTTP extra em cada envio.
 */
async function assertLoggedIn(target: SendTarget) {
  const cacheKey = `login:${target.instanceId}`;
  if (memoGet<boolean>(cacheKey) === true) return;

  // A WAHA responde na hora quando a sessão não está ativa, então a conferência
  // prévia só somaria uma ida e volta ao servidor antes de cada mensagem.
  if ((await providerOf(target.configId ?? null)) === "waha") return;



  // A sessão pode estar apenas reconectando (queda rápida de rede do celular).
  // Damos duas chances antes de dizer que o aparelho está desconectado.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const status = await evolutionGetStatus({
        baseUrl: target.baseUrl,
        instanceId: target.instanceId,
        configId: target.configId ?? null,
        timeoutMs: 6_000,
      });
      if (status.loggedIn) {
        memoSet(cacheKey, true, 120_000);
        return;
      }
      if (attempt === 2) throw new Error(NOT_PAIRED_MESSAGE);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      if ((error as Error).message === NOT_PAIRED_MESSAGE) throw error;
      // Falha ao consultar o status não deve impedir a tentativa de envio.
      return;
    }
  }
}

const EMERGENCY_LOOP_TARGET = "5562996928605";
// A trava total foi substituída pelas proteções definitivas contra loop:
// (1) todo evento fromMe é descartado na entrada do webhook,
// (2) o eco das respostas da central é reconhecido e ignorado,
// (3) no máximo 1 comando respondido a cada 5s por conversa.
const KILL_LOOP = false;
// Além disso, nenhum envio repetido para o número do administrador em menos de 5s.
const JANELA_ENVIO_MS = 5000;
let ultimoEnvioAdmin = 0;

function enforceEmergencySendCooldown(path: string, body: unknown) {
  if (!path.startsWith("/send/") || !body || typeof body !== "object") return;
  const number = digitsOnlyLocal(String((body as { number?: unknown }).number ?? ""));
  if (number !== EMERGENCY_LOOP_TARGET) return;
  if (KILL_LOOP) {
    console.error(`[whatsapp] KILL SWITCH: envio bloqueado para ${EMERGENCY_LOOP_TARGET}`);
    throw new Error("Envio bloqueado pela trava emergencial contra loop.");
  }
  const agora = Date.now();
  if (agora - ultimoEnvioAdmin < JANELA_ENVIO_MS) {
    console.error("[whatsapp] envio ao administrador barrado pela trava de 5s (anti-loop)");
    throw new Error("Aguarde alguns segundos antes de um novo envio para este número.");
  }
  ultimoEnvioAdmin = agora;
}


async function sendRequest(target: SendTarget, path: string, body: unknown) {
  enforceEmergencySendCooldown(path, body);
  await assertLoggedIn(target);

  const attemptSend = () =>
    evolutionRequest<unknown>({
      baseUrl: target.baseUrl,
      instanceId: target.instanceId,
      configId: target.configId ?? null,
      path,
      method: "POST",
      body,
      // Envios de grupo e de mídia podem levar bem mais tempo no servidor.
      timeoutMs: 60_000,
    });

  try {
    return extractSentId(await attemptSend());
  } catch (error) {
    // Sessão pode ter caído: descarta o cache para revalidar no próximo envio.
    memoClear(`login:${target.instanceId}`);
    if ((error as Error).message !== NOT_PAIRED_MESSAGE) throw error;

    // A sessão costuma voltar sozinha em poucos segundos; tenta de novo uma vez.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await assertLoggedIn(target);
    try {
      return extractSentId(await attemptSend());
    } catch (retryError) {
      memoClear(`login:${target.instanceId}`);
      throw retryError;
    }
  }
}

/** Invalida o cache de sessão (usado ao conectar/desconectar dispositivos). */
export function invalidateEvolutionSessionCache(instanceId?: string | null) {
  memoClear(instanceId ? `login:${instanceId}` : "login:");
}

/** POST /send/text */
export async function evolutionSendText(
  target: SendTarget,
  input: {
    number: string;
    text: string;
    delay?: number;
    /** Resposta citada (reply-to) no formato da Evolution Go. */
    quoted?: { messageId: string; participant?: string };
  },
) {
  return sendRequest(target, "/send/text", {
    number: input.number,
    text: input.text,
    ...(input.delay ? { delay: input.delay } : {}),
    ...(input.quoted?.messageId
      ? {
          quoted: {
            messageId: input.quoted.messageId,
            ...(input.quoted.participant ? { participant: input.quoted.participant } : {}),
          },
        }
      : {}),
  });
}

async function normalizeOutgoingMedia(input: {
  url: string;
  fileName: string;
  mimeType: string;
}): Promise<{ fileName: string; mimeType: string }> {
  const originalName = input.fileName.trim() || "arquivo";
  const originalMime = input.mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const genericMime = !originalMime || originalMime === "application/octet-stream" || originalMime === "binary/octet-stream";
  let isPdf = originalMime === "application/pdf" || /\.pdf$/i.test(originalName);

  if (!isPdf && (genericMime || /\.bin$/i.test(originalName))) {
    try {
      const response = await fetch(input.url, { headers: { Range: "bytes=0-7" } });
      if (response.ok) {
        const responseMime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
        const reader = response.body?.getReader();
        const firstChunk = reader ? await reader.read() : null;
        await reader?.cancel().catch(() => undefined);
        const bytes = firstChunk?.value;
        const pdfSignature =
          !!bytes &&
          bytes.length >= 5 &&
          bytes[0] === 0x25 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x44 &&
          bytes[3] === 0x46 &&
          bytes[4] === 0x2d;
        isPdf = responseMime === "application/pdf" || pdfSignature;
      }
    } catch {
      // Se a origem temporária não aceitar inspeção, preserva os metadados recebidos.
    }
  }

  if (!isPdf) return { fileName: originalName, mimeType: originalMime };
  const fileName = /\.pdf$/i.test(originalName)
    ? originalName
    : /\.bin$/i.test(originalName)
      ? originalName.replace(/\.bin$/i, ".pdf")
      : `${originalName}.pdf`;
  return { fileName, mimeType: "application/pdf" };
}

/** POST /send/media — type: image | video | audio | document */
export async function evolutionSendMedia(
  target: SendTarget,
  input: { number: string; url: string; fileName: string; mimeType: string; caption?: string },
) {
  const normalized = await normalizeOutgoingMedia(input);
  const mime = normalized.mimeType.toLowerCase();
  const type = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : "document";
  return sendRequest(target, "/send/media", {
    number: input.number,
    type,
    url: input.url,
    filename: normalized.fileName,
    mimetype: normalized.mimeType,
    caption: input.caption ?? "",
  });
}

/** POST /send/sticker — figurinha (webp). Cai para imagem comum se a API não aceitar. */
export async function evolutionSendSticker(
  target: SendTarget,
  input: { number: string; url: string },
) {
  try {
    // A rota aceita apenas o campo "sticker" (URL do .webp).
    return await sendRequest(target, "/send/sticker", {
      number: input.number,
      sticker: input.url,
    });
  } catch {
    // Se o arquivo não for aceito como figurinha, envia como imagem comum
    // ("sticker" não é um tipo válido em /send/media).
    return sendRequest(target, "/send/media", {
      number: input.number,
      type: "image",
      url: input.url,
      filename: "figurinha.webp",
      caption: "",
    });
  }
}


/** POST /send/contact */
export async function evolutionSendContact(
  target: SendTarget,
  input: { number: string; contactName: string; contactPhone: string },
) {
  return sendRequest(target, "/send/contact", {
    number: input.number,
    vcard: { fullName: input.contactName, phone: input.contactPhone },
  });
}

/** POST /send/link */
export async function evolutionSendLink(
  target: SendTarget,
  input: { number: string; url: string; text: string; title?: string; description?: string },
) {
  return sendRequest(target, "/send/link", {
    number: input.number,
    url: input.url,
    text: input.text,
    title: input.title ?? "",
    description: input.description ?? "",
  });
}

export type EvolutionMenuButton = {
  type: "reply" | "url" | "call" | "copy" | "pix";
  displayText: string;
  id?: string;
  url?: string;
  phoneNumber?: string;
  copyCode?: string;
  key?: string;
  keyType?: "phone" | "email" | "cpf" | "cnpj" | "random";
  name?: string;
  currency?: string;
};

/** POST /send/button — mensagem com botões interativos (até 3 respostas rápidas). */
export async function evolutionSendButton(
  target: SendTarget,
  input: {
    number: string;
    title: string;
    description: string;
    footer?: string;
    imageUrl?: string;
    buttons: EvolutionMenuButton[];
  },
) {
  return sendRequest(target, "/send/button", {
    number: input.number,
    title: input.title,
    description: input.description,
    footer: input.footer ?? "",
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    buttons: input.buttons,
  });
}

/** POST /send/list — menu em lista com seções (abre em tela cheia no WhatsApp). */
export async function evolutionSendList(
  target: SendTarget,
  input: {
    number: string;
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: { title: string; rows: { title: string; description?: string; rowId: string }[] }[];
  },
) {
  return sendRequest(target, "/send/list", {
    number: input.number,
    title: input.title,
    description: input.description,
    buttonText: input.buttonText,
    footerText: input.footerText ?? "",
    sections: input.sections,
  });
}

/** POST /send/poll — enquete com opções de voto. */
export async function evolutionSendPoll(
  target: SendTarget,
  input: { number: string; question: string; options: string[]; maxAnswer?: number },
) {
  return sendRequest(target, "/send/poll", {
    number: input.number,
    question: input.question,
    options: input.options,
    maxAnswer: input.maxAnswer ?? 1,
  });
}

/**
 * POST /message/delete → apaga a mensagem para todos no WhatsApp (revoke).
 * Conforme o swagger da Evolution Go, o corpo aceita apenas { chat, messageId }.
 */
export async function evolutionDeleteMessage(
  target: SendTarget,
  input: {
    number: string;
    messageId: string;
    fromMe: boolean;
    participant?: string | undefined;
  },
) {
  await assertLoggedIn(target);
  await evolutionRequest<unknown>({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    path: "/message/delete",
    method: "POST",
    body: { chat: input.number, messageId: input.messageId },
    timeoutMs: 30_000,
  });
  return true;
}

/** POST /message/markread → marca mensagens recebidas como vistas (tique azul). */
export async function evolutionMarkRead(
  target: SendTarget,
  input: { number: string; ids: string[] },
) {
  await evolutionRequest<unknown>({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    path: "/message/markread",
    method: "POST",
    body: { number: input.number, id: input.ids },
    timeoutMs: 20_000,
  });
  return true;
}



// ---------------------------------------------------------------------------
// Contatos e grupos (docs → User / Group)
// ---------------------------------------------------------------------------

/**
 * POST /user/avatar → foto de perfil do contato ou grupo.
 * A Evolution Go só responde quando o destino vem como JID completo; a versão
 * full-size (preview:false) trava, então usamos preview:true.
 */
export async function evolutionGetAvatar(
  target: SendTarget,
  input: { number: string },
): Promise<string | null> {
  const raw = (input.number ?? "").trim();
  if (!raw) return null;
  const jid = raw.includes("@")
    ? raw.replace("@c.us", "@s.whatsapp.net")
    : `${digitsOnlyLocal(raw)}@s.whatsapp.net`;

  const res = await evolutionRequest<
    EvolutionEnvelope<{ URL?: string; url?: string; PictureID?: string }>
  >({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    path: "/user/avatar",
    method: "POST",
    body: { number: jid, preview: true },
    timeoutMs: 15_000,
  });
  const url = res?.data?.URL ?? res?.data?.url ?? null;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

function digitsOnlyLocal(value: string) {
  return value.replace(/\D/g, "");
}

/** GET /group/list → grupos da instância. */
export async function evolutionListGroups(
  target: SendTarget,
): Promise<Array<Record<string, unknown>>> {
  // Junta os dois endpoints da Evolution Go para trazer todos os grupos:
  // /group/list (cache do servidor) e /group/myall (consulta ao WhatsApp).
  const all: Array<Record<string, unknown>> = [];
  let lastError: Error | null = null;
  for (const path of ["/group/list", "/group/myall"]) {
    try {
      const res = await evolutionRequest<EvolutionEnvelope<Array<Record<string, unknown>>>>({
        baseUrl: target.baseUrl,
        instanceId: target.instanceId,
        configId: target.configId ?? null,
        path,
        // A lista de grupos costuma ser grande e demorar mais que os demais
        // endpoints; damos mais tempo antes de desistir.
        timeoutMs: 45_000,
      });
      if (Array.isArray(res?.data)) all.push(...res.data);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Falha ao listar os grupos.");
    }
  }
  // Se nenhum endpoint respondeu, mostramos o motivo em vez de "nenhum grupo".
  if (all.length === 0 && lastError) throw lastError;
  return all;
}


/** POST /group/info → dados de um grupo (nome real, dono, participantes). */
export async function evolutionGroupInfo(
  target: SendTarget,
  groupJid: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await evolutionRequest<EvolutionEnvelope<Record<string, unknown>>>({
      baseUrl: target.baseUrl,
      instanceId: target.instanceId,
      configId: target.configId ?? null,
      path: "/group/info",
      method: "POST",
      body: { groupJid },
    });
    return res?.data && typeof res.data === "object" ? res.data : null;
  } catch {
    return null;
  }
}

/** Nome real do grupo: consulta /group/info quando a listagem não trouxe o nome. */
export async function evolutionResolveGroupName(
  target: SendTarget,
  groupJid: string,
): Promise<string | null> {
  const info = await evolutionGroupInfo(target, groupJid);
  if (!info) return null;
  for (const key of ["Name", "name", "Subject", "subject", "GroupName", "title"]) {
    const value = info[key];
    if (typeof value === "string" && value.trim() && !/^\d+$/.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

/** GET /user/contacts → agenda do número conectado. */
export async function evolutionListContacts(
  target: SendTarget,
): Promise<Array<Record<string, unknown>>> {
  const res = await evolutionRequest<EvolutionEnvelope<Array<Record<string, unknown>>>>({
    baseUrl: target.baseUrl,
    instanceId: target.instanceId,
    configId: target.configId ?? null,
    path: "/user/contacts",
  });
  return Array.isArray(res?.data) ? res.data : [];
}

// ---------------------------------------------------------------------------
// Leitura de respostas
// ---------------------------------------------------------------------------

/** QR Code da Evolution Go: data.Qrcode (data URL/base64) e data.Code. */
export function extractEvolutionQr(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const keys = ["Qrcode", "qrcode", "QrCode", "qrCode", "qr", "base64", "code", "Code"];
  const walk = (node: unknown, depth = 0): string | null => {
    if (!node || depth > 5) return null;
    if (typeof node === "string") {
      const v = node.trim();
      if (v.startsWith("data:image")) return v;
      if (v.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(v)) return v;
      return null;
    }
    if (typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const record = node as Record<string, unknown>;
    for (const key of keys) {
      const found = walk(record[key], depth + 1);
      if (found) return found;
    }
    for (const value of Object.values(record)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(payload);
}

/** Estado da instância: data.Connected / data.LoggedIn / data.Name. */
export function extractEvolutionConnection(payload: unknown): {
  connected: boolean;
  loggedIn: boolean;
  phone: string;
  name: string;
} {
  const seen = new Set<unknown>();
  let connected = false;
  let loggedIn = false;
  let phone = "";
  let name = "";

  const walk = (node: unknown, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 5 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, depth + 1));
      return;
    }
    const record = node as Record<string, unknown>;
    for (const [rawKey, value] of Object.entries(record)) {
      const key = rawKey.toLowerCase();
      if ((key === "connected" || key === "isconnected") && value === true) connected = true;
      if ((key === "loggedin" || key === "isloggedin") && value === true) loggedIn = true;
      if (key === "status" && typeof value === "string") {
        const state = value.toLowerCase().replace(/[\s_-]/g, "");
        if (["open", "connected", "online", "ready"].includes(state)) connected = true;
      }
      if (!phone && ["jid", "phone", "number", "wid"].includes(key) && typeof value === "string")
        phone = value;
      if (!name && ["name", "pushname", "instancename"].includes(key) && typeof value === "string")
        name = value;
      walk(value, depth + 1);
    }
  };

  walk(payload);
  return { connected, loggedIn, phone, name };
}

// ---------------------------------------------------------------------------
// API Key global e provisionamento do dispositivo
// ---------------------------------------------------------------------------

async function loadProviderApiToken(provider: string, envName: string, configId?: string | null): Promise<string> {
  const envKey = (process.env[envName] ?? "").trim();
  if (envKey) return envKey;

  // A chave muda muito pouco; guardá-la por alguns minutos evita uma consulta
  // ao banco em cada mensagem enviada (ganho direto no tempo de entrega).
  const cacheKey = `apikey:${provider}:${configId ?? "default"}`;
  const cached = memoGet<string>(cacheKey);
  if (cached !== undefined) return cached;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const query = supabaseAdmin.from("whatsapp_secrets").select("instance_token").eq("provider", provider);
  const { data } = configId
    ? await query.eq("config_id", configId).maybeSingle()
    : await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  let result = ((data as { instance_token?: string } | null)?.instance_token ?? "").trim();
  if (!result && configId) {
    const { data: shared } = await supabaseAdmin
      .from("whatsapp_secrets")
      .select("instance_token")
      .eq("provider", provider)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    result = ((shared as { instance_token?: string } | null)?.instance_token ?? "").trim();
  }
  if (result) memoSet(cacheKey, result, 300_000);
  return result;
}

/**
 * Credencial global do servidor deste dispositivo. Dispositivos da WuzAPI usam
 * o token de administrador, os da WAHA usam a chave da API e os demais usam a
 * API Key global da Evolution Go.
 */
export async function loadEvolutionApiKey(configId?: string | null): Promise<string> {
  const provider = await providerOf(configId ?? null);
  if (provider === "wuzapi") {
    return loadProviderApiToken("wuzapi", "WUZAPI_ADMIN_TOKEN", configId);
  }
  if (provider === "waha") {
    return loadProviderApiToken("waha", "WAHA_API_KEY", configId);
  }
  return loadProviderApiToken("evolution", "EVOLUTION_API_KEY", configId);
}

/** Credencial global salva para uma integração específica (sem depender do dispositivo). */
export async function loadProviderSharedKey(provider: string): Promise<string> {
  if (provider === "wuzapi") return loadProviderApiToken("wuzapi", "WUZAPI_ADMIN_TOKEN", null);
  if (provider === "waha") return loadProviderApiToken("waha", "WAHA_API_KEY", null);
  return loadProviderApiToken("evolution", "EVOLUTION_API_KEY", null);
}

/** Token de administrador do WuzAPI salvo na central, com fallback do ambiente. */
export async function loadWuzapiAdminToken(configId?: string | null): Promise<string> {
  return loadProviderApiToken("wuzapi", "WUZAPI_ADMIN_TOKEN", configId);
}

/** Chave da API da WAHA salva na central, com fallback do ambiente. */
export async function loadWahaApiKey(configId?: string | null): Promise<string> {
  return loadProviderApiToken("waha", "WAHA_API_KEY", configId);
}

/** Guarda a API Key global de um provedor (evolution/wuzapi). */
export async function saveProviderApiKey(input: {
  configId: string;
  provider: string;
  apiKey: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("whatsapp_secrets").upsert(
    {
      provider: input.provider,
      config_id: input.configId,
      instance_token: input.apiKey.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,config_id" },
  );
  if (error) throw new Error(error.message);
  memoClear("key:");
  memoClear("provider:");
  memoClear("token:");
}

/** Guarda a API Key global da Evolution Go (preserva o token da instância). */
export async function saveEvolutionApiKey(input: { configId: string; apiKey: string }) {
  await saveProviderApiKey({ configId: input.configId, provider: "evolution", apiKey: input.apiKey });
}

/** Token da instância (usado como apikey nas rotas por instância). */
export async function loadEvolutionInstanceToken(configId?: string | null): Promise<string> {
  if (!configId) return "";
  const cacheKey = `token:${configId}`;
  const cached = memoGet<string>(cacheKey);
  if (cached !== undefined) return cached;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const provider = await providerOf(configId);
  const { data } = await supabaseAdmin
    .from("whatsapp_secrets")
    .select("client_token")
    .eq("provider", provider)
    .eq("config_id", configId)
    .maybeSingle();
  const token = ((data as { client_token?: string } | null)?.client_token ?? "").trim();
  if (token) memoSet(cacheKey, token, 300_000);
  return token;
}

/** Guarda o token da instância devolvido pela Evolution Go. */
export async function saveEvolutionInstanceToken(input: { configId: string; token: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const provider = await providerOf(input.configId);
  await supabaseAdmin.from("whatsapp_secrets").upsert(
    {
      provider,
      config_id: input.configId,
      client_token: input.token.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider,config_id" },
  );
  memoSet(`token:${input.configId}`, input.token.trim(), 300_000);
}

/**
 * Garante que exista um dispositivo Evolution Go pronto para uso: cria o
 * dispositivo padrão, aplica a URL do servidor e replica a API Key global.
 */
export async function ensureEvolutionDevice(configId?: string | null): Promise<EvolutionConfig> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let config = await loadEvolutionConfig(configId);
  const provider = (config?.provider || "evolution").trim().toLowerCase();
  const defaultBase = await defaultBaseUrlFor(provider);

  const envInstanceId = (process.env["EVOLUTION_INSTANCE_ID"] ?? "").trim();
  const envInstanceName = (process.env["EVOLUTION_INSTANCE_NAME"] ?? "central").trim();

  if (!config) {
    // Só criamos o aparelho principal quando ninguém foi indicado. Com um
    // aparelho indicado, um erro claro é melhor do que responder por outro número.
    if (configId) {
      throw new Error(
        "O aparelho desta conversa não está mais disponível. Transfira a conversa para outro aparelho antes de responder.",
      );
    }
    const { data: created, error } = await supabaseAdmin
      .from("whatsapp_config")
      .insert({
        provider: "evolution",
        base_url: EVOLUTION_DEFAULT_BASE_URL,
        instance_id: envInstanceId,
        instance_name: envInstanceName || "central",
        label: "Dispositivo principal",
        company: "Suporte",
        is_default: true,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    config = created as EvolutionConfig;
  }

  let needsPatch = false;
  if (!normalizeBaseUrl(config.base_url)) {
    config.base_url = defaultBase;
    needsPatch = true;
  }
  if (!config.instance_id?.trim() && envInstanceId) {
    config.instance_id = envInstanceId;
    needsPatch = true;
  }
  if (needsPatch) {
    await supabaseAdmin
      .from("whatsapp_config")
      .update({
        base_url: config.base_url,
        instance_id: config.instance_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
  }

  const { data: own } = await supabaseAdmin
    .from("whatsapp_secrets")
    .select("instance_token")
    .eq("provider", provider)
    .eq("config_id", config.id)
    .maybeSingle();
  const ownToken = ((own as { instance_token?: string } | null)?.instance_token ?? "").trim();
  if (!ownToken) {
    // Replica a credencial global da MESMA integração (Evolution, WuzAPI, WAHA).
    const shared = await loadProviderSharedKey(provider);
    if (shared) await saveProviderApiKey({ configId: config.id, provider, apiKey: shared });
  }

  return config;
}

/**
 * Garante instância criada na Evolution Go e devolve o id dela.
 * Também garante o token da instância (apikey das rotas por instância),
 * buscando em /instance/all quando ele ainda não está guardado.
 */
export async function ensureEvolutionInstance(config: EvolutionConfig): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = config.instance_id?.trim() ?? "";

  if (current) {
    if (await loadEvolutionInstanceToken(config.id)) return current;
    // O valor salvo pode ser o id OU o token da instância: descobre os dois.
    const instances = await evolutionListInstances({
      baseUrl: config.base_url,
      configId: config.id,
      provider: config.provider ?? undefined,
    });
    const match = instances.find((i) => {
      const id = String(i["id"] ?? "");
      const token = String(i["token"] ?? "");
      const name = String(i["name"] ?? "");
      return (
        id === current ||
        token === current ||
        (!!name && name === (config.instance_name || config.label))
      );
    });
    if (match) {
      const id = String(match["id"] ?? "") || current;
      const token = String(match["token"] ?? "");
      if (token) await saveEvolutionInstanceToken({ configId: config.id, token });
      if (id !== current) {
        await supabaseAdmin
          .from("whatsapp_config")
          .update({ instance_id: id, updated_at: new Date().toISOString() })
          .eq("id", config.id);
        config.instance_id = id;
      }
      return id;
    }
    return current;
  }

  const created = await evolutionCreateInstance(
    { baseUrl: config.base_url, configId: config.id, provider: config.provider ?? undefined },
    { name: config.instance_name || config.label || "central" },
  );
  if (created.token) {
    await saveEvolutionInstanceToken({ configId: config.id, token: created.token });
  }
  await supabaseAdmin
    .from("whatsapp_config")
    .update({ instance_id: created.id, updated_at: new Date().toISOString() })
    .eq("id", config.id);
  config.instance_id = created.id;
  return created.id;
}

/** Acha a primeira string longa que pareça base64 dentro da resposta do servidor. */
function acharBase64(valor: unknown, profundidade = 0): string | null {
  if (profundidade > 6) return null;
  if (typeof valor === "string") {
    const limpo = valor.includes(",") ? valor.slice(valor.indexOf(",") + 1) : valor;
    return limpo.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(limpo) ? limpo : null;
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = acharBase64(item, profundidade + 1);
      if (achado) return achado;
    }
    return null;
  }
  if (valor && typeof valor === "object") {
    for (const item of Object.values(valor as Record<string, unknown>)) {
      const achado = acharBase64(item, profundidade + 1);
      if (achado) return achado;
    }
  }
  return null;
}

function acharMimetype(valor: unknown, profundidade = 0): string | null {
  if (profundidade > 6 || !valor || typeof valor !== "object") return null;
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    if (/mime/i.test(chave) && typeof item === "string" && item.includes("/")) return item;
    const achado = acharMimetype(item, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

/** Evolution Go: POST /message/downloadmedia devolve a mídia já descriptografada. */
async function evolutionDownloadMedia(input: {
  configId: string | null;
  kind: "image" | "sticker" | "video" | "audio" | "document";
  media: Record<string, unknown>;
}): Promise<{ base64: string; mimetype: string } | null> {
  const config = await loadEvolutionConfig(input.configId);
  const baseUrl =
    normalizeBaseUrl(config?.base_url ?? "") || (await defaultBaseUrlFor("evolution"));
  if (!baseUrl) return null;
  const token = await loadEvolutionInstanceToken(input.configId);
  if (!token) return null;
  try {
    const headers: Record<string, string> = {
      apikey: token,
      "Content-Type": "application/json",
    };
    if (config?.instance_id?.trim()) headers["instanceId"] = config.instance_id.trim();
    const res = await fetch(`${baseUrl}/message/downloadmedia`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: { [`${input.kind}Message`]: input.media } }),
    });
    const texto = await res.text();
    if (!res.ok) {
      console.error(`[evolution] download de mídia falhou (${res.status}): ${texto.slice(0, 300)}`);
      return null;
    }
    const json = JSON.parse(texto) as unknown;
    const base64 = acharBase64(json);
    if (!base64) return null;
    const mimetype =
      acharMimetype(json) ??
      (typeof input.media["mimetype"] === "string" ? (input.media["mimetype"] as string) : "") ??
      "";
    return { base64, mimetype: mimetype || "application/octet-stream" };
  } catch (error) {
    console.error("[evolution] download de mídia falhou:", (error as Error).message);
    return null;
  }
}

/**
 * Baixa a mídia de uma mensagem recebida quando o provedor entrega o arquivo
 * criptografado. Funciona nas duas conexões: WuzAPI (/chat/download…) e
 * Evolution Go (/message/downloadmedia).
 */
export async function downloadInboundMedia(input: {
  configId: string | null;
  kind: "image" | "sticker" | "video" | "audio" | "document";
  media: Record<string, unknown> | undefined;
}): Promise<{ base64: string; mimetype: string } | null> {
  if (!input.media) return null;
  const provider = await providerOf(input.configId);
  if (provider === "waha") {
    const configWaha = await loadEvolutionConfig(input.configId);
    const { wahaDownloadMedia } = await import("@/lib/waha.server");
    return wahaDownloadMedia({
      baseUrl: normalizeBaseUrl(configWaha?.base_url ?? "") || (await defaultBaseUrlFor("waha")),
      apiKey: await loadWahaApiKey(input.configId),
      media: input.media,
    });
  }
  if (provider !== "wuzapi") {
    return evolutionDownloadMedia({
      configId: input.configId,
      kind: input.kind,
      media: input.media,
    });
  }
  const config = await loadEvolutionConfig(input.configId);
  const baseUrl = normalizeBaseUrl(config?.base_url ?? "") || (await defaultBaseUrlFor("wuzapi"));
  const { wuzapiDownloadMedia } = await import("@/lib/wuzapi.server");
  return wuzapiDownloadMedia({
    baseUrl,
    token: await loadEvolutionInstanceToken(input.configId),
    adminToken: await loadWuzapiAdminToken(input.configId),
    kind: input.kind,
    media: input.media,
  });
}

