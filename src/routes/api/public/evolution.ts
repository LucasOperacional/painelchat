// Webhook da Evolution Go — formato oficial documentado em
// https://docs.evolutionfoundation.com.br/evolution-go/webhooks
//
// Corpo recebido: { event, data, instanceId, instanceToken } e, em Receipt, "state".
// Eventos: Message, SendMessage, Receipt, Connected, LoggedOut, PairSuccess,
// QRCode, OfflineSyncCompleted, CallOffer/CallTerminate, grupos e newsletters.

import { createFileRoute } from "@tanstack/react-router";

import { digitsOnly, exactGroupName, jidToPhone } from "@/lib/phone";

type EvolutionWebhook = {
  event?: string;
  state?: string;
  instanceId?: string;
  instanceName?: string;
  instanceToken?: string;
  data?: {
    Info?: {
      Chat?: string;
      Sender?: string;
      SenderAlt?: string;
      Participant?: string;
      IsFromMe?: boolean;
      IsGroup?: boolean;
      ID?: string;
      Type?: string;
      MediaType?: string;
      PushName?: string;
      Edit?: string | number;
      MsgMetaInfo?: Record<string, unknown>;
      MsgBotInfo?: Record<string, unknown>;
    };
    Message?: Record<string, unknown>;
    qrcode?: string;
    Qrcode?: string;
    Code?: string;
    jid?: string;
    pushName?: string;
    status?: string;
    IsEdit?: boolean;
  };
};

/** Todos os JIDs marcados (@) dentro da mensagem, em qualquer nível. */
function collectMentions(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectMentions(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/^mentionedjid$/i.test(key) && Array.isArray(item)) out.push(...item.map(String));
      else collectMentions(item, out);
    }
  }
  return out;
}

/** Diz se o número desta conexão foi marcado (@) na mensagem do grupo. */
function mentionsOwnNumber(
  message: Record<string, unknown> | undefined,
  body: string,
  ownPhone: string,
): boolean {
  const own = digitsOnly(ownPhone ?? "");
  if (own.length < 8) return false;
  const tail = own.slice(-8);
  const mentioned = collectMentions(message).some((jid) => digitsOnly(jid).endsWith(tail));
  return mentioned || new RegExp(`@\\D*${tail}`).test(body ?? "");
}

function field<T>(value: Record<string, unknown>, ...names: string[]): T | undefined {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const entry = Object.entries(value).find(([key]) => wanted.has(key.toLowerCase()));
  return entry?.[1] as T | undefined;
}

function isUnsupportedText(value: string) {
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  if (/^(?:https?:)?\/\/\S+\.enc(?:\?|$)/i.test(normalized)) return true;
  return [
    "[mensagem não suportada]",
    "[imagem recebida]",
    "[vídeo recebido]",
    "[áudio recebido]",
  ].includes(normalized);
}

function failedMediaBody(kind: "image" | "sticker" | "video" | "audio" | "document") {
  const labels = {
    image: "🖼 Imagem recebida — arquivo indisponível",
    sticker: "🖼 Figurinha recebida — arquivo indisponível",
    video: "🎬 Vídeo recebido — arquivo indisponível",
    audio: "🎵 Áudio recebido — arquivo indisponível",
    document: "📎 Documento recebido — arquivo indisponível",
  } as const;
  return labels[kind];
}

function textField(value: Record<string, unknown> | undefined, ...names: string[]): string {
  if (!value) return "";
  const found = field<unknown>(value, ...names);
  return typeof found === "string" ? found.trim() : "";
}

function vcardValue(vcard: string, key: "FN" | "TEL"): string {
  const unfolded = vcard.replace(/\r?\n[ \t]/g, "");
  const line = unfolded
    .split(/\r?\n/)
    .find((item) => item.split(":", 1)[0]?.toUpperCase().split(";")[0] === key);
  return line?.slice(line.indexOf(":") + 1).trim() ?? "";
}

function contactMessageBody(message: Record<string, unknown>): string | null {
  const single = field<Record<string, unknown>>(message, "contactMessage");
  const array = field<Record<string, unknown>>(message, "contactsArrayMessage");
  const entries = single
    ? [single]
    : (field<unknown[]>(array ?? {}, "contacts") ?? []).filter(
        (item): item is Record<string, unknown> => !!item && typeof item === "object",
      );
  if (!entries.length) return null;

  const cards = entries.flatMap((contact) => {
    const vcard = textField(contact, "vcard", "Vcard");
    const name = textField(contact, "displayName", "fullName", "name") || vcardValue(vcard, "FN") || "Contato";
    const phone = textField(contact, "phone", "phoneNumber", "number") || vcardValue(vcard, "TEL");
    const normalizedPhone = phone.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    return normalizedPhone ? [`👤 Contato: ${name}\n📞 ${normalizedPhone}`] : [];
  });
  return cards.length ? cards.join("\n") : null;
}

/**
 * Abre os envelopes do WhatsApp (mensagem temporária, visualização única,
 * documento com legenda) até chegar no conteúdo de verdade — é onde ficam a
 * figurinha, a imagem, o áudio, o vídeo e o documento.
 */
function unwrapMessage(
  message: Record<string, unknown> | undefined,
  profundidade = 0,
): Record<string, unknown> | undefined {
  if (!message || profundidade > 5) return message;
  const envelope = field<Record<string, unknown>>(
    message,
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
  );
  const dentro = envelope ? (field<Record<string, unknown>>(envelope, "message") ?? envelope) : null;
  if (dentro && typeof dentro === "object") return unwrapMessage(dentro, profundidade + 1);
  return message;
}


/** Texto exibido na central para cada tipo de mensagem documentado. */
function extractText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";

  const conversation = field<unknown>(message, "conversation");
  if (typeof conversation === "string" && conversation) return conversation;

  const extended = field<Record<string, unknown>>(message, "extendedTextMessage");
  const extendedText = extended ? field<unknown>(extended, "text") : null;
  if (typeof extendedText === "string" && extendedText) return extendedText;

  const buttons = message["buttonsResponseMessage"] as { selectedDisplayText?: string } | undefined;
  if (buttons?.selectedDisplayText) return buttons.selectedDisplayText;

  const list = message["listResponseMessage"] as { title?: string } | undefined;
  if (list?.title) return list.title;

  const ephemeral = field<Record<string, unknown>>(message, "ephemeralMessage");
  const ephemeralContent = ephemeral
    ? field<Record<string, unknown>>(ephemeral, "message")
    : undefined;
  if (ephemeralContent) return extractText(ephemeralContent);

  const viewOnce = field<Record<string, unknown>>(message, "viewOnceMessage", "viewOnceMessageV2");
  const viewOnceContent = viewOnce
    ? field<Record<string, unknown>>(viewOnce, "message")
    : undefined;
  if (viewOnceContent) return extractText(viewOnceContent);

  const withCaption = field<Record<string, unknown>>(message, "documentWithCaptionMessage");
  const captionContent = withCaption
    ? field<Record<string, unknown>>(withCaption, "message")
    : undefined;
  if (captionContent) return extractText(captionContent);

  for (const key of ["imageMessage", "videoMessage", "documentMessage"] as const) {
    const media = field<{ caption?: string; fileName?: string }>(message, key);
    if (media) {
      if (media.caption) return media.caption;
      if (key === "documentMessage" && media.fileName) return media.fileName;
      return key === "imageMessage" ? "[imagem recebida]" : "[vídeo recebido]";
    }
  }

  if (field(message, "audioMessage")) return "[áudio recebido]";
  if (field(message, "stickerMessage")) return "🖼 Figurinha";
  const location = field<Record<string, unknown>>(message, "locationMessage", "liveLocationMessage");
  if (location) {
    const lat = Number(field<unknown>(location, "degreesLatitude", "degrees_latitude"));
    const lng = Number(field<unknown>(location, "degreesLongitude", "degrees_longitude"));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const name = field<unknown>(location, "name", "caption");
      const address = field<unknown>(location, "address", "comment");
      const lines = [
        `📍 Localização: ${typeof name === "string" && name ? name : `${lat}, ${lng}`}`,
      ];
      if (typeof address === "string" && address) lines.push(address);
      const suppliedUrl = textField(location, "URL", "url");
      lines.push(suppliedUrl || `https://www.google.com/maps?q=${lat},${lng}`);
      return lines.join("\n");
    }
    return "[localização recebida]";
  }
  const contacts = contactMessageBody(message);
  if (contacts) return contacts;
  if (field(message, "contactMessage", "contactsArrayMessage")) return "[contato recebido]";
  if (message["pollCreationMessage"] || message["pollCreationMessageV3"]) return "[enquete recebida]";
  if (message["pollUpdateMessage"] || message["pollVoteMessage"]) return "[voto em enquete]";
  if (message["reactionMessage"]) {
    const reaction = message["reactionMessage"] as { text?: string };
    return reaction.text ?? "";
  }

  return "[mensagem não suportada]";
}

/**
 * Edição de mensagem: o WhatsApp envia um protocolMessage (EDITED/MESSAGE_EDIT)
 * com a mensagem corrigida e a chave da mensagem original. Devolve o texto
 * exato da correção e o ID da mensagem que deve ser atualizada.
 */
function extractEdit(
  message: Record<string, unknown> | undefined,
): { targetId: string | null; text: string } | null {
  if (!message) return null;

  const direct = field<Record<string, unknown>>(message, "editedMessage");
  if (direct) {
    const directContent = field<Record<string, unknown>>(direct, "message") ?? direct;
    const nestedEdit = extractEdit(directContent);
    if (nestedEdit) return nestedEdit;
    const text = extractText(directContent);
    if (text && !isUnsupportedText(text)) return { targetId: null, text };
  }

  const protocol = field<Record<string, unknown>>(message, "protocolMessage");
  if (!protocol) return null;

  const edited = field<Record<string, unknown>>(protocol, "editedMessage");
  if (!edited) return null;

  const editedContent = field<Record<string, unknown>>(edited, "message") ?? edited;
  const text = extractText(editedContent);
  if (!text || isUnsupportedText(text)) return null;

  const key = field<Record<string, unknown>>(protocol, "key");
  const targetId = key ? field<unknown>(key, "id") : null;
  return { targetId: typeof targetId === "string" && targetId ? targetId : null, text };
}

/**
 * Mensagem apagada pelo contato ("apagar para todos"): o WhatsApp envia um
 * protocolMessage do tipo REVOKE com a chave da mensagem original. Devolve o
 * identificador da mensagem que deve ser marcada como apagada no chat.
 */
function extractRevoke(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const protocol = field<Record<string, unknown>>(message, "protocolMessage");
  if (!protocol) return null;
  const tipo = String(field<unknown>(protocol, "type", "Type") ?? "").toUpperCase();
  if (tipo && !/REVOKE/.test(tipo)) return null;
  const key = field<Record<string, unknown>>(protocol, "key", "Key");
  const alvo = key ? field<unknown>(key, "id", "ID", "Id") : null;
  return typeof alvo === "string" && alvo.trim() ? alvo.trim() : null;
}

function editTargetFromInfo(info: EvolutionWebhook["data"] extends infer Data
  ? Data extends { Info?: infer Info }
    ? Info
    : never
  : never): string | null {
  if (!info) return null;
  const metadataTarget = info.MsgMetaInfo
    ? field<unknown>(info.MsgMetaInfo, "TargetID", "TargetId", "target_id")
    : null;
  const botTarget = info.MsgBotInfo
    ? field<unknown>(info.MsgBotInfo, "EditTargetID", "EditTargetId", "edit_target_id")
    : null;
  const target = metadataTarget ?? botTarget;
  return typeof target === "string" && target.trim() ? target.trim() : null;
}

/**
 * A Evolution Go 0.7 envia edições recebidas como secretEncryptedMessage:
 * Info.Edit="1", data.IsEdit=false e o ID original em targetMessageKey.ID.
 */
function encryptedEditTarget(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const encrypted = field<Record<string, unknown>>(message, "secretEncryptedMessage");
  const targetKey = encrypted
    ? field<Record<string, unknown>>(encrypted, "targetMessageKey")
    : undefined;
  const target = targetKey ? field<unknown>(targetKey, "ID", "id") : null;
  return typeof target === "string" && target.trim() ? target.trim() : null;
}

/** Hashes (ou textos) das opções votadas numa enquete, em qualquer formato enviado pela Evolution Go. */
function collectPollVotes(value: unknown, depth = 0): string[] {
  if (!value || depth > 6) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    // Voto pode vir como array de bytes (sha256) ou array de opções.
    if (value.every((v) => typeof v === "number")) {
      return [Buffer.from(value as number[]).toString("hex")];
    }
    return value.flatMap((v) => collectPollVotes(v, depth + 1));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = [
      "selectedOptions",
      "SelectedOptions",
      "selectedOptionsNames",
      "vote",
      "Vote",
      "pollVote",
      "PollVote",
      "pollUpdates",
      "name",
      "Name",
      "optionName",
    ];
    return keys.flatMap((k) => (k in obj ? collectPollVotes(obj[k], depth + 1) : []));
  }
  return [];
}

/** Converte o voto da enquete no texto da opção escolhida, comparando o sha256 das opções do menu. */
async function resolvePollVote(message: Record<string, unknown> | undefined): Promise<string | null> {
  const poll = message?.["pollUpdateMessage"] ?? message?.["pollVoteMessage"];
  if (!poll) return null;
  const votes = collectPollVotes(poll);
  if (!votes.length) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("button_menus").select("options");
  const options = Array.from(
    new Set(((data ?? []) as { options: string[] }[]).flatMap((m) => m.options ?? [])),
  );
  if (!options.length) return null;

  const { createHash } = await import("crypto");
  for (const vote of votes) {
    const raw = vote.trim();
    if (!raw) continue;
    // Alguns servidores já entregam o texto da opção.
    const direct = options.find((o) => o.trim().toLowerCase() === raw.toLowerCase());
    if (direct) return direct;

    const candidates = new Set<string>([raw.toLowerCase()]);
    try {
      candidates.add(Buffer.from(raw, "base64").toString("hex").toLowerCase());
    } catch {
      /* não é base64 */
    }
    for (const option of options) {
      const hash = createHash("sha256").update(option, "utf8").digest();
      if (
        candidates.has(hash.toString("hex").toLowerCase()) ||
        candidates.has(hash.toString("base64").toLowerCase())
      ) {
        return option;
      }
    }
  }
  return null;
}

/** Eventos da WuzAPI convertidos para os nomes já usados pela central. */
const WUZAPI_EVENT: Record<string, string> = {
  Message: "Message",
  QR: "QRCode",
  QRTimeout: "QRCode",
  Connected: "Connected",
  PairSuccess: "PairSuccess",
  LoggedOut: "LoggedOut",
  Disconnected: "Disconnected",
  HistorySync: "HistorySync",
  ReadReceipt: "Receipt",
};

/**
 * Nomes usados pelas versões da Evolution API baseadas em eventos
 * (MESSAGES_UPSERT e companhia) convertidos para os já tratados aqui, para que
 * nenhuma mensagem seja perdida quando o servidor usar essa nomenclatura.
 */
const EVENT_ALIAS: Record<string, string> = {
  MESSAGES_UPSERT: "Message",
  MESSAGES_SET: "Message",
  MESSAGES_HISTORY_SET: "HistorySync",
  MESSAGING_HISTORY_SET: "HistorySync",
  MESSAGES_UPDATE: "Receipt",
  MESSAGES_DELETE: "Message",
  MESSAGE_REVOKE: "Message",
  MESSAGE_REVOKED: "Message",
  SEND_MESSAGE: "SendMessage",
  SEND_MESSAGE_UPDATE: "SendMessage",
  MESSAGE_SENT: "SendMessage",
  CONNECTION_UPDATE: "Connected",
  STATUS_INSTANCE: "Connected",
  QRCODE_UPDATED: "QRCode",
};

/**
 * Nome do evento em qualquer nomenclatura ("messages.upsert", "MESSAGES_UPSERT",
 * "send.message") vira o nome único usado aqui. Sem isso, mensagens enviadas
 * pelo celular chegavam com um nome desconhecido e eram descartadas.
 */
function normalizeEventName(raw: string): string {
  const direto = EVENT_ALIAS[raw];
  if (direto) return direto;
  const chave = raw.trim().replace(/[.\-\s]+/g, "_").toUpperCase();
  return EVENT_ALIAS[chave] ?? raw;
}

/**
 * Envelope das Evolution API baseadas em Baileys:
 * { event, data: { key: { remoteJid, fromMe, id, participant }, message, pushName } }.
 * Convertido para o formato Info/Message já tratado aqui — é o caminho pelo qual
 * as mensagens enviadas pelo próprio celular chegam nessas versões.
 */
function fromBaileys(raw: Record<string, any>): EvolutionWebhook {
  const bruto = (raw["data"] ?? {}) as Record<string, any>;
  const alvo = (Array.isArray(bruto["messages"]) ? bruto["messages"][0] : bruto) as Record<
    string,
    any
  >;
  const key = (alvo["key"] ?? {}) as Record<string, any>;
  const chat = String(key["remoteJid"] ?? key["RemoteJid"] ?? "");
  const fromMe = key["fromMe"] === true || key["FromMe"] === true;
  const participant = String(key["participant"] ?? alvo["participant"] ?? "");
  const isGroup = chat.includes("@g.us");
  const info: Record<string, unknown> = {
    Chat: chat,
    Sender: (isGroup ? participant : chat) || chat,
    IsFromMe: fromMe,
    IsGroup: isGroup,
    ID: String(key["id"] ?? alvo["id"] ?? ""),
    PushName: alvo["pushName"] ?? alvo["PushName"] ?? bruto["pushName"] ?? null,
  };
  // Mensagem enviada pelo celular: o destino da conversa é o remoteJid.
  if (fromMe && !isGroup) info["RecipientAlt"] = chat;
  const mensagem = (alvo["message"] ?? alvo["Message"] ?? {}) as Record<string, unknown>;
  const midia = field<unknown>(alvo, "mediaUrl", "mediaURL", "file_url", "fileUrl", "base64");
  return {
    event: normalizeEventName(String(raw["event"] ?? "")),
    data: {
      Info: info,
      Message: {
        ...mensagem,
        ...(typeof midia === "string" && midia
          ? midia.startsWith("http")
            ? { mediaUrl: midia }
            : { base64: midia }
          : {}),
      },
    },
    ...(typeof raw["instanceId"] === "string" ? { instanceId: raw["instanceId"] } : {}),
    ...(typeof raw["instance"] === "string" && !raw["instanceId"]
      ? { instanceId: raw["instance"] }
      : {}),
  } as EvolutionWebhook;
}

/**
 * A WuzAPI usa outro envelope: { type, event: { Info, Message }, base64, s3 }.
 * Aqui ele vira o mesmo formato da Evolution Go, sem tocar no resto do fluxo.
 */
function fromWuzapi(raw: Record<string, any>): EvolutionWebhook {
  const type = String(raw["type"] ?? "");
  const inner = (raw["event"] ?? {}) as Record<string, any>;
  const data: Record<string, any> = { ...inner };

  // A WuzAPI manda um bloco "contact" com o telefone real da conversa. Sem ele,
  // chats no formato @lid (id interno, sem telefone) viravam números fantasmas
  // e a mensagem ficava perdida fora da conversa certa.
  const contact = (raw["contact"] ?? {}) as Record<string, any>;
  const jidLimpo = (valor: unknown) => (typeof valor === "string" && valor.includes("@") ? valor : "");
  const senderJid = jidLimpo(contact["sender_jid"]);
  const chatJid = jidLimpo(contact["chat_jid"]);
  const info = (inner["Info"] ?? undefined) as Record<string, any> | undefined;
  if (info && typeof info === "object") {
    const novoInfo: Record<string, any> = { ...info };
    const atual = (nome: string) => jidLimpo(novoInfo[nome]);
    const propria = novoInfo["IsFromMe"] === true;
    // Mensagem enviada pelo celular: sender_jid é o NOSSO número e não serve
    // para achar a conversa — quem manda na identificação é o chat_jid.
    if (senderJid && !propria && !atual("SenderAlt") && !atual("Sender").includes("@s.whatsapp.net")) {
      novoInfo["SenderAlt"] = senderJid;
    }
    if (chatJid && propria && !atual("RecipientAlt")) {
      novoInfo["RecipientAlt"] = chatJid;
    }
    // Chat individual entregue como @lid: usa o telefone informado no contato.
    if (chatJid && atual("Chat").includes("@lid") && !chatJid.includes("@lid")) {
      novoInfo["Chat"] = chatJid;
    }
    if (!novoInfo["PushName"] && typeof contact["display_name"] === "string") {
      novoInfo["PushName"] = contact["display_name"];
    }
    data["Info"] = novoInfo;
  }

  const message = inner["Message"] as Record<string, unknown> | undefined;
  if (message && typeof message === "object") {
    const base64 = field<unknown>(raw, "base64", "fileBase64", "data") ??
      field<unknown>(inner, "base64", "fileBase64", "data");
    const mimeType = field<unknown>(raw, "mimeType", "mimetype", "contentType") ??
      field<unknown>(inner, "mimeType", "mimetype", "contentType");
    const fileName = field<unknown>(raw, "fileName", "filename") ??
      field<unknown>(inner, "fileName", "filename");
    const url =
      (raw["s3"] as { url?: string } | undefined)?.url ??
      (inner["s3"] as { url?: string } | undefined)?.url ??
      field<unknown>(raw, "mediaUrl", "mediaURL", "file_url", "fileUrl") ??
      field<unknown>(inner, "mediaUrl", "mediaURL", "file_url", "fileUrl");
    data["Message"] = {
      ...message,
      ...(typeof base64 === "string" && base64 ? { base64 } : {}),
      ...(typeof mimeType === "string" && mimeType ? { mimetype: mimeType } : {}),
      ...(typeof fileName === "string" && fileName ? { fileName } : {}),
      ...(typeof url === "string" && url ? { mediaUrl: url } : {}),
    };
  }

  if (type === "QR" || type === "QRTimeout") {
    const codes = inner["codes"] as string[] | undefined;
    const qr = raw["qrCodeBase64"] ?? inner["QRCode"] ?? inner["qrcode"] ?? codes?.[0];
    if (typeof qr === "string" && qr) data["Qrcode"] = qr;
  }
  if (!data["jid"] && typeof inner["ID"] === "string") data["jid"] = inner["ID"];

  return {
    event: WUZAPI_EVENT[type] ?? type,
    data,
    ...(typeof raw["token"] === "string" ? { instanceId: raw["token"] } : {}),
  } as EvolutionWebhook;
}

/**
 * Lê o corpo do webhook. A Evolution Go envia JSON puro; a WuzAPI pode enviar
 * formulário com o campo jsonData ou JSON no formato dela.
 */
async function readWebhookBody(request: Request): Promise<EvolutionWebhook> {
  const contentType = request.headers.get("content-type") ?? "";
  let raw: Record<string, any>;
  if (/multipart\/form-data|application\/x-www-form-urlencoded/i.test(contentType)) {
    const form = await request.formData();
    const jsonData = form.get("jsonData");
    raw = JSON.parse(typeof jsonData === "string" ? jsonData : "{}");
    // Os campos de fora do formulário (token, arquivo, tipo) também importam:
    // sem eles a mídia da WuzAPI chegava sem endereço para download.
    for (const [chave, valor] of form.entries()) {
      if (chave === "jsonData" || typeof valor !== "string" || !valor) continue;
      if (raw[chave] === undefined) raw[chave] = valor;
    }
  } else {
    raw = (await request.json()) as Record<string, any>;
  }
  // A WuzAPI também envia JSON puro com o conteúdo dentro do texto "jsonData"
  // (token/file_url ficam de fora). Sem abrir esse texto, áudios e outras
  // mídias chegavam sem evento nenhum e eram descartados.
  if (raw && typeof raw["jsonData"] === "string" && raw["jsonData"]) {
    try {
      const interno = JSON.parse(raw["jsonData"]) as Record<string, any>;
      const externos = { ...raw };
      delete externos["jsonData"];
      for (const [chave, valor] of Object.entries(externos)) {
        if (interno[chave] === undefined) interno[chave] = valor;
      }
      raw = interno;
    } catch {
      /* texto ilegível: segue com o corpo original */
    }
  }
  // Envelope da WuzAPI: { type, event: { Info, Message }, contact, ... }.
  const pareceWuzapi =
    !!raw &&
    typeof raw["event"] === "object" &&
    raw["event"] !== null &&
    ("Info" in (raw["event"] as Record<string, unknown>) ||
      "Message" in (raw["event"] as Record<string, unknown>) ||
      "contact" in raw);
  if (raw && ((typeof raw["type"] === "string" && typeof raw["event"] !== "string") || pareceWuzapi)) {
    return fromWuzapi(raw);
  }
  // Envelope Baileys: { event, data: { key: { remoteJid, fromMe }, message } }.
  const dados = (raw?.["data"] ?? {}) as Record<string, any>;
  const primeira = Array.isArray(dados["messages"]) ? dados["messages"][0] : dados;
  const pareceBaileys =
    !!primeira &&
    typeof primeira === "object" &&
    !dados["Info"] &&
    !!(primeira as Record<string, any>)["key"];
  if (pareceBaileys) return fromBaileys(raw);
  return raw as EvolutionWebhook;
}

/**
 * Processamento do evento recebido. Exportado para que a IA Sentinela possa
 * reprocessar um evento guardado sem depender da rede.
 */
export async function processarWebhookEvolution(request: Request): Promise<Response> {
      {

        const token =
          new URL(request.url).searchParams.get("token") ?? request.headers.get("x-webhook-token");
        if (!token) return new Response("Unauthorized", { status: 401 });

        let payload: EvolutionWebhook;
        try {
          payload = await readWebhookBody(request);
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const eventoBruto = String(payload.event ?? "");
        const event = normalizeEventName(eventoBruto);
        const instanceRef = payload.instanceId ?? null;
        console.log(`[webhook] recebido evento=${event} instancia=${instanceRef ?? "-"}`);


        // O token da URL identifica o dispositivo desta central.
        const COLUNAS_CONFIG =
          "id, default_queue_id, status, last_event, phone, provider, instance_id, instance_name, base_url, project_id";
        const { data: byToken } = await supabaseAdmin
          .from("whatsapp_config")
          .select(COLUNAS_CONFIG)
          .eq("webhook_token", token)
          .maybeSingle();

        type ConfigWebhook = {
          id: string;
          default_queue_id: string | null;
          status: string | null;
          last_event: string | null;
          phone: string | null;
          provider: string | null;
          instance_id?: string | null;
          instance_name?: string | null;
        };
        let config = byToken as ConfigWebhook | null;

        if (!config) {
          // Token antigo (aparelho recriado ou webhook desatualizado no servidor).
          // Nenhuma mensagem pode ser perdida: identificamos o aparelho pelos
          // dados do próprio evento antes de recusar.
          const { data: todos } = await supabaseAdmin
            .from("whatsapp_config")
            .select(COLUNAS_CONFIG);
          const lista = (todos ?? []) as unknown as ConfigWebhook[];
          const nomeInstancia = (payload.instanceName ?? "").trim().toLowerCase();
          // A Evolution Go sempre envia instanceId/instanceName; a WuzAPI não.
          const provedorProvavel = payload.instanceId || payload.instanceName ? "evolution" : "wuzapi";
          const doProvedor = lista.filter(
            (item) => (item.provider ?? "evolution") === provedorProvavel,
          );

          config =
            (instanceRef
              ? lista.find((item) => String(item.instance_id ?? "") === String(instanceRef))
              : null) ??
            (nomeInstancia
              ? doProvedor.find(
                  (item) => (item.instance_name ?? "").trim().toLowerCase() === nomeInstancia,
                )
              : null) ??
            (doProvedor.length === 1 ? doProvedor[0] : null) ??
            (lista.length === 1 ? lista[0] : null) ??
            null;

          if (!config) return Response.json({ received: true, ignored: "aparelho-desconhecido" });
          console.warn(
            `[webhook] token desatualizado; evento atribuído ao aparelho ${config.id} (${config.provider ?? "evolution"}) por ${instanceRef ? "instanceId" : nomeInstancia ? "instanceName" : "provedor"}`,
          );
        }


        const now = new Date().toISOString();
        const wasConnected = config.status === "connected";
        const touch = (patch: Record<string, unknown>) =>
          supabaseAdmin
            .from("whatsapp_config")
            .update({ last_event: event, updated_at: now, ...patch })
            .eq("id", config!.id);

        switch (event) {
          case "QRCode": {
            const qr = payload.data?.Qrcode ?? payload.data?.qrcode ?? null;
            await touch({ status: "connecting", ...(qr ? { last_qr: qr } : {}) });
            // QR na tela: garante que os eventos desta central já estão firmados.
            void (await import("@/lib/evolution.server")).ensureEvolutionWebhook(config.id, {
              requestUrl: request.url,
            });
            return Response.json({ received: true });
          }
          case "PairSuccess": {
            const jid = payload.data?.jid ?? "";
            await touch({
              status: "connected",
              last_qr: null,
              ...(jid ? { phone: jidToPhone(jid) } : {}),
            });
            // Número pareado: reconfigura o webhook com todos os eventos.
            await (await import("@/lib/evolution.server")).ensureEvolutionWebhook(config.id, {
              requestUrl: request.url,
              force: true,
            });
            try {
              const { validarConexaoAposParear } = await import("@/lib/connection-test.server");
              await validarConexaoAposParear(config.id);
            } catch {
              /* o teste é apenas uma verificação extra */
            }
            return Response.json({ received: true });
          }
          case "Connected": {
            // O processo da instância reconectou ao servidor. Se o número já
            // estava pareado, isso NÃO significa perder a sessão do WhatsApp.
            // Na WuzAPI este evento também chega apenas ao abrir a sessão para
            // gerar o QR; somente PairSuccess ou LoggedIn confirma pareamento.
            await touch(
              config.provider === "wuzapi"
                ? { status: "connecting" }
                : wasConnected
                  ? { status: "connected", last_qr: null }
                  : { status: "connecting" },
            );
            await (await import("@/lib/evolution.server")).ensureEvolutionWebhook(config.id, {
              requestUrl: request.url,
            });
            return Response.json({ received: true });
          }
          case "LoggedOut": {
            // Saída real da sessão: o número precisa parear de novo.
            await touch({ status: "disconnected", last_qr: null });
            const { limparTesteConexao } = await import("@/lib/connection-test.server");
            await limparTesteConexao(config.id);
            return Response.json({ received: true });
          }
          case "Disconnected": {
            // Quedas momentâneas de rede da Evolution Go disparam Disconnected
            // seguido de reconexão. Só derrubamos na segunda ocorrência seguida.
            if (wasConnected && config.last_event !== "Disconnected") {
              await touch({ status: "connected" });
            } else {
              await touch({ status: "disconnected", last_qr: null });
            }
            return Response.json({ received: true });
          }
          case "OfflineSyncCompleted": {
            await touch({ status: "connected", last_qr: null });
            return Response.json({ received: true });
          }
          case "HistorySync": {
            // O WhatsApp envia o histórico do celular logo após o pareamento:
            // conversas normais e grupos entram na central com a data original.
            await touch({ status: "connected", last_qr: null });
            try {
              const { importarHistorySync } = await import("@/lib/historico.server");
              const resumo = await importarHistorySync(payload.data, config.id);
              console.log(
                `[webhook] HistorySync device=${config.id} conversas=${resumo.conversas} mensagens=${resumo.mensagens}`,
              );
            } catch (error) {
              console.error("[webhook] falha ao importar histórico", error);
            }
            return Response.json({ received: true });
          }
          // Mensagens enviadas pelo próprio celular chegam como SendMessage em
          // algumas versões da Evolution Go: são sincronizadas na conversa.
          case "Message":
          case "SendMessage":
            break;
          default:
            // Receipt, Presence, Call*, Group*, Newsletter*, Label*
            return Response.json({ received: true });
        }

        const info = payload.data?.Info;
        const message = payload.data?.Message;
        if (!info) return Response.json({ received: true });
        // Mensagens enviadas pela própria conta conectada NÃO disparam chatbot,
        // IA ou respostas (proteção total contra loop), mas são sempre gravadas
        // no histórico da conversa. Única exceção de comando: texto curto e
        // exato do administrador no "chat consigo mesmo".
        // Mensagem apagada ("apagar para todos"): marca a original como
        // apagada, tanto quando o contato apaga como quando você apaga no
        // celular. Nunca dispara chatbot, IA ou resposta automática.
        const revokedId = extractRevoke(message as Record<string, unknown> | undefined);
        if (revokedId) {
          const { data: alvoApagado } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("external_id", revokedId)
            .limit(1)
            .maybeSingle();
          if (alvoApagado) {
            await supabaseAdmin
              .from("messages")
              .update({ deleted_at: new Date().toISOString() })
              .eq("id", alvoApagado.id);
            return Response.json({ received: true, deleted: true });
          }
          return Response.json({ received: true, ignored: "revoke-sem-original" });
        }

        const fromMe = !!info.IsFromMe || event === "SendMessage";
        if (fromMe) {
          const textoProprio = extractText(message).trim();
          const { ehComandoEstrito, ehEcoAutomatico, ehAdminRemoto, processarComandoAdmin } =
            await import("@/lib/remote-admin.server");
          const chatProprio = String(info.Chat ?? info.Sender ?? "");
          const grupoProprio = !!info.IsGroup || chatProprio.includes("@g.us");
          const recordFromMe = info as Record<string, unknown>;
          const candidatosProprios = [
            chatProprio,
            String(info.SenderAlt ?? ""),
            String(recordFromMe["RecipientAlt"] ?? recordFromMe["ReceiverAlt"] ?? ""),
            String(info.Sender ?? ""),
          ]
            .filter((jid) => jid && !jid.includes("@lid"))
            .map(jidToPhone)
            .filter(Boolean);
          let adminProprio = "";
          if (
            !grupoProprio &&
            textoProprio &&
            !ehEcoAutomatico(textoProprio) &&
            ehComandoEstrito(textoProprio)
          ) {
            for (const cand of candidatosProprios) {
              if (await ehAdminRemoto(cand)) {
                adminProprio = cand;
                break;
              }
            }
          }
          if (adminProprio) {
            console.log(
              `[webhook] comando do proprio aparelho aceito: de=${adminProprio} texto=${textoProprio.slice(0, 30)}`,
            );
            let tratado = false;
            try {
              tratado = await processarComandoAdmin({
                phoneDigits: adminProprio,
                body: textoProprio,
                configId: config.id,
                requestUrl: request.url,
                fromMe: true,
              });
            } catch (error) {
              console.error("[webhook] falha no comando admin:", (error as Error).message);
            }
            return Response.json({ received: true, admin: true, tratado });
          }
          console.log(
            `[webhook] fromMe registrado no historico: evento=${event} device=${config.id} id=${info.ID ?? "-"} len=${textoProprio.length}`,
          );
        }

        // Chegou mensagem externa: a sessão está viva. Desfaz qualquer queda falsa.
        if (!wasConnected) {
          await supabaseAdmin
            .from("whatsapp_config")
            .update({ status: "connected", last_qr: null, updated_at: now })
            .eq("id", config.id);
        }

        const chatRaw = String(info.Chat ?? info.Sender ?? "");
        const isGroup = !!info.IsGroup || chatRaw.includes("@g.us");

        // Stories (status@broadcast) e canais (@newsletter) não são conversas de
        // atendimento: ficam guardados à parte para visualização na tela
        // "Stories e canais".
        if (/@(broadcast|newsletter)$/i.test(chatRaw.trim())) {
          const ehCanal = /@newsletter$/i.test(chatRaw.trim());
          const envelopeMidia = unwrapMessage(message);
          const urlMidia = [message, envelopeMidia].reduce<string>((achado, alvo) => {
            if (achado || !alvo) return achado;
            const valor = field<unknown>(alvo, "mediaUrl", "mediaURL", "url", "URL", "file_url");
            return typeof valor === "string" && valor ? valor : "";
          }, "");
          const chaves = Object.keys((envelopeMidia ?? message ?? {}) as Record<string, unknown>).join(" ");
          const tipoMidia = /video/i.test(chaves)
            ? "video"
            : /image/i.test(chaves)
              ? "imagem"
              : /audio|ptt/i.test(chaves)
                ? "audio"
                : "nenhum";
          try {
            await supabaseAdmin.from("stories_recebidos").insert({
                project_id: (config as { project_id?: string | null }).project_id ?? null,
                config_id: config.id,
                tipo: ehCanal ? "canal" : "status",
                chat_jid: chatRaw.trim(),
                autor_jid: String(info.Participant ?? info.SenderAlt ?? info.Sender ?? ""),
                autor_nome: String(info.PushName ?? ""),
                texto: extractText(message).slice(0, 4000),
                midia_url: urlMidia,
                midia_tipo: tipoMidia,
              wa_id: String(info.ID ?? ""),
            });
          } catch (erro) {
            console.warn("[webhook] falha ao guardar story", erro);
          }
          return Response.json({ received: true, stored: ehCanal ? "canal" : "status" });
        }

        // Conversa individual: o WhatsApp novo entrega o chat como @lid (um id
        // interno, sem telefone). O número real pode vir em SenderAlt,
        // RecipientAlt (respostas feitas no celular) ou Sender.
        const record0 = info as Record<string, unknown>;
        const recipientAlt = String(record0["RecipientAlt"] ?? record0["ReceiverAlt"] ?? "");
        const isBrPhone = (d: string) => /^55\d{10,11}$/.test(d);
        // Quando a mensagem é nossa (respondida no celular), o campo Sender é o
        // nosso próprio número — nunca serve para identificar a conversa.
        // Mensagem enviada pelo celular: o outro lado está no chat/RecipientAlt.
        // Sender e SenderAlt são o nosso próprio número nesses eventos.
        const rawCandidates = fromMe
          ? [recipientAlt, chatRaw]
          : [chatRaw, String(info.SenderAlt ?? ""), recipientAlt, String(info.Sender ?? "")];
        const directCandidates = rawCandidates
          .filter((jid) => jid && !jid.includes("@lid"))
          .map(jidToPhone);
        // Guarda o id interno (@lid) do outro lado da conversa para reconhecer
        // a mesma pessoa quando o celular não manda o telefone.
        const lidJid =
          [chatRaw, String(info.SenderAlt ?? ""), recipientAlt, String(info.Sender ?? "")].find(
            (jid) => jid.includes("@lid"),
          ) ?? "";
        let phoneDigits = isGroup
          ? jidToPhone(chatRaw)
          : (directCandidates.find(isBrPhone) ?? directCandidates.find(Boolean) ?? "");

        // Sem telefone no evento: procura o contato já conhecido por esse @lid.
        if (!phoneDigits && !isGroup && lidJid) {
          const { data: byLid } = await supabaseAdmin
            .from("contacts")
            .select("phone")
            .eq("lid", lidJid)
            .maybeSingle();
          phoneDigits = ((byLid as { phone?: string } | null)?.phone ?? "").trim();
        }

        // Alguns eventos novos chegam apenas com @lid, sem SenderAlt. O LID é
        // estável e permite preservar a conversa até o número real aparecer.
        if (!phoneDigits && !isGroup && lidJid) phoneDigits = jidToPhone(lidJid);

        console.log(
          `[webhook] ${event} device=${config.id} grupo=${isGroup} fromMe=${fromMe} chat=${chatRaw} sender=${info.Sender ?? ""} senderAlt=${info.SenderAlt ?? ""} recipientAlt=${recipientAlt} lid=${lidJid} telefone=${phoneDigits}`,
        );

        if (!phoneDigits) {
          console.warn("[webhook] descartada: sem telefone identificável", chatRaw);
          return Response.json({ received: true, ignored: "sem-telefone" });
        }

        const memorizarLid = async () => {
          // Memoriza o @lid no contato para os próximos eventos do celular.
          if (isGroup || !lidJid) return;
          await supabaseAdmin
            .from("contacts")
            .update({ lid: lidJid })
            .eq("phone", phoneDigits)
            .is("lid", null);
        };

        // Configuração da central: ignorar mensagens de grupos.
        if (isGroup) {
          const { shouldIgnoreGroups } = await import("@/lib/inbound.server");
          if (await shouldIgnoreGroups()) {
            return Response.json({ received: true, ignored: "groups-disabled" });
          }
        }

        // Grupos: o número de quem escreveu vem do remetente, nunca do ID do grupo.
        const participantRaw = String(info.Participant ?? info.Sender ?? info.SenderAlt ?? "");
        const participantDigits = participantRaw.includes("@lid")
          ? jidToPhone(String(info.SenderAlt ?? ""))
          : jidToPhone(participantRaw);
        const participantPhone =
          isGroup &&
          participantDigits &&
          participantDigits !== phoneDigits &&
          participantDigits.length <= 13
            ? participantDigits
            : null;

        const record = info as Record<string, unknown>;
        const groupJid = isGroup ? `${phoneDigits}@g.us` : null;
        if (isGroup && !jidToPhone(chatRaw)) {
          console.warn("[webhook] grupo recebido sem identificador válido", chatRaw);
          return Response.json({ received: true, ignored: "group-no-id" });
        }
        // Só aceita o assunto exato do grupo. Identificadores como
        // "120363294220420735" são descartados: o nome real é buscado na
        // Evolution Go (/group/list e /group/info) ao gravar o contato.
        const groupName = isGroup
          ? (exactGroupName(record["GroupName"]) ??
            exactGroupName(record["GroupSubject"]) ??
            exactGroupName(record["ChatName"]))
          : null;

        // Suporta tanto versões que entregam o texto em editedMessage quanto a
        // 0.7, que marca Info.Edit="1" e referencia o ID original no envelope.
        const edit = extractEdit(message);
        const encryptedTargetId = encryptedEditTarget(message);
        const editCode = String(info.Edit ?? "").trim();
        const isEditEvent = payload.data?.IsEdit === true || editCode === "1";
        const editedText = edit?.text ?? (isEditEvent ? extractText(message) : "");
        const editedTargetId =
          edit?.targetId ??
          editTargetFromInfo(info) ??
          encryptedTargetId ??
          (payload.data?.IsEdit === true ? (info.ID ?? null) : null);
        if (editedTargetId && editedText && !isUnsupportedText(editedText)) {
          const { data: original } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("external_id", editedTargetId)
            .limit(1)
            .maybeSingle();
          if (original) {
            await supabaseAdmin
              .from("messages")
              .update({ body: editedText, edited_at: new Date().toISOString() })
              .eq("id", original.id);
            return Response.json({ received: true, edited: true });
          }
        }

        // A versão 0.7 da Evolution Go não descriptografa o novo texto da
        // edição. Não grava o envelope como uma mensagem nova nem substitui a
        // original por um aviso incorreto; versões corrigidas passam acima.
        if (isEditEvent || encryptedTargetId) {
          console.warn("[evolution] edição recebida sem texto descriptografado", {
            targetId: editedTargetId,
            eventId: info.ID ?? null,
          });
          return Response.json({ received: true, ignored: "encrypted-edit" });
        }

        let body = edit ? edit.text : extractText(message);

        // Voto em enquete: vira o texto da opção escolhida para acionar o menu.
        if (body === "[voto em enquete]" || body === "[mensagem não suportada]") {
          const voted = await resolvePollVote(message);
          if (voted) body = voted;
          else {
            console.log(
              "[evolution] mensagem não reconhecida:",
              JSON.stringify(message ?? {}).slice(0, 3000),
            );
          }
        }

        // Mídia recebida: a Evolution Go manda base64 (WEBHOOK_FILES=true) ou
        // uma URL aberta. A WuzAPI só manda o arquivo criptografado (.enc), que
        // precisa ser baixado pelo servidor da própria conexão.
        // A mídia pode vir embrulhada (mensagem temporária, visualização única,
        // documento com legenda): aqui o envelope é aberto antes de procurar.
        const conteudoMidia = unwrapMessage(message);
        const eventoBase64 = [message, conteudoMidia].reduce<string | null>((achado, alvo) => {
          if (achado || !alvo) return achado;
          const valor = field<unknown>(alvo, "base64", "fileBase64", "data");
          return typeof valor === "string" && valor ? valor : null;
        }, null);
        const mediaUrlBruta = [message, conteudoMidia].reduce<string | null>((achado, alvo) => {
          if (achado || !alvo) return achado;
          const valor = field<unknown>(alvo, "mediaUrl", "mediaURL", "url", "URL");
          return typeof valor === "string" && valor ? valor : null;
        }, null);
        // A WuzAPI informa o arquivo com o endereço interno dela (localhost).
        // Troca pelo endereço público da conexão para o download funcionar.
        const mediaUrl = (() => {
          if (!mediaUrlBruta) return null;
          try {
            const alvo = new URL(mediaUrlBruta);
            if (!/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(alvo.hostname)) return mediaUrlBruta;
            const base = String((config as { base_url?: string }).base_url ?? "");
            if (!base) return mediaUrlBruta;
            const publico = new URL(base);
            alvo.protocol = publico.protocol;
            alvo.host = publico.host;
            return alvo.toString();
          } catch {
            return mediaUrlBruta;
          }
        })();

        // URLs S3/MinIO da WuzAPI já apontam para o arquivo descriptografado.
        // Somente referências do WhatsApp precisam passar por /chat/download*.
        const isEncryptedMediaUrl = (value: string | null) =>
          !!value && (/\.enc(?:\?|$)/i.test(value) || /(?:^|\.)mmg\.whatsapp\.net/i.test(value));
        const obterBase64 = async (
          kind: "image" | "sticker" | "video" | "audio" | "document",
          media: Record<string, unknown> | undefined,
        ): Promise<string | null> => {
          if (eventoBase64) return eventoBase64;
          // A WuzAPI avisa um endereço interno do arquivo (/files/...), que não
          // pode ser baixado de fora. Quando a própria mídia traz a referência do
          // WhatsApp com a chave, o download tem de passar pelo conector — senão
          // áudios e vídeos chegavam como "arquivo indisponível".
          const urlDaMidia = media ? textField(media, "url", "URL", "mediaUrl", "mediaURL") : "";
          const temChave = !!media && !!textField(media, "mediaKey", "media_key");
          const precisaConector = temChave && isEncryptedMediaUrl(urlDaMidia || null);
          if (!precisaConector && mediaUrl && !isEncryptedMediaUrl(mediaUrl)) return null;
          const { downloadInboundMedia } = await import("@/lib/evolution.server");
          // Alguns webhooks colocam a URL criptografada no envelope da mensagem,
          // separada da mediaKey que fica dentro de imageMessage/videoMessage.
          // Reunimos os dois campos antes de pedir a descriptografia ao conector.
          const mediaParaDownload = mediaUrl && media && !textField(media, "url", "URL", "mediaUrl", "mediaURL")
            ? { ...media, url: mediaUrl }
            : media;
          const baixado = await downloadInboundMedia({
            configId: config!.id,
            kind,
            media: mediaParaDownload,
          });
          if (!baixado) {
            console.warn(`[evolution] não consegui baixar a mídia (${kind})`);
          }
          return baixado?.base64 ?? null;
        };
        const midia = <T>(nome: string) =>
          (conteudoMidia ? field<T>(conteudoMidia, nome) : undefined) ?? undefined;

        // Áudio: guarda o arquivo para ouvir na central e tenta transcrever.
        const audio = midia<Record<string, unknown>>("audioMessage");
        if (audio) {
          const base64 = await obterBase64("audio", audio);
          const { storeInboundAudio, audioMessageBody } = await import("@/lib/audio.server");
          const stored = await storeInboundAudio({
            phoneDigits,
            mimeType: textField(audio, "mimetype", "mimeType", "contentType") || null,
            base64,
            url: mediaUrl ?? textField(audio, "url", "URL") ?? null,
          });
          body = stored ? audioMessageBody(stored) : failedMediaBody("audio");
        }

        // Figurinhas e imagens: guarda o arquivo para aparecer na conversa.
        const sticker = midia<Record<string, unknown>>("stickerMessage");
        const image = midia<Record<string, unknown>>("imageMessage");
        const visual = sticker ?? image;
        if (visual) {
          const base64 = await obterBase64(
            sticker ? "sticker" : "image",
            visual,
          );
          const { storeInboundImage, stickerMessageBody, imageMessageBody } = await import(
            "@/lib/media.server"
          );
          const storedUrl = await storeInboundImage({
            phoneDigits,
            mimeType: textField(visual, "mimetype", "mimeType", "contentType") || (sticker ? "image/webp" : "image/jpeg"),
            base64,
            url: mediaUrl ?? textField(visual, "url", "URL") ?? null,
            folder: sticker ? "figurinhas" : "imagens",
          });
          if (storedUrl) {
            body = sticker
              ? stickerMessageBody(storedUrl)
              : imageMessageBody(storedUrl, textField(image, "caption") || null);
          } else body = failedMediaBody(sticker ? "sticker" : "image");
        }



        // Vídeos: guarda o arquivo para assistir direto na conversa.
        const video = midia<Record<string, unknown>>("videoMessage");
        if (video) {
          const base64 = await obterBase64("video", video);
          const { storeInboundVideo, videoMessageBody } = await import("@/lib/media.server");
          const storedUrl = await storeInboundVideo({
            phoneDigits,
            mimeType: textField(video, "mimetype", "mimeType", "contentType") || "video/mp4",
            base64,
            url: mediaUrl ?? textField(video, "url", "URL") ?? null,
          });
          body = storedUrl
            ? videoMessageBody(storedUrl, textField(video, "caption") || null)
            : failedMediaBody("video");
        }

        // Documentos e PDFs: guarda o arquivo e mostra um cartão para abrir ou baixar.
        const document = midia<{
          url?: string;
          mimetype?: string;
          fileName?: string;
          caption?: string;
        }>("documentMessage");

        if (document) {
          const base64 = await obterBase64("document", document as Record<string, unknown>);
          const { storeInboundDocument, documentMessageBody } = await import("@/lib/media.server");
          const storedDocument = await storeInboundDocument({
            phoneDigits,
            fileName: document.fileName ?? null,
            mimeType: document.mimetype ?? null,
            base64,
            url: mediaUrl ?? document.url ?? null,
          });
          if (storedDocument) {
            body = documentMessageBody(
              storedDocument.name,
              storedDocument.url,
              document.caption ?? null,
            );
          } else body = failedMediaBody("document");
        }

        // Nada legível no evento: registra o motivo para rastreio e encerra.
        if (!body || isUnsupportedText(body)) {
          console.warn(
            `[webhook] conteudo nao legivel: evento=${event} device=${config.id} id=${info.ID ?? "-"} telefone=${phoneDigits}`,
          );
          return Response.json({ received: true, ignored: "unsupported" });
        }

        // Controle remoto: só mensagens externas do número autorizado disparam
        // o menu. Mensagens do próprio aparelho nunca viram comando aqui.
        const {
          processarComandoAdmin,
          sistemaAtivo,
          ehAdminRemoto,
          ehEcoAutomatico,
        } = await import("@/lib/remote-admin.server");
        // Eco de resposta automática: segue como mensagem nossa, nunca como comando.
        const ecoAutomatico = ehEcoAutomatico(body);
        if (ecoAutomatico) {
          console.log(`[webhook] eco automatico (nao vira comando): ${body.slice(0, 40)}`);
        }
        const adminCandidates = [
          phoneDigits,
          jidToPhone(String(info.Sender ?? "")),
          jidToPhone(String(info.SenderAlt ?? "")),
          jidToPhone(recipientAlt),
          jidToPhone(chatRaw),
        ].filter(Boolean);
        let comandoPhone = "";
        if (!fromMe) {
          for (const cand of adminCandidates) {
            try {
              if (await ehAdminRemoto(cand)) {
                comandoPhone = cand;
                break;
              }
            } catch (error) {
              console.error("[webhook] falha ao checar admin:", (error as Error).message);
            }
          }
        }
        if (!isGroup && comandoPhone && !ecoAutomatico) {
          console.log(
            `[webhook] comando admin de=${comandoPhone} fromMe=${fromMe} texto=${body.slice(0, 60)}`,
          );
          try {
            const tratado = await processarComandoAdmin({
              phoneDigits: comandoPhone,
              body,
              configId: config.id,
              requestUrl: request.url,
            });
            if (tratado) return Response.json({ received: true, admin: true });
          } catch (error) {
            // Uma falha do controle remoto nunca impede o registro da mensagem.
            console.error("[webhook] falha no comando admin:", (error as Error).message);
          }
        } else if (!isGroup && comandoPhone) {
          console.log(
            `[webhook] mensagem do admin ignorada como comando (eco=${ecoAutomatico} fromMe=${fromMe} len=${body.length})`,
          );
        } else if (!isGroup) {
          console.log(
            `[webhook] mensagem comum (nao-admin): telefone=${phoneDigits} fromMe=${fromMe}`,
          );
        }

        // Sistema desligado ou em manutenção: a mensagem continua sendo gravada
        // no histórico (perda zero), apenas sem saudação, chatbot ou IA.
        let ativo = true;
        try {
          ativo = await sistemaAtivo();
        } catch (error) {
          console.error("[webhook] falha ao ler estado do sistema:", (error as Error).message);
        }
        // Mensagens do próprio aparelho e mensagens com o sistema pausado entram
        // apenas no histórico, sem automações.
        const semAutomacoes = fromMe || !ativo;

        // Fluxo único de entrada: contato, conversa, saudação, chatbot e IA.
        const { recordInboundMessage } = await import("@/lib/inbound.server");
        const { withRetry } = await import("@/lib/retry.server");
        try {
          // Regra: nenhuma mensagem recebida se perde por falha passageira —
          // tenta novamente e, se ainda falhar, devolve erro para o provedor
          // reenviar o evento (a duplicidade é barrada pelo identificador).
          await withRetry("registrar mensagem recebida", () =>
            recordInboundMessage({
              phoneDigits,
              name: isGroup ? groupName : fromMe ? null : (info.PushName ?? null),
              body,
              externalId: info.ID ?? null,
              configId: config.id,
              isGroup,
              chatJid: groupJid,
              participantName: isGroup && !fromMe ? (info.PushName ?? null) : null,
              participantPhone: isGroup && !fromMe ? participantPhone : null,
              fromMe,
              skipAutomations: semAutomacoes,
              mentionsMe:
                isGroup && !fromMe
                  ? mentionsOwnNumber(message, body, (config as { phone?: string }).phone ?? "")
                  : false,
            }),
          );
        } catch (error) {
          console.error("[evolution] falha ao registrar mensagem:", (error as Error).message);
          try {
            const { registrarOcorrencia } = await import("@/lib/monitor.server");
            await registrarOcorrencia({
              tipo: "Mensagem perdida",
              mensagem: `Uma mensagem recebida não pôde ser registrada: ${(error as Error).message}`,
              severidade: "erro",
              deviceId: config.id,
              deviceLabel: (config as { label?: string }).label ?? "",
              provider: (config as { provider?: string }).provider ?? "",
            });
          } catch {
            /* o aviso é complementar */
          }
          return new Response((error as Error).message, { status: 500 });
        }

        await memorizarLid().catch(() => undefined);

        return Response.json({ received: true });
      }
}

export const Route = createFileRoute("/api/public/evolution")({
  server: {
    handlers: {
      // A IA Sentinela protege a rota, guarda o evento e só então processa.
      POST: async ({ request }) => {
        const { guardarWebhook } = await import("@/lib/sentinela.server");
        return guardarWebhook(request, processarWebhookEvolution);
      },
    },
  },
});

