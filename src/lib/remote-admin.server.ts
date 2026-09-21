/**
 * Controle remoto da central pelo WhatsApp.
 *
 * Somente o número de administrador cadastrado em `system_control.admin_phone`
 * pode abrir o menu e executar as ações. Qualquer outro número é tratado como
 * um contato comum e nunca dispara comandos.
 */

import { toBrazilPhone, digitsOnly } from "@/lib/phone";

export const ADMIN_PHONE_PADRAO = "5562996928605";

export type EstadoSistema = "ligado" | "desligado" | "bloqueado";

export type ControleSistema = {
  adminPhone: string;
  state: EstadoSistema;
  updatedAt: string | null;
};

let cache: { value: ControleSistema; at: number } | null = null;

/** Estado atual do sistema (cache curto para não pesar no webhook). */
export async function controleSistema(): Promise<ControleSistema> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_control")
    .select("admin_phone, state, updated_at")
    .eq("id", true)
    .maybeSingle();
  const value: ControleSistema = {
    adminPhone: normalizarNumero(data?.admin_phone) ?? ADMIN_PHONE_PADRAO,
    state: (data?.state as EstadoSistema) ?? "ligado",
    updatedAt: data?.updated_at ?? null,
  };
  cache = { value, at: Date.now() };
  return value;
}

export function invalidarControleSistema() {
  cache = null;
}

/** Normaliza para 55DDDNÚMERO quando possível; senão, só os dígitos. */
export function normalizarNumero(value: string | null | undefined) {
  const brasil = toBrazilPhone(value);
  if (brasil) return brasil;
  const digits = digitsOnly(value ?? "");
  return digits || null;
}

/** O sistema aceita atender/registrar mensagens agora? */
export async function sistemaAtivo() {
  return (await controleSistema()).state === "ligado";
}

/**
 * Variações do mesmo número brasileiro: o WhatsApp entrega o mesmo telefone
 * com e sem o nono dígito, dependendo do aparelho.
 */
function variacoes(numero: string) {
  const lista = new Set<string>([numero]);
  if (numero.startsWith("55") && numero.length === 13) {
    const ddd = numero.slice(2, 4);
    const assinante = numero.slice(4);
    if (assinante.startsWith("9")) lista.add(`55${ddd}${assinante.slice(1)}`);
  }
  if (numero.startsWith("55") && numero.length === 12) {
    lista.add(`55${numero.slice(2, 4)}9${numero.slice(4)}`);
  }
  return lista;
}

/** É exatamente o número autorizado do administrador? */
export async function ehAdminRemoto(phoneDigits: string | null | undefined) {
  const numero = normalizarNumero(phoneDigits);
  if (!numero) return false;
  const { adminPhone } = await controleSistema();
  const autorizados = variacoes(adminPhone);
  for (const variacao of variacoes(numero)) {
    if (autorizados.has(variacao)) return true;
  }
  return false;
}

const MENU = [
  "*Central — Controle do sistema*",
  "",
  "1 - Reiniciar APIs e sistema (Evolution Go + WuzAPI)",
  "2 - Status e conexões das APIs (relatório de mensagens)",
  "3 - Sentinela e segurança",
  "4 - Controle de IA e chatbots",
  "5 - Ligar / desligar atendimento geral",
  "6 - Menu completo",
  "",
  "Responda com o número da opção.",
].join("\n");

const MENU_COMPLETO = [
  "*Central — Menu completo*",
  "",
  "*Sistema*",
  "1 ou reiniciar — reinicia APIs, sessões e webhooks",
  "5 ou ligar / desligar / bloquear — atendimento geral",
  "",
  "*Relatórios*",
  "2 ou status — conexões, latência e mensagens do dia",
  "",
  "*Sentinela*",
  "3 ou sentinela — situação, alertas e bloqueios",
  "sentinela ligar / sentinela pausar",
  "",
  "*IA e chatbots*",
  "4 ou ia — situação da IA e dos chatbots",
  "ia ligar / ia pausar",
  "",
  "6 ou menu — volta a este resumo",
].join("\n");


function limpar(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

type Comando =
  | "menu"
  | "menu_completo"
  | "reiniciar"
  | "ligar"
  | "desligar"
  | "bloquear"
  | "alternar"
  | "status"
  | "sentinela"
  | "sentinela_ligar"
  | "sentinela_pausar"
  | "ia"
  | "ia_ligar"
  | "ia_pausar";


/**
 * Detecta o eco das nossas próprias respostas automáticas. Sem isso, uma
 * resposta enviada ao administrador voltaria como mensagem "fromMe" e seria
 * interpretada como novo comando, gerando respostas em loop.
 */
const MARCAS_DO_BOT = [
  "status da central",
  "central —",
  "central -",
  "controle do sistema",
  "reiniciando o sistema",
  "reinicio concluido",
  "*conexoes*",
  "*filas*",
  "em atendimento:",
  "aguardando:",
  "administrador:",
  "situacao atual:",
  "sistema *ligado*",
  "sistema *desligado*",
  "sistema *bloqueado*",
  "sistema: ligado",
  "sistema: desligado",
  "sistema: bloqueado",
  "nao consegui executar",
  "modo manutenc",
  "nenhum dispositivo cadastrado",
  "menu completo",
  "*sentinela",
  "sentinela e seguranca",
  "*ia e chatbots*",
  "*relatorio de mensagens*",
  "*apis e conexoes*",
  "*mensagens de hoje*",
  "enviadas hoje:",
  "recebidas hoje:",
  "na fila:",
  "erros:",
  "latencia:",
  "chatbots ativos",
  "chatbots pausados",
  "ultimo ciclo",
  "alertas recentes",
  "responda com o numero da opcao",
];


export function ehEcoAutomatico(body: string | null | undefined) {
  const texto = limpar(body ?? "");
  if (!texto) return false;
  return MARCAS_DO_BOT.some((marca) => texto.includes(marca));
}

/** Comandos aceitos quando a mensagem vem do próprio aparelho (fromMe). */
const COMANDOS_ESTRITOS = new Set([
  "menu",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "#admin",
  "#sistema",
  "admin",
  "sistema",
  "status",
  "reiniciar",
  "ligar",
  "desligar",
  "bloquear",
  "sentinela",
  "sentinela ligar",
  "sentinela pausar",
  "ia",
  "ia ligar",
  "ia pausar",
]);


/**
 * Em mensagens fromMe só aceitamos comandos curtos e explícitos: qualquer
 * texto longo ou com várias linhas é conteúdo (nosso ou do usuário), nunca
 * comando — é essa regra que impede o loop de respostas.
 */
export function ehComandoEstrito(body: string | null | undefined) {
  const bruto = (body ?? "").trim();
  if (!bruto || bruto.length > 30 || /\r|\n/.test(bruto)) return false;
  return COMANDOS_ESTRITOS.has(limpar(bruto).replace(/[.!?]+$/, ""));
}

/** Trava de frequência: no máximo 1 comando por chat a cada 5 segundos. */
const ULTIMA_RESPOSTA = new Map<string, number>();
const JANELA_MS = 5000;

export function liberarComando(chave: string) {
  const agora = Date.now();
  const anterior = ULTIMA_RESPOSTA.get(chave) ?? 0;
  if (agora - anterior < JANELA_MS) return false;
  ULTIMA_RESPOSTA.set(chave, agora);
  if (ULTIMA_RESPOSTA.size > 200) {
    for (const [k, v] of ULTIMA_RESPOSTA) {
      if (agora - v > JANELA_MS * 10) ULTIMA_RESPOSTA.delete(k);
    }
  }
  return true;
}

export { ADMIN_BOT_NAME } from "@/lib/admin-bot";

/**
 * Palavras que abrem o menu. Somente estas (além dos números das opções já
 * exibidas) são aceitas; qualquer outra conversa é ignorada.
 */
const ABERTURA_MENU = new Set(["oi", "menu", "status"]);

export function ehAberturaMenu(body: string | null | undefined) {
  const texto = limpar(body ?? "")
    .replace(/^[#/*.\s-]+/, "")
    .replace(/[.!?]+$/, "")
    .trim();
  return ABERTURA_MENU.has(texto);
}

/**
 * Reconhecimento de comandos do administrador. Retorna `null` quando o texto
 * não é um comando conhecido — nesse caso nada é respondido.
 */
function interpretar(body: string): Comando | null {
  const texto = limpar(body).replace(/^[#/*.\s-]+/, "").replace(/[.!?]+$/, "");
  if (!texto) return null;

  // Sentinela e IA aceitam sub-comandos (ligar/pausar).
  if (/^sentinela|^seguranca/.test(texto)) {
    if (/lig|ativ|retom/.test(texto)) return "sentinela_ligar";
    if (/paus|deslig|parar|off/.test(texto)) return "sentinela_pausar";
    return "sentinela";
  }
  if (/^ia\b|^chatbot|^bot\b|^inteligencia/.test(texto)) {
    if (/lig|ativ|retom/.test(texto)) return "ia_ligar";
    if (/paus|deslig|parar|off/.test(texto)) return "ia_pausar";
    return "ia";
  }

  if (texto === "6" || texto === "menu completo") return "menu_completo";
  if (texto === "oi" || texto === "menu") return "menu";
  if (texto === "1" || texto === "reiniciar") return "reiniciar";
  if (texto === "2" || texto === "status") return "status";
  if (texto === "3") return "sentinela";
  if (texto === "4") return "ia";
  if (texto === "5" || texto === "alternar") return "alternar";
  if (texto === "bloquear") return "bloquear";
  if (texto === "ligar") return "ligar";
  if (texto === "desligar") return "desligar";
  return null;
}


async function definirEstado(state: EstadoSistema) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("system_control")
    .upsert({ id: true, state, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  invalidarControleSistema();
}

/** Reinicia conexões e instâncias: reaponta webhook e refaz a sessão. */
export async function reiniciarConexoes(requestUrl?: string | null) {
  const {
    listEvolutionConfigs,
    ensureEvolutionWebhook,
    evolutionGetStatus,
    invalidateProviderCache,
    invalidateEvolutionSessionCache,
  } = await import("@/lib/evolution.server");

  invalidateProviderCache();
  invalidateEvolutionSessionCache();

  const devices = await listEvolutionConfigs(null);
  const linhas: string[] = [];
  for (const device of devices) {
    const nome = device.label || device.instance_name || device.id.slice(0, 8);
    try {
      await ensureEvolutionWebhook(device.id, { requestUrl: requestUrl ?? null, force: true });
      const status = await evolutionGetStatus({
        baseUrl: device.base_url,
        instanceId: device.instance_id,
        configId: device.id,
        provider: device.provider,
      });
      linhas.push(`• ${nome}: ${status.connected ? "conectado" : "aguardando conexão"}`);
    } catch (error) {
      linhas.push(`• ${nome}: falha — ${(error as Error).message}`);
    }
  }
  if (!devices.length) linhas.push("• nenhum dispositivo cadastrado");
  return linhas;
}

function nomeProvedor(provider: string | null | undefined) {
  return provider === "wuzapi" ? "WuzAPI" : "Evolution Go";
}

/** Início do dia no horário de Brasília, em ISO. */
function inicioDoDia() {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const dia = `${brasilia.getUTCFullYear()}-${String(brasilia.getUTCMonth() + 1).padStart(2, "0")}-${String(
    brasilia.getUTCDate(),
  ).padStart(2, "0")}`;
  return new Date(`${dia}T03:00:00.000Z`).toISOString();
}

/** Relatório de mensagens do dia e da fila de eventos. */
export async function relatorioMensagens() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const desde = inicioDoDia();
  const { count: totalEnviadas } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "outbound")
    .gte("created_at", desde);
  const { count: totalRecebidas } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .gte("created_at", desde);
  const enviadas = totalEnviadas ?? 0;
  const recebidas = totalRecebidas ?? 0;


  const { count: naFila } = await supabaseAdmin
    .from("webhook_eventos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");
  const { count: erros } = await supabaseAdmin
    .from("webhook_eventos")
    .select("id", { count: "exact", head: true })
    .eq("status", "erro");

  return {
    enviadas,
    recebidas,
    naFila: naFila ?? 0,
    erros: erros ?? 0,
    linhas: [
      "*Mensagens de hoje*",
      `• enviadas hoje: ${enviadas}`,
      `• recebidas hoje: ${recebidas}`,
      `• na fila: ${naFila ?? 0}`,
      `• erros: ${erros ?? 0}`,
    ],
  };
}

/** Saúde das APIs (Evolution Go e WuzAPI) com latência medida. */
export async function relatorioApis() {
  const { listEvolutionConfigs, evolutionGetStatus } = await import("@/lib/evolution.server");
  const devices = await listEvolutionConfigs(null);
  const linhas: string[] = [];
  for (const device of devices) {
    const nome = device.label || device.instance_name || device.id.slice(0, 8);
    const marca = nomeProvedor(device.provider);
    const inicio = Date.now();
    try {
      const status = await evolutionGetStatus({
        baseUrl: device.base_url,
        instanceId: device.instance_id,
        configId: device.id,
        provider: device.provider,
      });
      linhas.push(
        `• ${nome} (${marca}): ${status.connected ? "conectado" : "desconectado"} — latencia: ${Date.now() - inicio}ms`,
      );
    } catch (error) {
      linhas.push(`• ${nome} (${marca}): erro — ${(error as Error).message}`);
    }
  }
  if (!devices.length) linhas.push("• nenhum dispositivo cadastrado");
  return linhas;
}

/** Resumo de conexões, APIs, mensagens e filas. */
export async function resumoStatus() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { state, adminPhone } = await controleSistema();
  const conexoes = await relatorioApis();
  const mensagens = await relatorioMensagens();

  const { count: aguardando } = await supabaseAdmin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("status", "waiting");
  const { count: emAtendimento } = await supabaseAdmin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");

  return [
    "*Status da central*",
    `Sistema: ${state}`,
    `Administrador: ${adminPhone}`,
    "",
    "*APIs e conexoes*",
    ...conexoes,
    "",
    ...mensagens.linhas,
    "",
    "*Filas*",
    `• aguardando: ${aguardando ?? 0}`,
    `• em atendimento: ${emAtendimento ?? 0}`,
  ].join("\n");
}

/** Situação da Sentinela: vigilância, segurança e alertas recentes. */
export async function resumoSentinela() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { carregarSentinelaSettings } = await import("@/lib/sentinela.server");
  const cfg = await carregarSentinelaSettings();

  const { data: ciclo } = await supabaseAdmin
    .from("sentinela_ciclos")
    .select("iniciado_em, resumo, severidade, problemas, corrigidos")
    .order("iniciado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: achados } = await supabaseAdmin
    .from("sentinela_achados")
    .select("titulo, severidade, status, created_at")
    .eq("status", "aberto")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: bloqueios } = await supabaseAdmin
    .from("sentinela_trafego")
    .select("id", { count: "exact", head: true })
    .gte("ultimo_em", inicioDoDia());

  const linhas = [
    "*Sentinela e seguranca*",
    `Vigilancia: ${cfg.ativo ? "ativa" : "pausada"}`,
    `Intervalo: ${cfg.intervalo_minutos} min`,
    `Modo de seguranca: ${cfg.seguranca_modo}`,
    `Limite por minuto: ${cfg.limite_req_minuto}`,
    `Registros de trafego hoje: ${bloqueios ?? 0}`,
    "",
    "Ultimo ciclo:",
    ciclo
      ? `• ${new Date(ciclo.iniciado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ${ciclo.severidade} (${ciclo.problemas} problemas, ${ciclo.corrigidos} corrigidos)`
      : "• nenhum ciclo registrado",
    "",
    "Alertas recentes:",
    ...(achados?.length
      ? achados.map((a) => `• [${a.severidade}] ${a.titulo}`)
      : ["• nenhum alerta aberto"]),
    "",
    "Envie *sentinela ligar* ou *sentinela pausar*.",
  ];
  return linhas.join("\n");
}

export async function definirSentinela(ativo: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { carregarSentinelaSettings } = await import("@/lib/sentinela.server");
  const cfg = await carregarSentinelaSettings();
  const { error } = await supabaseAdmin
    .from("sentinela_settings")
    .update({ ativo } as never)
    .eq("id", cfg.id);
  if (error) throw new Error(error.message);
}

/** Situação da IA e dos chatbots de atendimento (o bot admin fica de fora). */
export async function resumoIA() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ADMIN_BOT_NAME } = await import("@/lib/admin-bot");
  const { data } = await supabaseAdmin
    .from("chatbots")
    .select("name, is_active, ai_enabled")
    .neq("name", ADMIN_BOT_NAME)
    .order("name");

  const bots = data ?? [];
  const ativos = bots.filter((b) => b.is_active);
  const linhas = [
    "*IA e chatbots*",
    `Chatbots ativos: ${ativos.length}`,
    `Chatbots pausados: ${bots.length - ativos.length}`,
    "",
    ...(bots.length
      ? bots.map(
          (b) => `• ${b.name}: ${b.is_active ? "ligado" : "pausado"}${b.ai_enabled ? " (IA ligada)" : ""}`,
        )
      : ["• nenhum chatbot de atendimento cadastrado"]),
    "",
    "Envie *ia ligar* ou *ia pausar*.",
  ];
  return linhas.join("\n");
}

export async function definirIA(ativo: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ADMIN_BOT_NAME } = await import("@/lib/admin-bot");
  const { error } = await supabaseAdmin
    .from("chatbots")
    .update({ is_active: ativo } as never)
    .neq("name", ADMIN_BOT_NAME);
  if (error) throw new Error(error.message);
}


/**
 * Intercepta a mensagem do administrador remoto.
 * Devolve `true` quando a mensagem foi tratada como comando (e não deve virar
 * conversa de atendimento).
 */
export async function processarComandoAdmin(input: {
  phoneDigits: string;
  body: string;
  configId?: string | null;
  requestUrl?: string | null;
  fromMe?: boolean;
}): Promise<boolean> {
  if (!(await ehAdminRemoto(input.phoneDigits))) return false;
  if (ehEcoAutomatico(input.body)) return true; // eco da nossa resposta: encerra sem reenviar
  // Do próprio aparelho, apenas comandos curtos e explícitos.
  if (input.fromMe && !ehComandoEstrito(input.body)) return true;
  // Somente comandos conhecidos ("oi", "menu", "status" e as opções do menu).
  // Qualquer outra conversa segue como mensagem comum, sem abrir o menu.
  const comando = interpretar(input.body ?? "");
  if (!comando) return false;
  if (!liberarComando(input.phoneDigits)) {
    console.log("[admin-remoto] comando ignorado pela trava de 5s");
    return true;
  }


  const { sendWhatsappText } = await import("@/lib/inbound.server");
  const responder = async (text: string) => {
    try {
      await sendWhatsappText({
        phoneDigits: input.phoneDigits,
        text,
        configId: input.configId ?? null,
      });
    } catch (error) {
      console.error("[admin-remoto] falha ao responder:", (error as Error).message);
    }
  };

  try {
    if (comando === "menu") {
      const { state } = await controleSistema();
      await responder(`${MENU}\n\nSituação atual: *${state}*`);
      return true;
    }
    if (comando === "menu_completo") {
      await responder(MENU_COMPLETO);
      return true;
    }
    if (comando === "reiniciar") {
      // Uma única resposta por opção: nada de aviso antes + resultado depois.
      const linhas = await reiniciarConexoes(input.requestUrl ?? null);
      await responder(
        ["*Reinicio concluido* (Evolution Go + WuzAPI)", ...linhas, "", "Webhooks revalidados."].join("\n"),
      );
      return true;
    }
    if (comando === "status") {
      await responder(await resumoStatus());
      return true;
    }
    if (comando === "sentinela") {
      await responder(await resumoSentinela());
      return true;
    }
    if (comando === "sentinela_ligar") {
      await definirSentinela(true);
      await responder("🛡️ Sentinela *ativa*. Vigilancia e protecao ligadas.");
      return true;
    }
    if (comando === "sentinela_pausar") {
      await definirSentinela(false);
      await responder("🛡️ Sentinela *pausada*. Nenhum ciclo automatico sera executado.");
      return true;
    }
    if (comando === "ia") {
      await responder(await resumoIA());
      return true;
    }
    if (comando === "ia_ligar") {
      await definirIA(true);
      await responder("🤖 IA e chatbots de atendimento *ligados*.");
      return true;
    }
    if (comando === "ia_pausar") {
      await definirIA(false);
      await responder("🤖 IA e chatbots de atendimento *pausados*.");
      return true;
    }
    if (comando === "alternar") {
      const { state } = await controleSistema();
      const novo: EstadoSistema = state === "ligado" ? "desligado" : "ligado";
      await definirEstado(novo);
      await responder(
        novo === "ligado"
          ? "✅ Atendimento geral *ligado*."
          : "⏸️ Atendimento geral *desligado*. Recebimento e chatbots pausados.",
      );
      return true;
    }
    if (comando === "ligar") {
      await definirEstado("ligado");
      await responder("✅ Sistema *ligado*. Atendimento e chatbots ativos.");
      return true;
    }
    if (comando === "desligar") {
      await definirEstado("desligado");
      await responder("⏸️ Sistema *desligado*. Recebimento, atendimento e chatbots pausados.");
      return true;
    }
    if (comando === "bloquear") {
      await definirEstado("bloqueado");
      await responder("🔒 Sistema *bloqueado* (modo manutenção).");
      return true;
    }
    await responder(await resumoStatus());
    return true;

  } catch (error) {
    console.error("[admin-remoto] falha no comando:", (error as Error).message);
    await responder(`Não consegui executar: ${(error as Error).message}`);
    return true;
  }
}
