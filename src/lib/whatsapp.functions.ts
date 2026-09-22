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
    throw new Error("Apenas administradores podem gerenciar a conexão do WhatsApp.");
  }
}

/** Origem pública e acessível pela internet (o webhook exige HTTPS público). */
function publicOrigin(requestUrl: string) {
  const origin = new URL(requestUrl).origin;
  // Os domínios `id-preview--...` exigem a sessão da prévia e `-dev` serve só a
  // prévia. Para a Evolution usamos o domínio estável da versão publicada.
  if (
    /^https:\/\//.test(origin) &&
    !/localhost|127\.0\.0\.1|\/\/id-preview--/.test(origin) &&
    !/-dev\.lovable\.app$/.test(origin)
  ) {
    return origin;
  }
  const projectId =
    process.env["LOVABLE_PROJECT_ID"] ?? "a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779";
  return `https://project--${projectId}.lovable.app`;
}

function webhookUrl(request: Request, webhookToken: string) {
  const token = webhookToken || process.env["EVOLUTION_WEBHOOK_TOKEN"] || "";
  return `${publicOrigin(request.url)}/api/public/evolution?token=${token}`;
}

function inboundUrlFor(origin: string, webhookToken: string) {
  return `${origin}/api/public/evolution?token=${webhookToken}`;
}



const PROVIDERS = ["evolution", "wuzapi"] as const;

const deviceInput = z.object({ deviceId: z.string().uuid().nullable().default(null) });

/** Lista de dispositivos cadastrados (sem expor tokens). */
export const listWhatsappDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { listEvolutionConfigs } = await import("@/lib/evolution.server");
    const origin = publicOrigin(getRequest().url);
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const projectId = await projetoDoUsuario(context.userId);
    const devices = await listEvolutionConfigs(projectId);
    return devices.map((device) => ({
      id: device.id,
      label: device.label || device.instance_name || "Dispositivo",
      provider: device.provider,
      phone: device.phone,
      status: device.status,
      isDefault: device.is_default,
      color: device.color ?? "#0ea5e9",
      company: device.company || "Suporte",
      displayId: device.display_id ?? device.id.slice(0, 6).toUpperCase(),
      updatedAt: device.updated_at,
      defaultQueueId: device.default_queue_id ?? null,
      inboundUrl: inboundUrlFor(origin, device.webhook_token),
    }));
  });

/** Cria um dispositivo novo com as mesmas integrações disponíveis. */
export const createWhatsappDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        label: z.string().min(1).default("Novo dispositivo"),
        provider: z.enum(PROVIDERS).default("evolution"),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0ea5e9"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      listEvolutionConfigs,
      evolutionCreateInstance,
      saveProviderApiKey,
      saveEvolutionInstanceToken,
      loadProviderSharedKey,
      defaultBaseUrlFor,
      invalidateProviderCache,
    } = await import("@/lib/evolution.server");
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const projectId = await projetoDoUsuario(context.userId);
    const existing = await listEvolutionConfigs(projectId);
    const sameProvider = existing.filter((device) => device.provider === data.provider);
    const sharedConfig = sameProvider.find((device) => device.is_default) ?? sameProvider[0] ?? null;
    const baseUrl = sharedConfig?.base_url || (await defaultBaseUrlFor(data.provider));
    const providerLabel = data.provider === "wuzapi" ? "WuzAPI" : "Evolution Go";

    const start = 352;
    // O número de identificação é único em todo o sistema (todas as franquias),
    // então calculamos o próximo a partir de todos os aparelhos já existentes —
    // assim é possível criar quantos dispositivos forem necessários sem colisão.
    const { data: todosDisplays } = await supabaseAdmin
      .from("whatsapp_config")
      .select("display_id");
    const used = (todosDisplays ?? [])
      .map((d) => parseInt(d.display_id || "0", 10))
      .filter((n) => !isNaN(n) && n >= start);
    let nextDisplay = used.length ? Math.max(...used) + 1 : start;

    const slug =
      data.label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32).replace(/^-+|-+$/g, "") ||
      "central";
    let instanceName = `${slug}-${nextDisplay}`;

    let created: { id: string; webhook_token: string } | null = null;
    let error: { message: string; code?: string } | null = null;
    // Em criações simultâneas dois aparelhos podem disputar o mesmo número:
    // tenta de novo com o próximo livre em vez de falhar.
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      instanceName = `${slug}-${nextDisplay}`;
      const res = await supabaseAdmin
        .from("whatsapp_config")
        .insert({
          label: data.label.trim(),
          provider: data.provider,
          base_url: baseUrl,
          instance_name: instanceName,
          is_default: existing.length === 0,
          display_id: nextDisplay.toString(),
          color: data.color,
          project_id: projectId,
        })
        .select("id, webhook_token")
        .single();
      if (!res.error) {
        created = res.data;
        error = null;
        break;
      }
      error = res.error;
      if (res.error.code !== "23505") break;
      nextDisplay += 1;
    }
    if (error || !created) throw new Error(error?.message ?? "Não foi possível criar o dispositivo.");
    // O dispositivo acabou de escolher a integração: descarta qualquer provedor
    // em cache para as chamadas seguintes usarem o servidor certo.
    invalidateProviderCache();

    // Vincula o dispositivo à integração escolhida já na criação: replica a API Key
    // global, cria a instância, registra o webhook e já traz QR Code, status
    // e número — tudo em um único clique em "Adicionar".
    const {
      evolutionListInstances,
      evolutionConnectInstance,
      evolutionGetStatus,
      evolutionGetQr,
    } = await import("@/lib/evolution.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const { digitsOnly } = await import("@/lib/phone");

    let instanceId: string | null = null;
    let linkError: string | null = null;
    let qrcode: string | null = null;
    let connected = false;
    let phone = "";
    let finalInstanceName = instanceName;

    try {
      const apiKey = await loadProviderSharedKey(data.provider);
      if (!apiKey) {
        linkError = `Cadastre o token da ${providerLabel} em API de conexão para vincular este dispositivo.`;
      } else {
        await saveProviderApiKey({ configId: created.id, provider: data.provider, apiKey });

        let instance: { id: string; name: string; token: string };
        try {
          instance = await evolutionCreateInstance(
            { baseUrl, configId: created.id, provider: data.provider },
            { name: instanceName },
          );
        } catch (createError) {
          // Nome já usado no servidor: reaproveita a instância existente.
          const all = await evolutionListInstances({
            baseUrl,
            configId: created.id,
            provider: data.provider,
          });
          const match = all.find((i) => String(i["name"] ?? "") === instanceName);
          if (!match) throw createError;
          instance = {
            id: String(match["id"] ?? ""),
            name: String(match["name"] ?? instanceName),
            token: String(match["token"] ?? ""),
          };
          if (!instance.id) throw createError;
        }

        if (instance.token) {
          await saveEvolutionInstanceToken({ configId: created.id, token: instance.token });
        }
        instanceId = instance.id;
        finalInstanceName = instance.name || instanceName;

        // Webhook desta central + assinatura de eventos, e QR Code na sequência.
        const target = {
          baseUrl,
          instanceId: instance.id,
          configId: created.id,
          provider: data.provider,
        };
        const inboundUrl = inboundUrlFor(
          publicOrigin(getRequest().url),
          (created as { webhook_token?: string }).webhook_token ?? "",
        );
        try {
          const connection = await evolutionConnectInstance(target, {
            webhookUrl: inboundUrl,
            immediate: true,
          });
          qrcode = connection.qrcode;
        } catch {
          /* o QR Code pode ainda estar sendo gerado */
        }
        const qrDelay = data.provider === "wuzapi" ? 400 : 1200;
        const qrTries = data.provider === "wuzapi" ? 4 : 6;
        for (let attempt = 0; attempt < qrTries && !qrcode && !connected; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, qrDelay));
          try {
            qrcode = (await evolutionGetQr(target)).qrcode;
          } catch {
            /* "no QR code available" é temporário */
          }
        }
        try {
          const status = await evolutionGetStatus(target);
          connected = status.loggedIn;
          phone = digitsOnly(status.phone.split("@")[0] ?? "");
        } catch {
          /* status indisponível não impede o cadastro */
        }

        await supabaseAdmin
          .from("whatsapp_config")
          .update({
            instance_id: instance.id,
            instance_name: finalInstanceName,
            status: connected ? "connected" : qrcode ? "connecting" : "disconnected",
            last_qr: connected ? null : qrcode,
            last_event: connected ? "webhooks-ready" : qrcode ? "qr" : "instance-created",
            ...(phone ? { phone } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", created.id);
      }
    } catch (e) {
      linkError = (e as Error).message;
    }

    return {
      id: created.id,
      instanceId,
      instanceName: finalInstanceName,
      linked: !!instanceId,
      qrcode,
      connected,
      phone,
      error: linkError,
    };
  });

export const setDefaultWhatsappDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ deviceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_config").update({ is_default: false }).neq("id", data.deviceId);
    const { error } = await supabaseAdmin
      .from("whatsapp_config")
      .update({ is_default: true })
      .eq("id", data.deviceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWhatsappDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ deviceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("whatsapp_secrets").delete().eq("config_id", data.deviceId);
    const { error } = await supabaseAdmin.from("whatsapp_config").delete().eq("id", data.deviceId);
    if (error) throw new Error(error.message);
    const { data: rest } = await supabaseAdmin
      .from("whatsapp_config")
      .select("id, is_default")
      .order("created_at");
    const list = (rest ?? []) as { id: string; is_default: boolean }[];
    if (list.length && !list.some((d) => d.is_default)) {
      await supabaseAdmin.from("whatsapp_config").update({ is_default: true }).eq("id", list[0]!.id);
    }
    return { ok: true };
  });

export const getWhatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deviceInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const {
      loadEvolutionApiKey,
      loadEvolutionConfig,
      evolutionGetStatus,
      evolutionConnectInstance,
      ensureEvolutionInstance,
    } = await import("@/lib/evolution.server");
    const config = await loadEvolutionConfig(data.deviceId);
    const provider = ((config?.provider || "evolution").trim().toLowerCase() === "wuzapi"
      ? "wuzapi"
      : "evolution") as "evolution" | "wuzapi";
    const hasApiKey = !!(await loadEvolutionApiKey(config?.id ?? null));

    const origin = publicOrigin(getRequest().url);
    const inboundUrl = inboundUrlFor(origin, config?.webhook_token ?? "");

    let live: { connected: boolean; loggedIn: boolean; name: string } | null = null;
    let error: string | null = null;

    if (config?.base_url && config.instance_id && hasApiKey) {
      try {
        // Garante id + token da instância antes de consultar o status.
        const instanceId = await ensureEvolutionInstance(config);
        // GET /instance/status → { data: { Connected, LoggedIn, Name } }
        const connection = await evolutionGetStatus({
          baseUrl: config.base_url,
          instanceId,
          configId: config.id,
        });
        live = {
          connected: connection.connected,
          loggedIn: connection.loggedIn,
          name: connection.name,
        };

        // Connected informa apenas que o processo da instância está ativo.
        // O WhatsApp só está realmente pareado quando LoggedIn é true.
        const isLinked = connection.loggedIn;
        // Enquanto o processo da instância continua ativo (Connected), uma
        // leitura sem LoggedIn é instabilidade momentânea da Evolution Go.
        const wasConnected = config.status === "connected";
        const perdaConfirmada = !isLinked && !connection.connected;
        const lostOnce = config.last_event === "link-lost";
        // Na WuzAPI, Connected=true com LoggedIn=false significa sessão aberta
        // aguardando leitura do QR: não é uma conexão pareada.
        const nextStatus = isLinked
          ? "connected"
          : provider === "wuzapi"
            ? "connecting"
            : wasConnected
              ? perdaConfirmada && lostOnce
                ? "disconnected"
                : "connected"
              : config.status;
        const nextEvent = isLinked
          ? "webhooks-ready"
          : provider === "wuzapi"
            ? "qr"
            : wasConnected && perdaConfirmada && !lostOnce
              ? "link-lost"
              : config.last_event;
        const needsSync =
          nextStatus !== config.status ||
          nextEvent !== config.last_event ||
          (isLinked && config.last_qr);

        // Reafirma o webhook apenas quando o endereço mudou ou quando faz mais
        // de 6 horas da última confirmação. Antes isso era refeito a cada
        // checagem de status e derrubava o servidor da Evolution Go
        // ("Eventos para Webhook" em excesso).
        const registrado = (config as { webhook_url?: string | null }).webhook_url ?? null;
        const confirmadoEm = (config as { webhook_synced_at?: string | null }).webhook_synced_at;
        const eventosRegistrados =
          (config as { webhook_events?: string | null }).webhook_events ?? null;
        const { EVOLUTION_SUBSCRIBE, EVOLUTION_SUBSCRIBE_V2, EVOLUTION_SUBSCRIBE_FALLBACK, webhookEventsSignature } =
          await import("@/lib/evolution.server");
        // Qualquer uma das três listas aceitas serve; nenhuma delas registrada
        // (ou lista incompleta) significa webhook sem eventos → refaz na hora.
        const eventosOk = [
          EVOLUTION_SUBSCRIBE,
          EVOLUTION_SUBSCRIBE_V2,
          EVOLUTION_SUBSCRIBE_FALLBACK,
        ].some((lista) => webhookEventsSignature(lista) === eventosRegistrados);
        const idade = confirmadoEm ? Date.now() - new Date(confirmadoEm).getTime() : Infinity;
        const precisaReafirmar =
          registrado !== inboundUrl || !eventosOk || idade > 6 * 60 * 60 * 1000;
        // O webhook precisa apontar para esta central mesmo antes do pareamento,
        // senão os eventos de conexão/QR chegam em outro lugar e a sessão
        // nunca é confirmada aqui.
        if ((isLinked || connection.connected) && precisaReafirmar) {
          try {
            await evolutionConnectInstance(
              { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
              { webhookUrl: inboundUrl, immediate: true },
            );
          } catch {
            /* o número segue pareado mesmo sem reconfirmar o webhook */
          }
        }


        if (needsSync) {
          const { jidToPhone, digitsOnly } = await import("@/lib/phone");
          const phone =
            (connection.phone.includes("@")
              ? jidToPhone(connection.phone)
              : digitsOnly(connection.phone)) || config.phone;
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("whatsapp_config")
            .update({
              status: nextStatus,
              phone,
              last_event: nextEvent,
              ...(isLinked ? { last_qr: null } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", config.id);
          config.status = nextStatus;
          config.phone = phone;
          config.last_event = nextEvent;
          if (isLinked) {
            config.last_qr = null;
          }
        }

        if (isLinked) {
          const { validarConexaoAposParear } = await import("@/lib/connection-test.server");
          await validarConexaoAposParear(config.id);
        }
      } catch (e) {
        if (provider === "wuzapi" && isMissingWhatsappSession(e)) {
          // "No session" não é falha de credencial: significa que esta
          // conexão precisa ser aberta para produzir o QR Code.
          live = { connected: false, loggedIn: false, name: config.instance_name };
          config.status = "connecting";
          config.last_event = "qr";
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("whatsapp_config")
            .update({
              status: "connecting",
              last_event: "qr",
              updated_at: new Date().toISOString(),
            })
            .eq("id", config.id);
        } else {
          error = (e as Error).message;
        }
      }
    }

    return {
      hasApiKey,
      hasZapiInstanceToken: false,
      hasZapiClientToken: false,

      provider,
      inboundUrl,
      webhookToken: config?.webhook_token ?? "",
      config: config
        ? {
            id: config.id,
            label: config.label || config.instance_name || "Dispositivo",
            isDefault: config.is_default,
            color: config.color ?? "#0ea5e9",
            baseUrl: config.base_url,
            instanceId: config.instance_id,
            instanceName: config.instance_name,
            phone: config.phone,
            status: config.status,
            lastQr: config.last_qr,
            lastEvent: config.last_event,
            defaultQueueId: config.default_queue_id,
            connectionTest: {
              status:
                ((config as { connection_test_status?: string | null }).connection_test_status ??
                  null) as string | null,
              detail:
                ((config as { connection_test_detail?: string | null }).connection_test_detail ??
                  null) as string | null,
              at:
                ((config as { connection_test_at?: string | null }).connection_test_at ??
                  null) as string | null,
            },
          }
        : null,
      live,
      error,
    };
  });

const saveInput = z.object({
  deviceId: z.string().uuid().nullable().default(null),
  label: z.string().default(""),
  provider: z.enum(PROVIDERS).default("evolution"),
  baseUrl: z.string().default(""),
  instanceId: z.string().default(""),
  instanceName: z.string().min(1).default("central"),
  defaultQueueId: z.string().uuid().nullable().default(null),
  evolutionApiKey: z.string().default(""),
});

export const saveWhatsappConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { loadEvolutionConfig, defaultBaseUrlFor, invalidateProviderCache } = await import(
      "@/lib/evolution.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await loadEvolutionConfig(data.deviceId);

    // Regra: a integração de um dispositivo nunca troca depois de criada.
    // Um dispositivo da WuzAPI continua na WuzAPI e um da Evolution Go
    // continua na Evolution Go — para usar a outra, crie um dispositivo novo.
    const lockedProvider = config
      ? (((config.provider || "evolution").trim().toLowerCase() === "wuzapi"
          ? "wuzapi"
          : "evolution") as "evolution" | "wuzapi")
      : data.provider;
    const EVOLUTION_DEFAULT_BASE_URL = await defaultBaseUrlFor(lockedProvider);

    const baseUrl = data.baseUrl.trim().replace(/\/+$/, "") || EVOLUTION_DEFAULT_BASE_URL;
    const instanceId = data.instanceId.trim();


    const patch = {
      provider: lockedProvider,
      base_url: baseUrl,
      instance_id: instanceId,
      instance_name: data.instanceName.trim(),
      default_queue_id: data.defaultQueueId,
      ...(data.label.trim() ? { label: data.label.trim() } : {}),
      updated_at: new Date().toISOString(),
    };

    let deviceId: string;
    if (config) {
      deviceId = config.id;
      const { error } = await supabaseAdmin.from("whatsapp_config").update(patch).eq("id", config.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("whatsapp_config")
        .insert({
          ...patch,
          is_default: true,
          label: data.label.trim() || "Dispositivo principal",
          project_id: await (await import("@/lib/tenant.server")).projetoDoUsuario(context.userId),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      deviceId = created.id;
    }

    invalidateProviderCache();

    if (data.evolutionApiKey.trim()) {
      const { saveProviderApiKey } = await import("@/lib/evolution.server");
      await saveProviderApiKey({
        configId: deviceId,
        provider: lockedProvider,
        apiKey: data.evolutionApiKey.trim(),
      });
    }




    // Regra padrão: os dados da API valem para todos os dispositivos que usam a
    // mesma integração. Cada dispositivo só escolhe qual API vai usar (e seu
    // próprio número/instância).
    const shared: {
      updated_at: string;
      base_url?: string;
      default_queue_id?: string | null;
    } = { updated_at: new Date().toISOString() };
    if (baseUrl) shared.base_url = baseUrl;
    shared.default_queue_id = data.defaultQueueId;
    if (baseUrl || data.defaultQueueId) {
      await supabaseAdmin
        .from("whatsapp_config")
        .update(shared)
        .eq("provider", lockedProvider)
        .neq("id", deviceId);
    }


    return { ok: true, deviceId };
  });

/** POST /instance/create — cria uma instância nova no servidor Evolution Go. */
export const createWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deviceInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { loadEvolutionConfig, evolutionCreateInstance, saveEvolutionInstanceToken } =
      await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await loadEvolutionConfig(data.deviceId);
    if (!config?.base_url) throw new Error("Salve o endereço do servidor Evolution Go primeiro.");

    const created = await evolutionCreateInstance(
      { baseUrl: config.base_url, configId: config.id },
      { name: config.instance_name || config.label || "central" },
    );
    if (created.token) {
      await saveEvolutionInstanceToken({ configId: config.id, token: created.token });
    }

    const { error } = await supabaseAdmin
      .from("whatsapp_config")
      .update({
        instance_id: created.id,
        status: "disconnected",
        last_qr: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
    if (error) throw new Error(error.message);
    return { instanceId: created.id };
  });

const connectInput = z.object({
  phone: z.string().default(""),
  deviceId: z.string().uuid().nullable().default(null),
});

/** "no QR code available" é temporário: a instância ainda está gerando o código. */
function isTransientQrError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no qr code available|wait a moment|qr code ainda/i.test(message);
}

function isMissingWhatsappSession(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no session|not connected|client is nil|não está pareado|nao esta pareado/i.test(message);
}

/**
 * POST /instance/connect — conecta a instância, assina os eventos ("ALL") e
 * registra o webhook desta central. Com telefone informado, usa pareamento.
 */
export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => connectInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const {
      ensureEvolutionDevice,
      ensureEvolutionInstance,
      evolutionConnectInstance,
      evolutionGetStatus,
      evolutionGetQr,
      evolutionPair,
      loadEvolutionApiKey,
    } = await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(data.deviceId);
    const providerLabel = (config.provider || "evolution") === "wuzapi" ? "WuzAPI" : "Evolution Go";
    if (!(await loadEvolutionApiKey(config.id))) {
      return {
        qrcode: null,
        pairingCode: null,
        connected: false,
        needsConfiguration: true,
        error: null as string | null,
      };
    }

    try {
      const instanceId = await ensureEvolutionInstance(config);
      const target = {
        baseUrl: config.base_url,
        instanceId,
        configId: config.id,
        provider: config.provider ?? undefined,
      };
      const inboundUrl = inboundUrlFor(publicOrigin(getRequest().url), config.webhook_token ?? "");

      // Já pareado? Só reafirma o webhook.
      let status: Awaited<ReturnType<typeof evolutionGetStatus>> | null = null;
      try {
        status = await evolutionGetStatus(target);
      } catch (error) {
        // Uma WuzAPI sem sessão é exatamente o estado em que precisamos chamar
        // /session/connect para criar e manter o QR Code disponível.
        if (!isMissingWhatsappSession(error)) throw error;
      }
      if (status?.loggedIn) {
        await evolutionConnectInstance(target, { webhookUrl: inboundUrl, immediate: true });
        await supabaseAdmin
          .from("whatsapp_config")
          .update({
            status: "connected",
            last_qr: null,
            last_event: "webhooks-ready",
            phone: digitsOnly(status.phone.split("@")[0] ?? "") || config.phone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id);
        {
          const { validarConexaoAposParear } = await import("@/lib/connection-test.server");
          await validarConexaoAposParear(config.id);
        }
        return {
          qrcode: null,
          pairingCode: null,
          connected: true,
          needsConfiguration: false,
          error: null as string | null,
        };
      }

      const phone = digitsOnly(data.phone);
      const connection = await evolutionConnectInstance(target, {
        webhookUrl: inboundUrl,
        ...(phone ? { phone } : {}),
      });

      let qrcode = connection.qrcode;
      let pairingCode = connection.pairingCode;

      if (phone && !pairingCode) {
        pairingCode = await evolutionPair(target, { phone });
      }
      if (!phone && !qrcode) {
        // O QR Code demora alguns instantes para ficar pronto depois do connect;
        // enquanto isso a Evolution Go responde "no QR code available".
        const isWuz = (config.provider || "evolution") === "wuzapi";
        for (let attempt = 0; attempt < (isWuz ? 4 : 5) && !qrcode; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, isWuz ? 400 : 1200));
          try {
            qrcode = (await evolutionGetQr(target)).qrcode;
          } catch (error) {
            if (!isTransientQrError(error)) throw error;
          }
        }
      }

      await supabaseAdmin
        .from("whatsapp_config")
        .update({
          status: "connecting",
          last_qr: qrcode,
          last_event: phone ? "pair" : "qr",
          updated_at: new Date().toISOString(),
        })
        .eq("id", config.id);

      return {
        qrcode,
        pairingCode,
        connected: false,
        needsConfiguration: false,
        error: null as string | null,
      };
    } catch (cause) {
      // Falhas da Evolution Go (credenciais, endereço, instância) voltam como
      // aviso na tela em vez de derrubar a página.
      const message =
        cause instanceof Error ? cause.message : `Falha ao conectar na ${providerLabel}.`;
      const credentialIssue = /credenciais|API Key|não configurad/i.test(message);
      await supabaseAdmin
        .from("whatsapp_config")
        .update({ last_event: "connect-error", updated_at: new Date().toISOString() })
        .eq("id", config.id);
      return {
        qrcode: null,
        pairingCode: null,
        connected: false,
        needsConfiguration: credentialIssue,
        error: message as string | null,
      };
    }
  });

/** GET /instance/qr — busca o QR Code atual da instância. */
export const fetchWhatsappQr = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deviceInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const {
      ensureEvolutionDevice,
      ensureEvolutionInstance,
      evolutionConnectInstance,
      evolutionGetQr,
      evolutionGetStatus,
      loadEvolutionApiKey,
    } = await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { digitsOnly } = await import("@/lib/phone");
    const config = await ensureEvolutionDevice(data.deviceId);
    if (!config.base_url || !(await loadEvolutionApiKey(config.id))) {
      return {
        qrcode: null,
        warning: `Cadastre o token da ${(config.provider || "evolution") === "wuzapi" ? "WuzAPI" : "Evolution Go"} em API de conexão antes de gerar o QR Code.`,
        connected: false,
      };
    }

    try {
      const instanceId = await ensureEvolutionInstance(config);
      const target = {
        baseUrl: config.base_url,
        instanceId,
        configId: config.id,
        provider: config.provider ?? undefined,
      };
      const inboundUrl = inboundUrlFor(publicOrigin(getRequest().url), config.webhook_token ?? "");

      let status: Awaited<ReturnType<typeof evolutionGetStatus>> | null = null;
      try {
        status = await evolutionGetStatus(target);
      } catch (error) {
        // Sem sessão ativa, seguimos para o connect abaixo em vez de devolver
        // o QR antigo e interromper a renovação automática.
        if (!isMissingWhatsappSession(error)) throw error;
      }
      if (status?.loggedIn) {
        // O celular leu o QR do painel: fixa o webhook desta central e marca conectado.
        try {
          await evolutionConnectInstance(target, { webhookUrl: inboundUrl, immediate: true });
        } catch {
          // A sessão já está ativa; seguimos mesmo se o connect responder erro.
        }
        await supabaseAdmin
          .from("whatsapp_config")
          .update({
            status: "connected",
            last_qr: null,
            last_event: "connected",
            phone: digitsOnly(status.phone.split("@")[0] ?? "") || config.phone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id);
        {
          const { validarConexaoAposParear } = await import("@/lib/connection-test.server");
          await validarConexaoAposParear(config.id);
        }
        return { qrcode: null, warning: null as string | null, connected: true };
      }

      const readQr = async (): Promise<string | null> => {
        try {
          return (await evolutionGetQr(target)).qrcode;
        } catch (error) {
          if (isTransientQrError(error)) return null;
          throw error;
        }
      };

      let qrcode = status ? await readQr() : null;

      // Abrir a sessão de novo a cada consulta reinicia o código: só reabrimos
      // quando não há código recente guardado (mais de 25 segundos).
      const lastUpdate = config.updated_at ? Date.parse(config.updated_at) : 0;
      const hasFreshSaved = Boolean(config.last_qr) && Date.now() - lastUpdate < 25000;

      if (!qrcode && !hasFreshSaved) {
        await evolutionConnectInstance(target, { webhookUrl: inboundUrl });
        const isWuz = (config.provider || "evolution") === "wuzapi";
        for (let attempt = 0; attempt < (isWuz ? 4 : 6) && !qrcode; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, isWuz ? 400 : 1500));
          qrcode = await readQr();
        }
      }

      if (qrcode) {
        await supabaseAdmin
          .from("whatsapp_config")
          .update({
            status: "connecting",
            last_qr: qrcode,
            last_event: "qr",
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id);
        return { qrcode, warning: null as string | null, connected: false };
      }

      return { qrcode: config.last_qr ?? null, warning: null as string | null, connected: false };
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível buscar o QR Code na Evolution Go.";
      return { qrcode: config.last_qr ?? null, warning: message as string | null, connected: false };
    }
  });

/** DELETE /instance/logout — encerra a sessão do WhatsApp no dispositivo. */
export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deviceInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { loadEvolutionConfig, evolutionLogout } = await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const config = await loadEvolutionConfig(data.deviceId);
    if (!config?.base_url || !config.instance_id) throw new Error("Nenhuma instância configurada.");

    let warning: string | null = null;
    try {
      await evolutionLogout({
        baseUrl: config.base_url,
        instanceId: config.instance_id,
        configId: config.id,
      });
    } catch (error) {
      warning = error instanceof Error ? error.message : "Não foi possível avisar a Evolution Go.";
    }

    await supabaseAdmin
      .from("whatsapp_config")
      .update({
        status: "disconnected",
        last_qr: null,
        last_event: "logout",
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
    const { limparTesteConexao } = await import("@/lib/connection-test.server");
    await limparTesteConexao(config.id);
    return { ok: true, warning };
  });

const attachmentInput = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  mimeType: z.string().default("application/octet-stream"),
});

const contactCardInput = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
});

const sendInput = z
  .object({
    conversationId: z.string().uuid(),
    body: z.string().default(""),
    attachments: z.array(attachmentInput).max(10).default([]),
    contact: contactCardInput.nullable().default(null),
    /** Figurinha escolhida na galeria (caminho dentro do bucket de anexos). */
    sticker: z
      .object({ path: z.string().min(1), name: z.string().default("Figurinha") })
      .nullable()
      .default(null),
    /** Mensagem original citada (reply-to). */
    reply: z
      .object({
        externalId: z.string().min(1),
        mine: z.boolean(),
        body: z.string().default(""),
      })
      .nullable()
      .default(null),
  })
  .refine(
    (v) => v.body.trim().length > 0 || v.attachments.length > 0 || !!v.contact || !!v.sticker,
    { message: "Escreva uma mensagem, anexe um arquivo ou escolha um contato." },
  );

/** Registra a mensagem do atendente e envia pelo WhatsApp quando a conexão está ativa. */
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => sendInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // As duas leituras não dependem uma da outra: buscam juntas para o envio sair antes.
    const [conversationRes, meRes] = await Promise.all([
      supabase
        .from("conversations")
        .select("id, first_response_at, whatsapp_config_id, contact:contacts(id, phone, wa_jid)")
        .eq("id", data.conversationId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name, signature_enabled")
        .eq("id", userId)
        .maybeSingle(),
    ]);
    const { data: conversation, error: convError } = conversationRes;
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const contact = conversation.contact as { phone: string; wa_jid: string | null } | null;

    const me = meRes.data;
    const signature =
      me?.signature_enabled && (me.full_name ?? "").trim()
        ? `*${me.full_name.trim()}*\n`
        : "";
    const text = data.body.trim();
    const attachments = data.attachments;
    const sharedContact = data.contact;
    const outgoing = `${signature}${text}`;
    const contactFallbackText = sharedContact
      ? `👤 *${sharedContact.name}*\n📞 +${sharedContact.phone.replace(/\D/g, "")}`
      : "";

    // Figurinha: gera um link temporário do arquivo guardado na central.
    let stickerUrl: string | null = null;
    if (data.sticker) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const signed = await supabaseAdmin.storage
        .from("anexos")
        .createSignedUrl(data.sticker.path, 60 * 60 * 24 * 7);
      stickerUrl = signed.data?.signedUrl ?? null;
      if (!stickerUrl) throw new Error("Não foi possível abrir a figurinha escolhida.");
    }



    const { ensureEvolutionDevice, evolutionRequest } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");
    // A conversa responde pelo mesmo dispositivo que recebeu a mensagem.
    const config = await ensureEvolutionDevice(conversation.whatsapp_config_id ?? null);
    const { loadEvolutionApiKey } = await import("@/lib/evolution.server");

    const canSend =
      !!config.base_url && !!config.instance_id && !!(await loadEvolutionApiKey(config.id)) && !!contact;


    let externalId: string | null = null;
    let deliveryError: string | null = null;
    let delivered = false;

    if (canSend) {

      // A Evolution Go aceita números soltos, mas pode apenas enfileirá-los sem
      // entregar. O JID completo força a resolução do destinatário correto.
      const jidDigits = contact!.wa_jid ? digitsOnly(contact!.wa_jid.split("@")[0] ?? "") : "";
      const isGroupChat = !!contact!.wa_jid?.includes("@g.us");
      const recipientDigits = jidDigits || digitsOnly(contact!.phone);
      const number = isGroupChat
        ? contact!.wa_jid!
        : `${recipientDigits}@s.whatsapp.net`;
      const { evolutionSendText, evolutionSendMedia, evolutionSendContact, evolutionSendSticker } =
        await import("@/lib/evolution.server");
      const target = {
        baseUrl: config!.base_url,
        instanceId: config!.instance_id,
        configId: config!.id,
      };
      // Resposta citada: a Evolution Go espera o ID da mensagem original e o
      // JID de quem a enviou (o contato quando recebida, o dispositivo quando nossa).
      let quoted: { messageId: string; participant?: string } | undefined;
      if (data.reply) {
        const participant =
          data.reply.mine
            ? config!.phone
              ? `${digitsOnly(config!.phone)}@s.whatsapp.net`
              : undefined
            : contact!.wa_jid
              ? contact!.wa_jid
              : `${recipientDigits}@s.whatsapp.net`;
        quoted = {
          messageId: data.reply.externalId,
          ...(participant ? { participant } : {}),
        };
      }
      try {
        if (text) {
          externalId = await evolutionSendText(target, {
            number,
            text: outgoing,
            ...(quoted ? { quoted } : {}),
          });
        }
        for (const file of attachments) {
          const id = await evolutionSendMedia(target, {
            number,
            url: file.url,
            fileName: file.name,
            mimeType: file.mimeType,
          });
          externalId = externalId ?? id;
        }
        if (stickerUrl) {
          const id = await evolutionSendSticker(target, { number, url: stickerUrl });
          externalId = externalId ?? id;
        }
        if (sharedContact) {
          let id: string | null = null;
          try {
            id = await evolutionSendContact(target, {
              number,
              contactName: sharedContact.name,
              contactPhone: digitsOnly(sharedContact.phone),
            });
          } catch {
            id = await evolutionSendText(target, { number, text: contactFallbackText });
          }
          externalId = externalId ?? id;
        }
        delivered = true;
        console.log(
          `[envio] ok conversa=${data.conversationId} destino=${number} dispositivo=${config!.id} id=${externalId ?? "-"}`,
        );
      } catch (e) {
        deliveryError = (e as Error).message;
        console.error(
          `[envio] FALHOU conversa=${data.conversationId} destino=${number} dispositivo=${config!.id} erro=${deliveryError}`,
        );

      }

    } else {
      deliveryError = !config
        ? "Cadastre um dispositivo de WhatsApp em Administração → Dispositivos."
        : !(await loadEvolutionApiKey(config.id))
          ? "Falta cadastrar o token (ID de acesso) da Evolution em Administração → API de conexão."
          : "Confira o endereço da API e o ID da instância do dispositivo.";
      console.error(
        `[envio] bloqueado conversa=${data.conversationId} dispositivo=${config?.id ?? "-"} motivo=${deliveryError}`,
      );
    }


    // Áudios entram no formato de player (onda + tempo + transcrição); os
    // demais anexos continuam como arquivo com nome e link.
    const audioAttachments = attachments.filter((f) =>
      f.mimeType.toLowerCase().startsWith("audio/"),
    );
    const otherAttachments = attachments.filter(
      (f) => !f.mimeType.toLowerCase().startsWith("audio/"),
    );
    const attachmentLines = otherAttachments.map((f) => `📎 ${f.name}: ${f.url}`).join("\n");
    let audioLines = "";
    if (audioAttachments.length > 0) {
      const { outboundAudioBody } = await import("@/lib/audio.server");
      const bodies = await Promise.all(
        audioAttachments.map((f) => outboundAudioBody({ url: f.url, mimeType: f.mimeType })),
      );
      audioLines = bodies.filter(Boolean).join("\n");
    }
    const contactLine = sharedContact
      ? `👤 Contato: ${sharedContact.name}\n📞 +${sharedContact.phone.replace(/\D/g, "")}`
      : "";
    const stickerLine = stickerUrl ? `🖼 Figurinha: ${stickerUrl}` : "";
    const stored = [outgoing.trim(), contactLine, attachmentLines, audioLines, stickerLine]
      .filter(Boolean)
      .join("\n");

    // Regra: a mensagem enviada sempre fica registrada na conversa. Se a
    // gravação falhar por instabilidade, tenta de novo e, em último caso,
    // grava pelo servidor para não perder o histórico do que já foi entregue.
    const { withRetry } = await import("@/lib/retry.server");
    const row = {
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound" as const,
      body: stored,
      external_id: externalId,
      reply_to_external_id: data.reply?.externalId ?? null,
      reply_body: data.reply?.body ?? null,
    };
    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();

    // Gravar a mensagem e atualizar a conversa acontecem ao mesmo tempo.
    await Promise.all([
      withRetry("gravar mensagem enviada", async () => {
        const insert = await supabase.from("messages").insert(row);
        if (insert.error) throw new Error(insert.error.message);
      }).catch(async (error: Error) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const fallback = await supabaseAdmin.from("messages").insert(row);
        if (fallback.error) throw new Error(error.message);
      }),
      supabase.from("conversations").update(patch).eq("id", data.conversationId),
    ]);

    return { sent: delivered, deliveryError };
  });

// ---------------------------------------------------------------------------
// API de conexão: os tokens e endereços ficam padrão para todos os dispositivos
// que usam a mesma API. No card do WhatsApp só se escolhe nome, API e QR Code.
// ---------------------------------------------------------------------------

const INSTANCE_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getApiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { listEvolutionConfigs } = await import("@/lib/evolution.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const devices = await listEvolutionConfigs(await projetoDoUsuario(context.userId));
    const origin = publicOrigin(getRequest().url);

    const { data: keys } = await supabaseAdmin
      .from("whatsapp_secrets")
      .select("provider, instance_token, base_url")
      .in("provider", PROVIDERS);
    const keyByProvider = new Map<string, boolean>();
    const baseByProvider = new Map<string, string>();
    for (const row of (keys ?? []) as {
      provider: string;
      instance_token: string;
      base_url: string | null;
    }[]) {
      if (row.instance_token?.trim()) keyByProvider.set(row.provider, true);
      if (row.base_url?.trim() && !baseByProvider.has(row.provider)) {
        baseByProvider.set(row.provider, row.base_url.trim());
      }
    }

    const settings = PROVIDERS.map((provider) => {
      const list = devices.filter((d) => d.provider === provider);
      const ref = list.find((d) => d.is_default) ?? list[0] ?? null;
      return {
        provider,
        devices: list.length,
        baseUrl: ref?.base_url ?? baseByProvider.get(provider) ?? "",
        instanceId: "",
        instanceName: "central",
        defaultQueueId: ref?.default_queue_id ?? null,
        hasInstanceToken: false,
        hasClientToken: false,
        webhookToken: ref?.webhook_token ?? "",
        inboundUrl: inboundUrlFor(origin, ref?.webhook_token ?? ""),
      };
    });

    return {
      hasEvolutionApiKey: keyByProvider.get("evolution") ?? false,
      hasApiKeyByProvider: Object.fromEntries(
        PROVIDERS.map((p) => [p, keyByProvider.get(p) ?? false]),
      ) as Record<(typeof PROVIDERS)[number], boolean>,
      settings,
    };
  });

const testInput = z.object({ provider: z.enum(PROVIDERS).optional() }).default({});

/** GET /instance/all — confere endereço e API Key global da Evolution Go. */
export const testApiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => testInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { listEvolutionConfigs, loadEvolutionApiKey, evolutionListInstances, loadWuzapiAdminToken } =
      await import("@/lib/evolution.server");
    const { testWuzapiConnection } = await import("@/lib/wuzapi.server");
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const devices = await listEvolutionConfigs(await projetoDoUsuario(context.userId));
    const provider = data.provider ?? "evolution";
    const ref =
      devices.find((d) => d.provider === provider && d.is_default) ??
      devices.find((d) => d.provider === provider) ??
      null;
    if (!ref?.base_url) {
      return { ok: false, instances: 0, message: "Cadastre o endereço da API e salve." };
    }
    if (provider === "wuzapi") {
      const adminToken = await loadWuzapiAdminToken(ref.id);
      if (!adminToken) {
        return { ok: false, instances: 0, message: "Cadastre o token de administrador da WuzAPI e salve." };
      }
      try {
        const users = await testWuzapiConnection(ref.base_url, adminToken);
        return { ok: true, instances: users, message: "Conexão com a WuzAPI confirmada." };
      } catch (error) {
        return { ok: false, instances: 0, message: (error as Error).message };
      }
    }
    if (!(await loadEvolutionApiKey(ref.id))) {
      return { ok: false, instances: 0, message: "Cadastre o token (ID de acesso) e salve." };
    }
    try {
      const instances = await evolutionListInstances({ baseUrl: ref.base_url, configId: ref.id });
      return { ok: true, instances: instances.length, message: "Conexão com a API confirmada." };
    } catch (error) {
      return { ok: false, instances: 0, message: (error as Error).message };
    }
  });

export const saveApiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        provider: z.enum(PROVIDERS).default("evolution"),
        baseUrl: z.string().default(""),
        defaultQueueId: z.string().uuid().nullable().default(null),
        apiKey: z.string().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    if (data.provider === "evolution" && INSTANCE_TOKEN_PATTERN.test(data.apiKey.trim())) {
      throw new Error("Esse valor é o token de uma instância. Informe a API Key global do servidor Evolution Go.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      EVOLUTION_DEFAULT_BASE_URL,
      WUZAPI_DEFAULT_BASE_URL,
      saveProviderApiKey,
      saveProviderGlobalCredentials,
    } = await import("@/lib/evolution.server");
    const defaultBase = data.provider === "wuzapi" ? WUZAPI_DEFAULT_BASE_URL : EVOLUTION_DEFAULT_BASE_URL;
    const baseUrl = data.baseUrl.trim().replace(/\/+$/, "") || defaultBase;

    // Guarda token + endereço da integração no backend imediatamente, antes de
    // mexer nos dispositivos: assim a credencial nunca se perde se o servidor
    // da API estiver fora do ar na hora de vincular.
    await saveProviderGlobalCredentials({
      provider: data.provider,
      apiKey: data.apiKey.trim(),
      baseUrl,
    });

    const patch: {
      base_url: string;
      default_queue_id: string | null;
      updated_at: string;
    } = {
      base_url: baseUrl,
      default_queue_id: data.defaultQueueId,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabaseAdmin
      .from("whatsapp_config")
      .select("id")
      .eq("provider", data.provider);
    let ids = ((existing ?? []) as { id: string }[]).map((d) => d.id);

    if (ids.length === 0) {
      // Regra: nunca convertemos um dispositivo de outra integração. Cada
      // integração tem seus próprios dispositivos, sem troca e sem conflito.
      const { count } = await supabaseAdmin
        .from("whatsapp_config")
        .select("id", { count: "exact", head: true });
      const total = count ?? 0;
      const { data: created, error } = await supabaseAdmin
        .from("whatsapp_config")
        .insert({
          ...patch,
          provider: data.provider,
          label: data.provider === "wuzapi" ? "Dispositivo WuzAPI" : "Dispositivo Evolution Go",
          is_default: total === 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      ids = [created.id];
    } else {
      const { error } = await supabaseAdmin
        .from("whatsapp_config")
        .update(patch)
        .eq("provider", data.provider);
      if (error) throw new Error(error.message);
    }

    if (data.apiKey.trim()) {
      for (const id of ids) {
        await saveProviderApiKey({ configId: id, provider: data.provider, apiKey: data.apiKey.trim() });
      }
    }

    // Assim que endereço + token estão salvos, já vinculamos a API ao sistema:
    // criamos a instância que falta em cada dispositivo, registramos o webhook
    // desta central e guardamos o token da conexão.
    const link = await linkProviderDevices(data.provider, baseUrl, ids);

    return { ok: true, ...link };
  });

/**
 * Vincula os dispositivos de um provedor ao servidor da API: cria a instância
 * (usuário, no caso da WuzAPI), salva o token da conexão, registra o webhook
 * desta central e atualiza o status/QR Code do dispositivo.
 */
async function linkProviderDevices(
  provider: string,
  baseUrl: string,
  ids: string[],
): Promise<{
  linked: number;
  qrcode: string | null;
  error: string | null;
  deviceId: string | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    evolutionCreateInstance,
    evolutionListInstances,
    evolutionConnectInstance,
    evolutionGetQr,
    evolutionGetStatus,
    saveEvolutionInstanceToken,
    loadEvolutionApiKey,
    loadWuzapiAdminToken,
  } = await import("@/lib/evolution.server");
  const { getRequest } = await import("@tanstack/react-start/server");
  const { digitsOnly } = await import("@/lib/phone");

  const credential =
    provider === "wuzapi" ? await loadWuzapiAdminToken(null) : await loadEvolutionApiKey(null);
  const { invalidateProviderCache } = await import("@/lib/evolution.server");
  invalidateProviderCache();
  if (!credential) {
    return {
      linked: 0,
      qrcode: null,
      deviceId: null,
      error: "Cadastre o token da API para vincular ao sistema.",
    };
  }

  const { data: rows } = await supabaseAdmin
    .from("whatsapp_config")
    .select("id, label, instance_id, instance_name, webhook_token, display_id")
    .in("id", ids);

  const origin = publicOrigin(getRequest().url);
  let linked = 0;
  let qrcode: string | null = null;
  let firstDeviceId: string | null = null;
  let error: string | null = null;

  for (const row of (rows ?? []) as {
    id: string;
    label: string | null;
    instance_id: string | null;
    instance_name: string | null;
    webhook_token: string | null;
    display_id: string | null;
  }[]) {
    try {
      let instanceId = (row.instance_id ?? "").trim();
      const desiredName =
        (row.instance_name ?? "").trim() ||
        `${(row.label ?? "central").toLowerCase().replace(/\s+/g, "-").slice(0, 32) || "central"}-${row.display_id ?? "1"}`;

      if (!instanceId) {
        let instance: { id: string; name: string; token: string };
        try {
          instance = await evolutionCreateInstance(
            { baseUrl, configId: row.id, provider },
            { name: desiredName },
          );
        } catch (createError) {
          const all = await evolutionListInstances({ baseUrl, configId: row.id, provider });
          const match = all.find((i) => String(i["name"] ?? "") === desiredName);
          if (!match) throw createError;
          instance = {
            id: String(match["id"] ?? ""),
            name: String(match["name"] ?? desiredName),
            token: String(match["token"] ?? ""),
          };
        }
        if (!instance.id) throw new Error("A API não retornou o identificador da conexão.");
        if (instance.token) {
          await saveEvolutionInstanceToken({ configId: row.id, token: instance.token });
        }
        instanceId = instance.id;
      }

      const target = { baseUrl, instanceId, configId: row.id, provider };
      const inboundUrl = inboundUrlFor(origin, row.webhook_token ?? "");
      let deviceQr: string | null = null;
      try {
        deviceQr = (await evolutionConnectInstance(target, { webhookUrl: inboundUrl, immediate: true }))
          .qrcode;
      } catch {
        /* o QR Code pode ainda estar sendo gerado */
      }
      if (!deviceQr) {
        try {
          deviceQr = (await evolutionGetQr(target)).qrcode;
        } catch {
          /* "no QR code available" é temporário */
        }
      }

      let connected = false;
      let phone = "";
      try {
        const status = await evolutionGetStatus(target);
        connected = status.loggedIn;
        phone = digitsOnly(status.phone.split("@")[0] ?? "");
      } catch {
        /* status indisponível não impede a vinculação */
      }

      await supabaseAdmin
        .from("whatsapp_config")
        .update({
          instance_id: instanceId,
          instance_name: desiredName,
          status: connected ? "connected" : deviceQr ? "connecting" : "disconnected",
          last_qr: connected ? null : deviceQr,
          last_event: connected ? "webhooks-ready" : deviceQr ? "qr" : "instance-created",
          ...(phone ? { phone } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      linked += 1;
      if (!firstDeviceId) firstDeviceId = row.id;
      if (!qrcode) {
        qrcode = deviceQr;
        if (deviceQr) firstDeviceId = row.id;
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }

  return { linked, qrcode, error, deviceId: firstDeviceId };
}

/** Salva apenas o nome do dispositivo e qual API ele usa, herdando a configuração padrão. */
export const saveWhatsappDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        deviceId: z.string().uuid(),
        label: z.string().min(1),
        provider: z.enum(PROVIDERS),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        defaultQueueId: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reference } = await supabaseAdmin
      .from("whatsapp_config")
      .select("base_url, default_queue_id")
      .eq("provider", data.provider)
      .neq("id", data.deviceId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ref = reference as {
      base_url: string;
      default_queue_id: string | null;
    } | null;

    const { error } = await supabaseAdmin
      .from("whatsapp_config")
      .update({
        label: data.label.trim(),
        provider: data.provider,
        ...(data.color ? { color: data.color } : {}),
        ...(ref ? { base_url: ref.base_url } : {}),
        // Cada dispositivo escolhe a fila em que as conversas novas entram.
        ...(data.defaultQueueId !== undefined
          ? { default_queue_id: data.defaultQueueId }
          : ref
            ? { default_queue_id: ref.default_queue_id }
            : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.deviceId);
    if (error) throw new Error(error.message);


    return { ok: true };
  });

const deleteMessageInput = z.object({
  messageId: z.string().uuid(),
});

/**
 * Apaga a mensagem no chat e também no WhatsApp (apagar para todos).
 * Quando a mensagem não tem ID do WhatsApp (ou a API recusa), ela é removida
 * apenas aqui e o motivo volta para a tela.
 */
export const deleteWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deleteMessageInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: message, error } = await supabase
      .from("messages")
      .select("id, external_id, direction, conversation_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!message) return { ok: true, removedOnWhatsapp: false, warning: null };

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, whatsapp_config_id, contact:contacts(phone, wa_jid)")
      .eq("id", message.conversation_id)
      .maybeSingle();
    const contact = (conversation?.contact ?? null) as
      | { phone: string; wa_jid: string | null }
      | null;

    let removedOnWhatsapp = false;
    let warning: string | null = null;

    if (!message.external_id) {
      warning = "A mensagem foi apagada aqui, mas não tinha registro no WhatsApp.";
    } else if (!contact) {
      warning = "A mensagem foi apagada aqui, mas o contato da conversa não foi encontrado.";
    } else {
      try {
        const { ensureEvolutionDevice, evolutionDeleteMessage, loadEvolutionApiKey } =
          await import("@/lib/evolution.server");
        const { digitsOnly } = await import("@/lib/phone");
        const config = await ensureEvolutionDevice(conversation?.whatsapp_config_id ?? null);
        if (!config.base_url || !config.instance_id || !(await loadEvolutionApiKey(config.id))) {
          throw new Error("Dispositivo de WhatsApp não configurado.");
        }
        const isGroupChat = !!contact.wa_jid?.includes("@g.us");
        const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
        const recipientDigits = jidDigits || digitsOnly(contact.phone);
        const number = isGroupChat ? contact.wa_jid! : `${recipientDigits}@s.whatsapp.net`;
        const fromMe = message.direction === "outbound";
        await evolutionDeleteMessage(
          { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
          {
            number,
            messageId: message.external_id,
            fromMe,
            ...(isGroupChat && !fromMe && contact.wa_jid
              ? { participant: `${recipientDigits}@s.whatsapp.net` }
              : {}),
          },
        );
        removedOnWhatsapp = true;
      } catch (e) {
        warning = `A mensagem foi apagada aqui, mas o WhatsApp recusou: ${(e as Error).message}`;
      }
    }

    // A mensagem não sai do histórico: fica marcada como apagada para que o
    // atendimento veja que ela existiu e foi removida.
    const removed = await supabase
      .from("messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.messageId);
    if (removed.error) throw new Error(removed.error.message);

    return { ok: true, removedOnWhatsapp, warning };
  });
