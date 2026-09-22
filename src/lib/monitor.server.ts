// Monitor das conexões com as APIs de WhatsApp (Evolution Go e WuzAPI).
// Verifica cada aparelho, tenta religar sozinho quando a conexão cai e avisa
// pelo WhatsApp o número de plantão. Uso exclusivo no servidor.

import type { EvolutionConfig } from "@/lib/evolution.server";

export const NUMERO_ALERTA_PADRAO = "5562996928605";

export type MonitorSettings = {
  id: string;
  ativo: boolean;
  numero_alerta: string;
  auto_reconectar: boolean;
  intervalo_minutos: number;
  cron_token: string;
};

type Severidade = "erro" | "aviso" | "ok";

/** Configuração do monitor (cria a linha padrão se ainda não existir). */
export async function carregarMonitorSettings(): Promise<MonitorSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("monitor_settings")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) return data as MonitorSettings;

  const { data: criado, error } = await supabaseAdmin
    .from("monitor_settings")
    .insert({ numero_alerta: NUMERO_ALERTA_PADRAO } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return criado as MonitorSettings;
}

/** Envia o aviso pelo WhatsApp usando qualquer aparelho que ainda esteja de pé. */
async function enviarAlerta(
  texto: string,
  evitarConfigId: string | null,
): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const settings = await carregarMonitorSettings();
    const numero = (settings.numero_alerta || NUMERO_ALERTA_PADRAO).replace(/\D/g, "");
    if (numero.length < 10) return { ok: false, detalhe: "Número de alerta inválido." };

    const { listEvolutionConfigs, ensureEvolutionInstance, evolutionSendText } = await import(
      "@/lib/evolution.server"
    );
    const devices = await listEvolutionConfigs();
    const candidatos = [
      ...devices.filter((d) => d.id !== evitarConfigId && d.status === "connected"),
      ...devices.filter((d) => d.id !== evitarConfigId && d.status !== "connected"),
      ...devices.filter((d) => d.id === evitarConfigId),
    ];

    let ultimoErro = "Nenhum aparelho disponível para enviar o aviso.";
    for (const device of candidatos) {
      if (!device.base_url) continue;
      try {
        const instanceId = await ensureEvolutionInstance(device);
        await evolutionSendText(
          { baseUrl: device.base_url, instanceId, configId: device.id },
          { number: `${numero}@s.whatsapp.net`, text: texto },
        );
        return { ok: true, detalhe: `Aviso enviado por ${device.label || device.instance_name}.` };
      } catch (error) {
        ultimoErro = error instanceof Error ? error.message : "Falha ao enviar o aviso.";
      }
    }
    return { ok: false, detalhe: ultimoErro };
  } catch (error) {
    return { ok: false, detalhe: error instanceof Error ? error.message : "Falha no alerta." };
  }
}

/**
 * Registra uma ocorrência no histórico e avisa o número de plantão.
 * Pode ser chamada de qualquer parte do servidor (falha de envio, erro de webhook…).
 */
export async function registrarOcorrencia(input: {
  tipo: string;
  mensagem: string;
  severidade?: Severidade;
  deviceId?: string | null;
  deviceLabel?: string;
  provider?: string;
  avisar?: boolean;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const severidade = input.severidade ?? "erro";
  let alerta = { ok: false, detalhe: "Aviso não solicitado." };

  if (input.avisar !== false) {
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const icone = severidade === "ok" ? "✅" : severidade === "aviso" ? "⚠️" : "🚨";
    const linhas = [
      `${icone} NXS Multi Atendimento`,
      input.deviceLabel ? `Aparelho: ${input.deviceLabel}` : null,
      input.provider ? `API: ${input.provider === "wuzapi" ? "WuzAPI" : "Evolution Go"}` : null,
      `Ocorrência: ${input.tipo}`,
      input.mensagem,
      `Data: ${quando}`,
    ].filter(Boolean);
    alerta = await enviarAlerta(linhas.join("\n"), input.deviceId ?? null);
  }

  try {
    await supabaseAdmin.from("monitor_eventos").insert({
      device_id: input.deviceId ?? null,
      device_label: input.deviceLabel ?? "",
      provider: input.provider ?? "",
      tipo: input.tipo,
      severidade,
      mensagem: input.mensagem.slice(0, 1000),
      alerta_enviado: alerta.ok,
      alerta_detalhe: alerta.detalhe.slice(0, 300),
    } as never);
  } catch {
    /* histórico é informativo */
  }
}

async function marcarEstado(
  configId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("whatsapp_config")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", configId);
}

function origemPublica(): string {
  const projectId =
    process.env["LOVABLE_PROJECT_ID"] ?? "a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779";
  // Domínio estável da versão publicada (é ele que a Evolution precisa alcançar).
  return `https://project--${projectId}.lovable.app`;
}

/** Tenta religar a instância (reconecta e reassina o webhook). */
async function tentarReconectar(config: EvolutionConfig): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const { ensureEvolutionInstance, evolutionConnectInstance, evolutionGetStatus } = await import(
      "@/lib/evolution.server"
    );
    const instanceId = await ensureEvolutionInstance(config);
    const origem = origemPublica();
    const webhook = origem
      ? `${origem}/api/public/evolution?token=${config.webhook_token ?? ""}`
      : ((config as unknown as { webhook_url?: string }).webhook_url ?? "");

    await evolutionConnectInstance(
      {
        baseUrl: config.base_url,
        instanceId,
        configId: config.id,
        provider: config.provider ?? undefined,
      },
      { webhookUrl: webhook, immediate: true },
    );

    // Dá tempo da sessão subir e confere algumas vezes antes de desistir.
    for (let tentativa = 1; tentativa <= 4; tentativa += 1) {
      await new Promise((r) => setTimeout(r, tentativa * 2500));
      try {
        const status = await evolutionGetStatus({
          baseUrl: config.base_url,
          instanceId,
          configId: config.id,
          provider: config.provider ?? undefined,
          timeoutMs: 15_000,
        });
        if (status.connected && status.loggedIn) {
          return { ok: true, detalhe: "Conexão restabelecida automaticamente." };
        }
      } catch {
        /* segue tentando */
      }
    }
    return { ok: false, detalhe: "A instância não voltou a ficar on-line." };
  } catch (error) {
    return {
      ok: false,
      detalhe: error instanceof Error ? error.message : "Falha ao religar a instância.",
    };
  }
}

/**
 * Confere o aparelho várias vezes antes de declarar queda: instabilidade de
 * rede ou um timeout isolado não deve derrubar a conexão nem gerar alerta.
 */
async function conferirComTentativas(
  device: EvolutionConfig,
  tentativas = 3,
): Promise<{ online: boolean; erro: string; telefone: string; nomeConta: string }> {
  const { ensureEvolutionInstance, evolutionGetStatus } = await import("@/lib/evolution.server");
  let erro = "A API não respondeu.";
  let telefone = device.phone ?? "";
  let nomeConta = "";

  for (let i = 1; i <= tentativas; i += 1) {
    try {
      const instanceId = await ensureEvolutionInstance(device);
      const status = await evolutionGetStatus({
        baseUrl: device.base_url,
        instanceId,
        configId: device.id,
        provider: device.provider ?? undefined,
        timeoutMs: 20_000,
      });
      telefone = status.phone || telefone;
      nomeConta = status.name || nomeConta;
      if (status.connected && status.loggedIn) {
        return { online: true, erro: "", telefone, nomeConta };
      }
      erro = "A API respondeu, mas o aparelho está desconectado do WhatsApp.";
    } catch (error) {
      erro = error instanceof Error ? error.message : "A API não respondeu.";
    }
    if (i < tentativas) await new Promise((r) => setTimeout(r, 3000));
  }
  return { online: false, erro, telefone, nomeConta };
}

export type ResultadoVerificacao = {
  verificados: number;
  quedas: number;
  religados: number;
  detalhes: { device: string; estado: string; detalhe: string }[];
};

/** Passa por todos os aparelhos, religa o que caiu e avisa o número de plantão. */
export async function verificarConexoes(
  requestUrl?: string | null,
): Promise<ResultadoVerificacao> {
  const settings = await carregarMonitorSettings();
  const resultado: ResultadoVerificacao = {
    verificados: 0,
    quedas: 0,
    religados: 0,
    detalhes: [],
  };
  if (!settings.ativo) return resultado;

  const {
    listEvolutionConfigs,
    ensureEvolutionInstance,
    evolutionGetStatus,
    ensureEvolutionWebhook,
  } = await import("@/lib/evolution.server");
  const devices = await listEvolutionConfigs();

  for (const device of devices) {
    if (!device.base_url) continue;
    resultado.verificados += 1;
    const nome = device.label || device.instance_name || "Dispositivo";
    const estadoAnterior = (device as unknown as { monitor_estado?: string }).monitor_estado ?? null;
    const tentativas =
      (device as unknown as { monitor_tentativas?: number }).monitor_tentativas ?? 0;

    let online = false;
    let erro = "";
    let telefone = device.phone ?? "";
    let nomeConta = "";
    try {
      const instanceId = await ensureEvolutionInstance(device);
      const status = await evolutionGetStatus({
        baseUrl: device.base_url,
        instanceId,
        configId: device.id,
        provider: device.provider ?? undefined,
        timeoutMs: 15_000,
      });
      online = status.connected && status.loggedIn;
      telefone = status.phone || telefone;
      nomeConta = status.name || "";
      if (!online) erro = "A API respondeu, mas o aparelho está desconectado do WhatsApp.";
    } catch (error) {
      online = false;
      erro = error instanceof Error ? error.message : "A API não respondeu.";
    }

    if (online) {
      // Autocorreção: garante que o webhook aponte para o endereço de produção.
      await ensureEvolutionWebhook(device.id, { requestUrl: requestUrl ?? null });
      await marcarEstado(device.id, {
        monitor_estado: "online",
        monitor_tentativas: 0,
        monitor_ultimo_check: new Date().toISOString(),
        monitor_ultimo_erro: null,
        ...(device.status !== "connected" ? { status: "connected" } : {}),
        ...(estadoAnterior !== "online" ? { monitor_desde: new Date().toISOString() } : {}),
      });
      // Avisa no WhatsApp sempre que o aparelho passa a ficar on-line
      // (inclusive na primeira verificação, sem estado anterior).
      if (estadoAnterior !== "online") {
        const api = device.provider === "wuzapi" ? "WuzAPI" : "Evolution Go";
        const linhas = [
          estadoAnterior === "offline"
            ? `O aparelho ${nome} voltou a ficar on-line.`
            : `O aparelho ${nome} está conectado.`,
          `API: ${api}`,
          telefone ? `Número: ${telefone}` : null,
          nomeConta ? `Conta: ${nomeConta}` : null,
        ].filter(Boolean);
        await registrarOcorrencia({
          tipo: estadoAnterior === "offline" ? "Conexão restabelecida" : "Conexão confirmada",
          mensagem: linhas.join("\n"),
          severidade: "ok",
          deviceId: device.id,
          deviceLabel: nome,
          provider: device.provider,
        });
      }
      resultado.detalhes.push({ device: nome, estado: "online", detalhe: "Tudo certo." });
      continue;
    }

    resultado.quedas += 1;
    let religou = { ok: false, detalhe: "Religamento automático desligado." };
    if (settings.auto_reconectar) {
      religou = await tentarReconectar(device);
      if (religou.ok) resultado.religados += 1;
    }

    await marcarEstado(device.id, {
      monitor_estado: religou.ok ? "online" : "offline",
      monitor_tentativas: religou.ok ? 0 : tentativas + 1,
      monitor_ultimo_check: new Date().toISOString(),
      monitor_ultimo_erro: erro.slice(0, 300),
      monitor_desde: new Date().toISOString(),
      ...(religou.ok ? { status: "connected" } : { status: "disconnected" }),
    });

    if (religou.ok) {
      await registrarOcorrencia({
        tipo: "Queda corrigida automaticamente",
        mensagem: `O aparelho ${nome} caiu (${erro}) e foi religado pela central.`,
        severidade: "aviso",
        deviceId: device.id,
        deviceLabel: nome,
        provider: device.provider,
      });
      resultado.detalhes.push({ device: nome, estado: "religado", detalhe: religou.detalhe });
      continue;
    }

    // Evita repetir o mesmo aviso a cada verificação: avisa na queda e a cada 10 tentativas.
    const avisar = estadoAnterior !== "offline" || (tentativas + 1) % 10 === 0;
    await registrarOcorrencia({
      tipo: "Conexão perdida",
      mensagem: `O aparelho ${nome} está fora do ar. Motivo: ${erro} Religamento: ${religou.detalhe}`,
      severidade: "erro",
      deviceId: device.id,
      deviceLabel: nome,
      provider: device.provider,
      avisar,
    });
    resultado.detalhes.push({ device: nome, estado: "offline", detalhe: erro });
  }

  return resultado;
}
