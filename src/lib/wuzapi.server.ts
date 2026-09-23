// Cliente HTTP da WuzAPI (https://github.com/asternic/wuzapi) — segue a
// especificação oficial publicada em /api (static/api/spec.yml).
//
// Autenticação:
//   Header token          = token do usuário (uma conexão de WhatsApp)
//   Header Authorization  = token de administrador (rotas /admin/*)
//
// Este módulo traduz as chamadas usadas pela central (que nasceram no formato
// da Evolution Go) para os caminhos e corpos da WuzAPI, devolvendo sempre o
// envelope { data: ... } que o restante do sistema já entende.
// Uso exclusivo no servidor.

export const WUZAPI_DEFAULT_BASE_URL = "https://api.wuzapi.com";

type Method = "GET" | "POST" | "PUT" | "DELETE";

export type WuzapiCall = {
  baseUrl: string;
  path: string;
  method?: Method;
  body?: unknown;
  timeoutMs?: number;
  /** Token do usuário (conexão). */
  token: string;
  /** Token de administrador do servidor WuzAPI. */
  adminToken: string;
};

function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "").trim().replace(/\/+$/, "") || WUZAPI_DEFAULT_BASE_URL;
}

function digits(value: string) {
  return (value || "").replace(/\D/g, "");
}

/** Número no formato aceito pela WuzAPI: só dígitos, ou o JID do grupo. */
function toPhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@g.us")) return raw;
  // Status/Stories e canais usam JID especial e não podem virar dígitos.
  if (/@(broadcast|newsletter)$/i.test(raw)) return raw;
  if (raw.includes("@")) return digits(raw.split("@")[0] ?? "");
  return digits(raw);
}

function describeWuzapiError(status: number, payload: unknown): string {
  const raw = payload as { error?: string; message?: string; data?: unknown } | string | null;
  const message =
    (typeof raw === "object" && raw
      ? (raw.error ?? raw.message ?? (typeof raw.data === "string" ? raw.data : undefined))
      : typeof raw === "string"
        ? raw
        : undefined) ?? `Falha na WuzAPI (HTTP ${status}).`;

  if (/no session|not logged|not connected|client is nil|logged\s*out/i.test(message)) {
    return "O WhatsApp deste dispositivo não está pareado. Abra Administração → Dispositivos e leia o QR Code para voltar a enviar mensagens.";
  }
  if (/not on whatsapp|invalid.*(number|jid)|no users/i.test(message)) {
    return "Esse número não tem WhatsApp ativo. Confira o DDD e os dígitos e tente novamente.";
  }
  if (status === 429) {
    return "O servidor do WhatsApp recebeu pedidos demais e pediu uma pausa. Aguarde alguns segundos e tente novamente.";
  }
  if (status === 401 || status === 403) {
    return "A WuzAPI recusou as credenciais. Revise o token de administrador em Administração → API de conexão e o token da conexão.";
  }
  if (status === 404) {
    return "A WuzAPI não encontrou essa conexão. Confira o endereço do servidor e o token da conexão.";
  }
  return message;
}

function isMissingSessionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no session|not connected|client is nil|não está pareado|nao esta pareado/i.test(message);
}

/** Requisição bruta a um endpoint da WuzAPI; devolve o campo data do envelope. */
async function call<T = unknown>(
  options: WuzapiCall & { admin?: boolean },
): Promise<T> {
  const base = normalizeBaseUrl(options.baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.admin) {
    if (!options.adminToken)
      throw new Error(
        "Falta cadastrar o token de administrador da WuzAPI em Administração → API de conexão.",
      );
    headers["Authorization"] = options.adminToken;
  } else {
    if (!options.token)
      throw new Error(
        "Esta conexão ainda não tem o token da WuzAPI. Abra Administração → Dispositivos e conecte novamente.",
      );
    headers["token"] = options.token;
  }

  const init: RequestInit = { method: options.method ?? "GET", headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  // A WuzAPI pode responder 429/5xx ou cair momentaneamente: tentamos algumas
  // vezes antes de considerar a conexão perdida.
  let response!: Response;
  let text = "";
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      response = await fetch(`${base}${options.path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1200));
        continue;
      }
      if ((error as Error).name === "AbortError")
        throw new Error("O servidor WuzAPI não respondeu no tempo esperado. Tente novamente.");
      throw new Error(
        "Não foi possível falar com o servidor WuzAPI. Confira o endereço em Administração → API de conexão.",
      );
    } finally {
      clearTimeout(timer);
    }

    text = await response.text();
    if (
      (response.status === 429 || response.status === 502 || response.status === 503 ||
        response.status === 504) &&
      attempt < maxAttempts
    ) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
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

  const envelope = payload as { success?: boolean; data?: unknown; error?: string } | null;
  if (!response.ok || envelope?.success === false) {
    throw new Error(describeWuzapiError(response.status, payload));
  }
  return (envelope && typeof envelope === "object" && "data" in envelope
    ? envelope.data
    : payload) as T;
}

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/** A WuzAPI só aceita mídia em base64 (data URI); baixamos o arquivo antes de enviar. */
async function toDataUri(url: string, fallbackMime: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível baixar o arquivo para enviar no WhatsApp.");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_MEDIA_BYTES)
    throw new Error("Arquivo grande demais para enviar pelo WhatsApp (limite de 25 MB).");
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
  return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
}

/**
 * A WuzAPI valida literalmente o prefixo do áudio antes de decodificar o
 * conteúdo. Recriamos a URI em vez de apenas reaproveitar o MIME do navegador
 * (Chrome normalmente grava Opus dentro de WebM).
 */
async function toWuzapiAudioDataUri(url: string): Promise<string> {
  const source = await toDataUri(url, "audio/ogg");
  const separator = source.indexOf(",");
  if (separator < 0) throw new Error("O arquivo de áudio não pôde ser preparado para envio.");
  const base64 = source.slice(separator + 1).replace(/\s/g, "");
  if (!base64) throw new Error("O arquivo de áudio está vazio.");
  return `data:audio/ogg;base64,${base64}`;
}

function sentEnvelope(data: unknown) {
  const record = (data ?? {}) as Record<string, unknown>;
  const id = record["Id"] ?? record["ID"] ?? record["id"] ?? null;
  return { data: { ...record, Info: { ID: id } } };
}

function vcard(name: string, phone: string) {
  return `BEGIN:VCARD\nVERSION:3.0\nN:;${name};;;\nFN:${name}\nTEL;type=CELL;waid=${digits(phone)}:+${digits(phone)}\nEND:VCARD`;
}

const BUTTON_TYPE: Record<string, string> = {
  reply: "reply",
  url: "cta_url",
  call: "cta_call",
  copy: "copy",
  pix: "copy",
};

/**
 * Executa uma chamada da central (no formato da Evolution Go) usando a WuzAPI.
 * Devolve sempre { data: ... } para manter o restante do sistema inalterado.
 */
/** Normaliza o QR devolvido pela WuzAPI (string crua ou imagem base64). */
function normalizeWuzapiQr(data: Record<string, unknown> | null | undefined): string | null {
  const value =
    data?.["QRCode"] ?? data?.["qrcode"] ?? data?.["QrCode"] ?? data?.["Qrcode"] ?? null;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

export async function wuzapiDispatch(options: WuzapiCall): Promise<unknown> {
  const { path } = options;
  const body = (options.body ?? {}) as Record<string, any>;
  const run = <T = unknown>(
    innerPath: string,
    method: Method,
    innerBody?: unknown,
    admin = false,
  ) =>
    call<T>({
      baseUrl: options.baseUrl,
      token: options.token,
      adminToken: options.adminToken,
      timeoutMs: options.timeoutMs ?? 20_000,
      path: innerPath,
      method,
      ...(innerBody === undefined ? {} : { body: innerBody }),
      admin,
    });

  switch (path) {
    // ----------------------------------------------------------------- sessão
    case "/instance/create": {
      const token = String(body["token"] ?? crypto.randomUUID());
      const data = await run<Record<string, unknown>>(
        "/admin/users",
        "POST",
        { name: String(body["name"] ?? "central"), token, events: "All" },
        true,
      );
      let id = data?.["id"] ?? data?.["Id"] ?? data?.["ID"] ?? "";
      if (!id) {
        // Algumas versões da WuzAPI não devolvem o id ao criar: procuramos o
        // usuário recém-criado na lista de administração.
        try {
          const users = await run<unknown>("/admin/users", "GET", undefined, true);
          const list = Array.isArray(users) ? (users as Record<string, unknown>[]) : [];
          const match = list.find((u) => String(u["token"] ?? "") === token);
          id = match?.["id"] ?? match?.["Id"] ?? "";
        } catch {
          id = "";
        }
      }
      if (!id) id = token; // o token identifica a sessão na WuzAPI
      return {
        data: {
          id: String(id ?? ""),
          name: String(data?.["name"] ?? body["name"] ?? ""),
          token: String(data?.["token"] ?? token),
        },
      };
    }
    case "/instance/connect": {
      // Registra o webhook desta central e abre a sessão. Em instalações que já
      // têm webhook, POST /webhook pode responder sucesso sem substituir a URL;
      // por isso a atualização é feita primeiro e confirmada por leitura.
      const webhook = String(body["webhookUrl"] ?? "");
      if (webhook) {
        try {
          await run("/webhook/update", "PUT", {
            webhook,
            events: ["All"],
            Active: true,
          });
        } catch {
          await run("/webhook", "POST", { webhook, events: ["All"] });
        }

        const saved = await run<Record<string, unknown>>("/webhook", "GET");
        const savedUrl = String(saved?.["webhook"] ?? saved?.["Webhook"] ?? "");
        if (savedUrl.replace(/\/+$/, "") !== webhook.replace(/\/+$/, "")) {
          throw new Error(
            "A WuzAPI não confirmou o endereço de recebimento desta central. Tente conectar novamente.",
          );
        }
      }
      let jid = "";
      try {
        const data = await run<Record<string, unknown>>("/session/connect", "POST", {
          Subscribe: ["All"],
          Immediate: true,
        });
        jid = String(data?.["jid"] ?? data?.["Jid"] ?? "");
      } catch (error) {
        // "already connected" não é erro para a central.
        if (!/already\s*(connected|logged)/i.test((error as Error).message)) throw error;
      }
      // A WuzAPI publica o QR Code poucos instantes depois do /session/connect:
      // tentamos rápido algumas vezes para não travar a resposta.
      let qrcode: string | null = null;
      for (let attempt = 0; attempt < 4 && !qrcode; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 350));
        try {
          qrcode = normalizeWuzapiQr(await run<Record<string, unknown>>("/session/qr", "GET"));
        } catch {
          qrcode = null;
        }
      }
      return { data: { jid, webhookUrl: webhook, ...(qrcode ? { Qrcode: qrcode } : {}) } };
    }
    case "/instance/qr": {
      let qrcode: string | null = null;
      let lastError: unknown = null;
      let reopened = false;
      for (let attempt = 0; attempt < 3 && !qrcode; attempt += 1) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 300));
        try {
          qrcode = normalizeWuzapiQr(await run<Record<string, unknown>>("/session/qr", "GET"));
        } catch (error) {
          lastError = error;
          // Sessão ainda não iniciada: reabre uma única vez e tenta de novo.
          if (!reopened && isMissingSessionError(error)) {
            reopened = true;
            try {
              await run("/session/connect", "POST", { Subscribe: ["All"], Immediate: true });
            } catch {
              // segue para a próxima tentativa
            }
          }
        }
      }
      if (!qrcode && lastError) {
        throw new Error("No QR code available yet, wait a moment and try again.");
      }
      return { data: { Qrcode: qrcode, Code: null } };
    }
    case "/instance/status": {
      const data = (await run<Record<string, unknown>>("/session/status", "GET")) ?? {};
      const jid = data["jid"] ?? data["Jid"] ?? data["JID"] ?? "";
      return {
        data: {
          ...data,
          Connected: Boolean(data["Connected"] ?? data["connected"] ?? false),
          LoggedIn: Boolean(data["LoggedIn"] ?? data["loggedIn"] ?? false),
          Jid: typeof jid === "string" ? jid : "",
        },
      };
    }
    case "/instance/pair": {
      const data = await run<Record<string, unknown>>("/session/pairphone", "POST", {
        Phone: toPhone(body["phone"]),
      });
      const code = data?.["LinkingCode"] ?? data?.["PairingCode"] ?? null;
      return { data: { PairingCode: typeof code === "string" ? code : null } };
    }
    case "/instance/logout":
      return { data: await run("/session/logout", "POST") };
    case "/instance/disconnect":
      return { data: await run("/session/disconnect", "POST") };
    case "/instance/all": {
      // A WuzAPI devolve { instances: [...] } em versões novas e um array puro
      // nas antigas.
      const data = await run<unknown>("/admin/users", "GET", undefined, true);
      const wrapper = data as { instances?: unknown; users?: unknown } | null;
      const list = Array.isArray(data)
        ? data
        : Array.isArray(wrapper?.instances)
          ? wrapper.instances
          : Array.isArray(wrapper?.users)
            ? wrapper.users
            : [];
      return { data: list };
    }

    // ------------------------------------------------------------------ envio
    case "/send/text": {
      const quoted = body["quoted"] as { messageId?: string; participant?: string } | undefined;
      const data = await run("/chat/send/text", "POST", {
        Phone: toPhone(body["number"]),
        Body: String(body["text"] ?? ""),
        LinkPreview: true,
        ...(quoted?.messageId
          ? {
              ContextInfo: {
                StanzaID: quoted.messageId,
                Participant: quoted.participant ?? toPhone(body["number"]) + "@s.whatsapp.net",
              },
            }
          : {}),
      });
      return sentEnvelope(data);
    }
    case "/send/link": {
      const text = [String(body["text"] ?? ""), String(body["url"] ?? "")]
        .filter(Boolean)
        .join("\n");
      const data = await run("/chat/send/text", "POST", {
        Phone: toPhone(body["number"]),
        Body: text,
        LinkPreview: true,
      });
      return sentEnvelope(data);
    }
    case "/send/media": {
      const type = String(body["type"] ?? "document");
      const url = String(body["url"] ?? "");
      const phone = toPhone(body["number"]);
      const caption = String(body["caption"] ?? "");
      if (type === "image") {
        const data = await run("/chat/send/image", "POST", {
          Phone: phone,
          Image: await toDataUri(url, "image/jpeg"),
          Caption: caption,
        });
        return sentEnvelope(data);
      }
      if (type === "video") {
        const data = await run("/chat/send/video", "POST", {
          Phone: phone,
          Video: await toDataUri(url, "video/mp4"),
          Caption: caption,
        });
        return sentEnvelope(data);
      }
      if (type === "audio") {
        // A WuzAPI só aceita áudio com o rótulo exato "data:audio/ogg;base64,".
        const data = await run("/chat/send/audio", "POST", {
          Phone: phone,
          Audio: await toWuzapiAudioDataUri(url),
          PTT: true,
        });
        return sentEnvelope(data);
      }
      const data = await run("/chat/send/document", "POST", {
        Phone: phone,
        Document: await toDataUri(url, "application/octet-stream"),
        FileName: String(body["filename"] ?? "arquivo"),
      });
      return sentEnvelope(data);
    }
    case "/send/sticker": {
      const data = await run("/chat/send/sticker", "POST", {
        Phone: toPhone(body["number"]),
        Sticker: await toDataUri(String(body["sticker"] ?? ""), "image/webp"),
        MimeType: "image/webp",
      });
      return sentEnvelope(data);
    }
    case "/send/contact": {
      const card = body["vcard"] as { fullName?: string; phone?: string } | undefined;
      const name = String(card?.fullName ?? "Contato");
      const data = await run("/chat/send/contact", "POST", {
        Phone: toPhone(body["number"]),
        Name: name,
        Vcard: vcard(name, String(card?.phone ?? "")),
      });
      return sentEnvelope(data);
    }
    case "/send/button": {
      const buttons = (body["buttons"] ?? []) as Array<Record<string, any>>;
      const data = await run("/chat/send/buttons", "POST", {
        Phone: toPhone(body["number"]),
        Title: String(body["title"] ?? ""),
        Body: String(body["description"] ?? body["title"] ?? ""),
        Footer: String(body["footer"] ?? ""),
        ...(body["imageUrl"] ? { Image: String(body["imageUrl"]) } : {}),
        Buttons: buttons.slice(0, 5).map((button, index) => ({
          type: BUTTON_TYPE[String(button["type"] ?? "reply")] ?? "reply",
          title: String(button["displayText"] ?? `Opção ${index + 1}`),
          id: String(button["id"] ?? `btn_${index + 1}`),
          ...(button["url"] ? { url: String(button["url"]) } : {}),
          ...(button["phoneNumber"] ? { phone_number: String(button["phoneNumber"]) } : {}),
          ...(button["copyCode"] || button["key"]
            ? { copy_code: String(button["copyCode"] ?? button["key"]) }
            : {}),
        })),
      });
      return sentEnvelope(data);
    }
    case "/send/list": {
      const sections = (body["sections"] ?? []) as Array<Record<string, any>>;
      const titulo = String(body["title"] ?? "Opções");
      const data = await run("/chat/send/list", "POST", {
        Phone: toPhone(body["number"]),
        Title: titulo,
        TopText: titulo,
        Description: String(body["description"] ?? titulo),
        Desc: String(body["description"] ?? titulo),
        ButtonText: String(body["buttonText"] ?? "Ver opções"),
        FooterText: String(body["footerText"] ?? ""),
        Sections: sections.map((section) => ({
          title: String(section["title"] ?? ""),
          rows: ((section["rows"] ?? []) as Array<Record<string, any>>).map((row) => ({
            title: String(row["title"] ?? ""),
            desc: String(row["description"] ?? ""),
            RowId: String(row["rowId"] ?? row["title"] ?? ""),
          })),
        })),
      });
      return sentEnvelope(data);
    }
    case "/send/poll": {
      const data = await run("/chat/send/poll", "POST", {
        Group: toPhone(body["number"]),
        Header: String(body["question"] ?? ""),
        Options: (body["options"] ?? []) as string[],
      });
      return sentEnvelope(data);
    }
    case "/message/delete": {
      const data = await run("/chat/delete", "POST", {
        Phone: toPhone(body["chat"]),
        Id: String(body["messageId"] ?? ""),
      });
      return { data: data ?? {} };
    }
    case "/message/markread": {
      const raw = String(body["number"] ?? "");
      const chat = raw.includes("@") ? raw : `${toPhone(raw)}@s.whatsapp.net`;
      const data = await run("/chat/markread", "POST", {
        Id: ((body["id"] ?? []) as string[]).filter(Boolean),
        Chat: chat,
        ChatPhone: raw.includes("@") ? undefined : toPhone(raw),
      });
      return { data: data ?? {} };
    }

    // -------------------------------------------------------- contatos/grupos
    case "/user/avatar": {
      const data = await run<Record<string, unknown>>("/user/avatar", "POST", {
        Phone: toPhone(body["number"]),
        Preview: true,
      });
      return { data: { URL: data?.["URL"] ?? data?.["url"] ?? null } };
    }
    case "/user/contacts": {
      const data = await run<Record<string, Record<string, unknown>>>("/user/contacts", "GET");
      const list = Object.entries(data ?? {}).map(([jid, info]) => ({
        JID: jid,
        Name: info?.["FullName"] || info?.["PushName"] || info?.["BusinessName"] || "",
        ...info,
      }));
      return { data: list };
    }
    case "/group/list": {
      const data = await run<Record<string, unknown>>("/group/list", "GET");
      const groups = (data?.["Groups"] ?? data?.["groups"] ?? data) as unknown;
      return { data: Array.isArray(groups) ? groups : [] };
    }
    case "/group/myall":
      return { data: [] };
    case "/group/info": {
      const jid = String(body["groupJid"] ?? "");
      const data = await run<Record<string, unknown>>(
        `/group/info?groupJID=${encodeURIComponent(jid)}`,
        "GET",
      );
      return { data: data ?? {} };
    }
    // Consulta do webhook atualmente registrado (usada na sincronização).
    case "/webhook":
    case "/instance/webhook": {
      const data = await run<Record<string, unknown>>("/webhook", "GET");
      return { data: data ?? {} };
    }
    default:
      throw new Error(`A WuzAPI não tem equivalente para a rota ${path}.`);
  }
}

/** Testa conectividade com o servidor WuzAPI usando o token de administrador. */
export async function testWuzapiConnection(
  baseUrl: string,
  adminToken: string,
): Promise<{ ok: boolean; instances: number; message: string }> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return { ok: false, instances: 0, message: "Endereço inválido." };
  const res = await fetch(`${base}/admin/users`, {
    headers: { Authorization: adminToken, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await res.json().catch(() => null)) as { data?: unknown[]; error?: string; message?: string };
  if (!res.ok) {
    return {
      ok: false,
      instances: 0,
      message: describeWuzapiError(res.status, payload),
    };
  }
  const users = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return {
    ok: true,
    instances: users.length,
    message: "Conexão com a WuzAPI confirmada.",
  };
}

/** Campo do payload sem depender de maiúsculas/minúsculas. */
function mediaField(media: Record<string, unknown>, ...names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const entry = Object.entries(media).find(([key]) => wanted.has(key.toLowerCase()));
  return entry?.[1];
}

export type WuzapiMediaKind = "image" | "sticker" | "video" | "audio" | "document";

function absoluteWhatsappMediaUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://mmg.whatsapp.net${url}`;
  return url;
}

/**
 * Baixa a mídia de uma mensagem recebida (figurinha, imagem, áudio, vídeo ou
 * documento). A WuzAPI entrega o arquivo criptografado (.enc) no webhook; só o
 * servidor consegue abrir, por meio das rotas /chat/download*.
 */
export async function wuzapiDownloadMedia(input: {
  baseUrl: string;
  token: string;
  adminToken: string;
  kind: WuzapiMediaKind;
  media: Record<string, unknown>;
}): Promise<{ base64: string; mimetype: string } | null> {
  const media = input.media ?? {};
  const directPath = String(mediaField(media, "directPath", "direct_path") ?? "").trim();
  const url = absoluteWhatsappMediaUrl(
    mediaField(media, "url", "URL", "mediaUrl", "mediaURL") ?? directPath,
  );
  const mediaKey = mediaField(media, "mediaKey", "media_key");
  if (!url || !mediaKey) {
    console.error("[wuzapi] mídia recebida sem URL ou chave de descriptografia", {
      kind: input.kind,
      hasUrl: Boolean(url),
      hasMediaKey: Boolean(mediaKey),
      fields: Object.keys(media).slice(0, 30),
    });
    return null;
  }

  const body: Record<string, unknown> = {
    Url: url,
    DirectPath: directPath,
    MediaKey: mediaKey,
    Mimetype: String(mediaField(media, "mimetype", "mimeType") ?? ""),
    FileEncSHA256: mediaField(media, "fileEncSha256", "fileEncSHA256", "file_enc_sha256") ?? "",
    FileSHA256: mediaField(media, "fileSha256", "fileSHA256", "file_sha256") ?? "",
    FileLength: Number(mediaField(media, "fileLength", "file_length") ?? 0) || 0,
  };

  try {
    const downloadKind = input.kind === "sticker" ? "image" : input.kind;
    const data = await call<unknown>({
      baseUrl: input.baseUrl,
      path: `/chat/download${downloadKind}`,
      method: "POST",
      body,
      token: input.token,
      adminToken: input.adminToken,
      timeoutMs: 60_000,
    });
    const findString = (value: unknown, names: string[], depth = 0): string => {
      if (depth > 5 || value === null || value === undefined) return "";
      if (typeof value === "string") return depth === 0 ? value : "";
      if (typeof value !== "object") return "";
      const record = value as Record<string, unknown>;
      const wanted = new Set(names.map((name) => name.toLowerCase()));
      for (const [key, entry] of Object.entries(record)) {
        if (wanted.has(key.toLowerCase()) && typeof entry === "string" && entry) return entry;
      }
      for (const entry of Object.values(record)) {
        const found = findString(entry, names, depth + 1);
        if (found) return found;
      }
      return "";
    };
    const base64 = findString(data, ["data", "base64", "file"]);
    if (!base64) {
      console.error("[wuzapi] download de mídia respondeu sem arquivo", {
        kind: input.kind,
        responseFields:
          data && typeof data === "object" ? Object.keys(data as Record<string, unknown>) : [],
      });
      return null;
    }
    const mimetype = findString(data, ["mimetype", "mimeType", "contentType"]);
    return { base64, mimetype: mimetype || String(body["Mimetype"] ?? "") };
  } catch (error) {
    console.error("[wuzapi] falha ao baixar mídia recebida:", (error as Error).message);
    return null;
  }
}
