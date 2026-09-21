// Importação do histórico do celular (conversas e grupos) para a central.
// Funciona com Evolution Go e WuzAPI: tenta as rotas conhecidas de cada
// servidor e também aproveita o evento HistorySync enviado no pareamento.
// Uso exclusivo no servidor.

import { loadEvolutionConfig, evolutionRequest } from "@/lib/evolution.server";
import { jidToPhone } from "@/lib/phone";
import { recordInboundMessage, shouldIgnoreGroups } from "@/lib/inbound.server";

export type ResumoImportacao = {
  conversas: number;
  mensagens: number;
  ignoradas: number;
  avisos: string[];
};

/** Regra da central: importar o histórico já existente no aparelho. */
export async function shouldSyncHistory(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("inbound_settings")
    .select("sync_history")
    .eq("id", true)
    .maybeSingle();
  // Sem registro salvo, a regra vale como ligada.
  return (data as { sync_history?: boolean } | null)?.sync_history !== false;
}

// ---------------------------------------------------------------------------
// Leitura tolerante de payloads (cada servidor usa nomes diferentes)
// ---------------------------------------------------------------------------

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pick(node: Dict | undefined, ...keys: string[]): unknown {
  if (!node) return undefined;
  for (const key of keys) {
    const direct = node[key];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
    const found = Object.keys(node).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found) {
      const value = node[found];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** Texto da mensagem em qualquer um dos formatos conhecidos. */
export function textoDaMensagem(node: unknown, depth = 0): string {
  if (typeof node === "string") return node.trim();
  if (!isDict(node) || depth > 6) return "";
  const direto = pick(
    node,
    "conversation",
    "text",
    "body",
    "caption",
    "Conversation",
    "Text",
    "Body",
    "Caption",
  );
  if (typeof direto === "string" && direto.trim()) return direto.trim();
  for (const value of Object.values(node)) {
    if (isDict(value) || typeof value === "string") {
      const found = textoDaMensagem(value, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function tipoDeMidia(node: unknown): string {
  if (!isDict(node)) return "";
  const chaves = Object.keys(node).join(" ").toLowerCase();
  if (chaves.includes("image")) return "[imagem]";
  if (chaves.includes("video")) return "[vídeo]";
  if (chaves.includes("audio") || chaves.includes("ptt")) return "[áudio]";
  if (chaves.includes("sticker")) return "[figurinha]";
  if (chaves.includes("document")) return "[documento]";
  if (chaves.includes("location")) return "[localização]";
  if (chaves.includes("contact")) return "[contato]";
  return "";
}

function paraIso(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && /\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const numero = Number(value);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  // Segundos ou milissegundos.
  const ms = numero > 1e12 ? numero : numero * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now() + 86_400_000) return null;
  return d.toISOString();
}

export type MensagemHistorico = {
  chatJid: string;
  externalId: string | null;
  fromMe: boolean;
  texto: string;
  ocorridaEm: string | null;
  autorNome: string | null;
  autorJid: string | null;
};

/** Converte uma mensagem crua (qualquer provedor) no formato da central. */
export function normalizarMensagem(raw: unknown, chatJidPadrao = ""): MensagemHistorico | null {
  if (!isDict(raw)) return null;
  const info = (isDict(raw["Info"]) ? raw["Info"] : isDict(raw["key"]) ? raw["key"] : raw) as Dict;
  const envelope = isDict(raw["message"])
    ? (raw["message"] as Dict)
    : isDict(raw["Message"])
      ? (raw["Message"] as Dict)
      : raw;

  const chatJid =
    asString(pick(info, "Chat", "remoteJid", "chatJid", "chat", "jid", "RemoteJid")) ||
    asString(pick(raw as Dict, "chatJid", "remoteJid", "jid")) ||
    chatJidPadrao;
  if (!chatJid) return null;

  const texto = textoDaMensagem(envelope) || tipoDeMidia(envelope);
  if (!texto) return null;

  const fromMeRaw = pick(info, "IsFromMe", "fromMe", "FromMe", "isFromMe");
  const ocorridaEm =
    paraIso(pick(info, "Timestamp", "messageTimestamp", "timestamp", "t")) ??
    paraIso(pick(raw as Dict, "messageTimestamp", "timestamp", "Timestamp", "t"));

  return {
    chatJid,
    externalId: asString(pick(info, "ID", "Id", "id", "key_id")) || null,
    fromMe: fromMeRaw === true || fromMeRaw === "true" || fromMeRaw === 1,
    texto,
    ocorridaEm,
    autorNome:
      asString(pick(raw as Dict, "pushName", "PushName", "notifyName")) ||
      asString(pick(info, "PushName", "pushName")) ||
      null,
    autorJid:
      asString(pick(info, "Sender", "participant", "Participant", "SenderAlt")) || null,
  };
}

/** Grava uma mensagem histórica sem acionar saudação, chatbot ou IA. */
async function gravarHistorico(
  msg: MensagemHistorico,
  configId: string | null,
  resumo: ResumoImportacao,
  conversasVistas: Set<string>,
) {
  const isGroup = msg.chatJid.includes("@g.us");
  const phoneDigits = isGroup ? jidToPhone(msg.chatJid) : jidToPhone(msg.chatJid);
  if (!phoneDigits) {
    resumo.ignoradas += 1;
    return;
  }
  const participantPhone = msg.autorJid ? jidToPhone(msg.autorJid) : "";
  const resultado = await recordInboundMessage({
    phoneDigits,
    name: isGroup ? null : msg.autorNome,
    body: msg.texto,
    externalId: msg.externalId,
    configId,
    isGroup,
    chatJid: msg.chatJid,
    participantName: isGroup && !msg.fromMe ? msg.autorNome : null,
    participantPhone: isGroup && !msg.fromMe && participantPhone ? participantPhone : null,
    fromMe: msg.fromMe,
    occurredAt: msg.ocorridaEm,
    skipAutomations: true,
  });
  if (!resultado.conversationId) {
    resumo.ignoradas += 1;
    return;
  }
  resumo.mensagens += 1;
  if (!conversasVistas.has(resultado.conversationId)) {
    conversasVistas.add(resultado.conversationId);
    resumo.conversas += 1;
  }
}

// ---------------------------------------------------------------------------
// Importação sob demanda (botão "Importar conversas do celular")
// ---------------------------------------------------------------------------

/** Rotas de listagem de conversas conhecidas nos servidores suportados. */
const ROTAS_CONVERSAS: Array<{ path: string; method: "GET" | "POST"; body?: unknown }> = [
  { path: "/chat/list", method: "GET" },
  { path: "/chat/all", method: "GET" },
  { path: "/chats", method: "GET" },
  { path: "/chat/findChats", method: "POST", body: {} },
];

/** Rotas de histórico de mensagens de uma conversa. */
const ROTAS_MENSAGENS = (chatJid: string, limite: number) =>
  [
    { path: "/chat/messages", method: "POST" as const, body: { chatJid, limit: limite } },
    { path: "/chat/history", method: "POST" as const, body: { chatJid, count: limite } },
    { path: "/message/list", method: "POST" as const, body: { chatJid, limit: limite } },
    {
      path: "/chat/findMessages",
      method: "POST" as const,
      body: { where: { key: { remoteJid: chatJid } }, limit: limite },
    },
  ] satisfies Array<{ path: string; method: "POST"; body: unknown }>;

function listaDe(payload: unknown): Dict[] {
  const alvo = isDict(payload) ? (payload["data"] ?? payload) : payload;
  if (Array.isArray(alvo)) return alvo.filter(isDict);
  if (isDict(alvo)) {
    for (const chave of ["messages", "Messages", "records", "chats", "Chats", "conversations"]) {
      const valor = alvo[chave];
      if (Array.isArray(valor)) return valor.filter(isDict);
    }
    // Mapas { jid: {...} } (formato da WuzAPI).
    const valores = Object.values(alvo);
    if (valores.length && valores.every(isDict)) return valores as Dict[];
  }
  return [];
}

type Alvo = {
  baseUrl: string;
  instanceId: string | undefined;
  configId: string | null;
  provider: string;
};

async function tentarRotas(
  alvo: Alvo,
  rotas: Array<{ path: string; method: "GET" | "POST"; body?: unknown }>,
): Promise<Dict[]> {
  for (const rota of rotas) {
    try {
      const payload = await evolutionRequest<unknown>({
        baseUrl: alvo.baseUrl,
        ...(alvo.instanceId ? { instanceId: alvo.instanceId } : {}),
        configId: alvo.configId,
        path: rota.path,
        method: rota.method,
        ...(rota.body === undefined ? {} : { body: rota.body }),
        provider: alvo.provider,
        timeoutMs: 45_000,
      });
      const lista = listaDe(payload);
      if (lista.length) return lista;
    } catch {
      // Rota inexistente nesse servidor: tenta a próxima.
    }
  }
  return [];
}

function jidDaConversa(chat: Dict): string {
  const bruto =
    asString(pick(chat, "JID", "jid", "id", "Id", "chatJid", "remoteJid", "Chat")) || "";
  if (!bruto) return "";
  return bruto.includes("@") ? bruto : `${bruto.replace(/\D/g, "")}@s.whatsapp.net`;
}

export async function importarHistoricoDoDispositivo(opts: {
  deviceId?: string | null;
  limitePorConversa?: number;
  incluirGrupos?: boolean;
}): Promise<ResumoImportacao> {
  const resumo: ResumoImportacao = { conversas: 0, mensagens: 0, ignoradas: 0, avisos: [] };
  const conversasVistas = new Set<string>();

  const config = await loadEvolutionConfig(opts.deviceId ?? null);
  if (!config) {
    throw new Error("Cadastre um dispositivo de WhatsApp antes de importar as conversas.");
  }
  const alvo: Alvo = {
    baseUrl: config.base_url,
    instanceId: config.instance_id || undefined,
    configId: config.id,
    provider: config.provider,
  };

  const limite = Math.min(Math.max(opts.limitePorConversa ?? 50, 1), 500);
  const incluirGrupos = opts.incluirGrupos ?? !(await shouldIgnoreGroups());

  const chats = await tentarRotas(alvo, ROTAS_CONVERSAS);
  if (!chats.length) {
    resumo.avisos.push(
      "O servidor deste dispositivo não devolve a lista de conversas antigas. O histórico é importado sozinho quando o celular é pareado de novo pelo QR Code.",
    );
    return resumo;
  }

  for (const chat of chats) {
    const chatJid = jidDaConversa(chat);
    if (!chatJid) continue;
    const isGroup = chatJid.includes("@g.us");
    if (isGroup && !incluirGrupos) continue;
    if (chatJid.includes("@broadcast") || chatJid.includes("status@")) continue;

    // Algumas listagens já trazem as mensagens embutidas.
    const embutidas = listaDe(chat["messages"] ?? chat["Messages"]);
    const brutas = embutidas.length
      ? embutidas
      : await tentarRotas(alvo, ROTAS_MENSAGENS(chatJid, limite));

    const mensagens = brutas
      .map((m) => normalizarMensagem(m, chatJid))
      .filter((m): m is MensagemHistorico => !!m)
      .sort((a, b) => (a.ocorridaEm ?? "").localeCompare(b.ocorridaEm ?? ""))
      .slice(-limite);

    for (const msg of mensagens) {
      try {
        await gravarHistorico(msg, config.id, resumo, conversasVistas);
      } catch {
        resumo.ignoradas += 1;
      }
    }
  }

  if (!resumo.mensagens && !resumo.avisos.length) {
    resumo.avisos.push("Nenhuma mensagem antiga foi encontrada neste dispositivo.");
  }
  return resumo;
}

// ---------------------------------------------------------------------------
// HistorySync: o WhatsApp envia o histórico do celular após o pareamento
// ---------------------------------------------------------------------------

/** Junta todas as mensagens presentes no payload de HistorySync. */
function mensagensDoHistorySync(node: unknown, saida: Dict[] = [], depth = 0): Dict[] {
  if (depth > 8 || saida.length > 20_000) return saida;
  if (Array.isArray(node)) {
    for (const item of node) mensagensDoHistorySync(item, saida, depth + 1);
    return saida;
  }
  if (!isDict(node)) return saida;
  const temMensagem = isDict(node["message"]) || isDict(node["Message"]);
  const temInfo = isDict(node["key"]) || isDict(node["Info"]);
  if (temMensagem && temInfo) {
    saida.push(node);
    return saida;
  }
  for (const value of Object.values(node)) mensagensDoHistorySync(value, saida, depth + 1);
  return saida;
}

/** Importa o histórico recebido no evento HistorySync do provedor. */
export async function importarHistorySync(
  payload: unknown,
  configId: string | null,
): Promise<ResumoImportacao> {
  const resumo: ResumoImportacao = { conversas: 0, mensagens: 0, ignoradas: 0, avisos: [] };
  if (!(await shouldSyncHistory())) return resumo;

  const ignorarGrupos = await shouldIgnoreGroups();
  const conversasVistas = new Set<string>();
  const brutas = mensagensDoHistorySync(payload);

  for (const bruta of brutas) {
    const msg = normalizarMensagem(bruta);
    if (!msg) continue;
    if (msg.chatJid.includes("@broadcast") || msg.chatJid.includes("status@")) continue;
    if (msg.chatJid.includes("@g.us") && ignorarGrupos) continue;
    try {
      await gravarHistorico(msg, configId, resumo, conversasVistas);
    } catch {
      resumo.ignoradas += 1;
    }
  }
  return resumo;
}
