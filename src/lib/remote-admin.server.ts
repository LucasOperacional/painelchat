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
 * Reconhecimento automático: qualquer mensagem do administrador vira comando.
 * O que não for reconhecido devolve o menu, então ele nunca fica sem resposta.
 */
function interpretar(body: string): Comando {
  const texto = limpar(body).replace(/^[#/*.\s-]+/, "").replace(/[.!?]+$/, "");
  if (!texto) return "menu";
  if (["menu", "admin", "sistema", "0", "ajuda", "opcoes", "opcao", "start", "oi", "ola"].includes(texto)) {
    return "menu";
  }
  if (texto === "1" || /reinicia|restart|reset|reconect/.test(texto)) return "reiniciar";
  if (texto === "2" || /^lig(ar|a|o)?\b|ativar|retomar|on$/.test(texto)) return "ligar";
  if (texto === "3" || /deslig|pausar|parar|off$/.test(texto)) return "desligar";
  if (texto === "4" || /bloquea|bloquear|manutenc/.test(texto)) return "bloquear";
  if (texto === "5" || /status|situacao|relatorio|conexoes|filas/.test(texto)) return "status";
  return "menu";
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

/** Resumo de conexões, instâncias e filas. */
export async function resumoStatus() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { listEvolutionConfigs, evolutionGetStatus } = await import("@/lib/evolution.server");
  const { state, adminPhone } = await controleSistema();

  const devices = await listEvolutionConfigs(null);
  const conexoes: string[] = [];
  for (const device of devices) {
    const nome = device.label || device.instance_name || device.id.slice(0, 8);
    try {
      const status = await evolutionGetStatus({
        baseUrl: device.base_url,
        instanceId: device.instance_id,
        configId: device.id,
        provider: device.provider,
      });
      conexoes.push(`• ${nome}: ${status.connected ? "conectado" : "desconectado"}`);
    } catch (error) {
      conexoes.push(`• ${nome}: erro — ${(error as Error).message}`);
    }
  }
  if (!devices.length) conexoes.push("• nenhum dispositivo cadastrado");

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
    "*Conexões*",
    ...conexoes,
    "",
    "*Filas*",
    `• aguardando: ${aguardando ?? 0}`,
    `• em atendimento: ${emAtendimento ?? 0}`,
  ].join("\n");
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
  // Segunda barreira do kill switch: nenhum caminho pode responder a fromMe.
  if (input.fromMe) return true;
  if (!(await ehAdminRemoto(input.phoneDigits))) return false;
  if (ehEcoAutomatico(input.body)) return true; // eco da nossa resposta: encerra sem reenviar
  // Do próprio aparelho, apenas comandos curtos e explícitos.
  if (input.fromMe && !ehComandoEstrito(input.body)) return true;
  if (!liberarComando(input.phoneDigits)) {
    console.log("[admin-remoto] comando ignorado pela trava de 5s");
    return true;
  }
  const comando = interpretar(input.body ?? "");
  if (!comando) return false;


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
    if (comando === "reiniciar") {
      await responder("Reiniciando o sistema e as APIs...");
      const linhas = await reiniciarConexoes(input.requestUrl ?? null);
      await responder(["*Reinício concluído*", ...linhas].join("\n"));
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
