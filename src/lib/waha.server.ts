// Cliente HTTP da WAHA (https://waha.devlike.pro/docs/) — traduz as chamadas da
// central (que nasceram no formato da Evolution Go) para os caminhos da WAHA e
// devolve sempre o envelope { data: ... } que o restante do sistema entende.
//
// Autenticação: header X-Api-Key com a chave do servidor WAHA.
// Cada dispositivo da central corresponde a uma "session" da WAHA; o nome da
// sessão é guardado em whatsapp_config.instance_id/instance_name.
//
// Uso exclusivo no servidor.

export const WAHA_DEFAULT_BASE_URL = "http://localhost:3000";

/**
 * Eventos assinados no webhook da sessão.
 * "message.any" já traz recebidas e enviadas, então "message" não é assinado
 * para a mesma mensagem não chegar duas vezes.
 */
export const WAHA_EVENTS = [
  "message.any",
  "message.reaction",
  "message.edited",
  "message.ack",
  "message.waiting",
  "message.revoked",
  "session.status",
] as const;


type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type WahaCall = {
  baseUrl: string;
  path: string;
  method?: Method;
  body?: unknown;
  timeoutMs?: number;
  /** Chave da API do servidor WAHA. */
  apiKey: string;
  /** Nome da sessão (dispositivo) na WAHA. */
  session?: string | undefined;
};

export function normalizeWahaBaseUrl(baseUrl: string) {
  return (baseUrl || "").trim().replace(/\/+$/, "") || WAHA_DEFAULT_BASE_URL;
}

function digits(value: string) {
  return (value || "").replace(/\D/g, "");
}

/** Destino no formato da WAHA: 5562...@c.us, grupo@g.us, status@broadcast. */
function toChatId(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/@(g\.us|broadcast|newsletter|c\.us|lid)$/i.test(raw)) return raw;
  if (raw.includes("@s.whatsapp.net")) return `${digits(raw.split("@")[0] ?? "")}@c.us`;
  if (raw.includes("@")) return `${digits(raw.split("@")[0] ?? "")}@c.us`;
  const only = digits(raw);
  return only ? `${only}@c.us` : "";
}

function describeWahaError(status: number, payload: unknown): string {
  const raw = payload as { error?: string; message?: string | string[] } | string | null;
  const rawMessage =
    typeof raw === "string"
      ? raw
      : Array.isArray(raw?.message)
        ? raw?.message.join(", ")
        : (raw?.message ?? raw?.error);
  const message = (rawMessage && String(rawMessage)) || `Falha na WAHA (HTTP ${status}).`;

  if (/not logged|no session|status.*(stopped|failed)|session.*not.*(found|started)/i.test(message)) {
    return "O WhatsApp deste dispositivo não está pareado. Abra Administração → Dispositivos e leia o QR Code para voltar a enviar mensagens.";
  }
  if (/not.*on whatsapp|invalid.*(number|chatid)/i.test(message)) {
    return "Esse número não tem WhatsApp ativo. Confira o DDD e os dígitos e tente novamente.";
  }
  if (status === 429) {
    return "O servidor do WhatsApp recebeu pedidos demais e pediu uma pausa. Aguarde alguns segundos e tente novamente.";
  }
  if (status === 401 || status === 403) {
    return "A WAHA recusou as credenciais. Revise a chave da API em Administração → API de conexão.";
  }
  if (status === 404) {
    return "A WAHA não encontrou essa sessão. Confira o endereço do servidor e o nome da sessão do dispositivo.";
  }
  return message;
}

function isAlreadyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /already\s*(exists|started|running|connected|logged)/i.test(message);
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /não encontrou essa sessão|not found/i.test(message);
}

/**
 * Sessão travada: o servidor aceita a requisição e nunca responde (ou o proxy
 * devolve 502/504). Nesse estado o envio ficava minutos "em andamento".
 */
function isStuckError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /não respondeu no tempo esperado|gateway time-?out|HTTP 50[24]|\b50[24]\b/i.test(message);
}


/** Requisição bruta a um endpoint da WAHA (já com repetição em 429/5xx). */
async function call<T = unknown>(options: WahaCall & { raw?: boolean }): Promise<T> {
  const base = normalizeWahaBaseUrl(options.baseUrl);
  if (!options.apiKey) {
    throw new Error("Falta cadastrar a chave da API da WAHA em Administração → API de conexão.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": options.apiKey,
  };

  const method = options.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);

  // Envio de mensagem não é repetido em erro do servidor: repetir atrasaria a
  // entrega e poderia duplicar a mensagem. Só consultas são repetidas.
  const isSend = method === "POST" && /^\/api\/send/i.test(options.path);
  let response!: Response;
  let text = "";
  const maxAttempts = isSend ? 2 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      response = await fetch(`${base}${options.path}`, { ...init, signal: controller.signal });
    } catch (error) {
      const aborted = (error as Error).name === "AbortError";
      if (attempt < maxAttempts && !aborted) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      if (aborted) {
        throw new Error("O servidor WAHA não respondeu no tempo esperado. Tente novamente.");
      }
      throw new Error(
        "Não foi possível falar com o servidor WAHA. Confira o endereço em Administração → API de conexão.",
      );
    } finally {
      clearTimeout(timer);
    }

    text = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && !isSend && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
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
  if (!response.ok) throw new Error(describeWahaError(response.status, payload));
  return payload as T;
}

function sentEnvelope(data: unknown) {
  const bag = (data ?? {}) as Record<string, unknown>;
  const id = bag["id"] ?? (bag["_data"] as Record<string, unknown> | undefined)?.["id"] ?? null;
  const flat =
    typeof id === "string"
      ? id
      : typeof id === "object" && id
        ? String((id as Record<string, unknown>)["_serialized"] ?? "")
        : "";
  return { data: { ...bag, Info: { ID: flat } } };
}

function vcard(name: string, phone: string) {
  const only = digits(phone);
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${name}`,
    `TEL;type=CELL;waid=${only}:+${only}`,
    "END:VCARD",
  ].join("\n");
}

/** Texto simples com as opções numeradas (usado quando a WAHA não tem botões). */
function optionsAsText(title: string, description: string, options: string[]) {
  return [title, description, "", ...options.map((o, i) => `${i + 1} - ${o}`)]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();
}

type SessionInfo = {
  name?: string;
  status?: string;
  me?: { id?: string; pushName?: string } | null;
  config?: { webhooks?: Array<{ url?: string; events?: string[] }> } | null;
};

/** Situação atual da sessão na WAHA (em maiúsculas). */
async function sessionStatus(options: WahaCall, session: string): Promise<string> {
  try {
    const info = await call<SessionInfo>({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      path: `/api/sessions/${encodeURIComponent(session)}`,
      method: "GET",
      timeoutMs: 10_000,
    });
    return String(info?.status ?? "").toUpperCase();
  } catch {
    return "";
  }
}

/**
 * A WAHA só entrega o QR Code quando a sessão está em SCAN_QR_CODE. Se ela
 * estiver parada ou com falha (FAILED), o pedido do QR volta com erro 422 e a
 * tela ficava sem imagem: aqui a sessão é iniciada/reiniciada até chegar nesse
 * estado.
 */
async function ensureScanState(options: WahaCall, session: string): Promise<string> {
  let status = await sessionStatus(options, session);
  if (status === "WORKING" || status === "SCAN_QR_CODE") return status;

  const action = async (act: "stop" | "start" | "restart" | "logout") => {
    try {
      await call({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        path: `/api/sessions/${encodeURIComponent(session)}/${act}`,
        method: "POST",
        body: {},
        timeoutMs: 30_000,
      });
      return true;
    } catch {
      return false;
    }
  };

  const waitScan = async (rounds: number) => {
    for (let attempt = 0; attempt < rounds; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      status = await sessionStatus(options, session);
      if (status === "SCAN_QR_CODE" || status === "WORKING") return true;
    }
    return false;
  };

  // Sessão com falha: o "restart" do servidor costuma responder erro 500, então
  // paramos e iniciamos de novo.
  if (status === "FAILED") {
    await action("stop");
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  if (!(await action("start")) && status !== "FAILED") await action("restart");
  if (await waitScan(10)) return status;

  // Ainda com falha: a credencial guardada no servidor está corrompida. Limpar
  // o login (logout) e iniciar de novo devolve a sessão ao estado de leitura.
  await action("logout");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await action("start");
  await waitScan(12);
  return status;
}



/** QR Code da sessão, já no formato aceito pela central (data URL). */
async function readQr(options: WahaCall, session: string): Promise<string | null> {
  try {
    const data = await call<Record<string, unknown>>({
      ...options,
      path: `/api/${encodeURIComponent(session)}/auth/qr?format=image`,
      method: "GET",
      body: undefined,
      timeoutMs: 15_000,
    });
    const value = data?.["data"] ?? data?.["qr"] ?? data?.["value"];
    const mimetype = String(data?.["mimetype"] ?? "image/png");
    if (typeof value === "string" && value.trim()) {
      return value.startsWith("data:") ? value : `data:${mimetype};base64,${value.trim()}`;
    }
  } catch {
    /* sessão ainda iniciando: a central tenta de novo */
  }
  return null;
}


function sessionOf(options: WahaCall): string {
  const body = (options.body ?? {}) as Record<string, any>;
  return (
    (options.session ?? "").trim() ||
    String(body["name"] ?? body["session"] ?? "").trim() ||
    "default"
  );
}

/**
 * Reinicia a sessão travada e espera ela voltar a funcionar. Sem isso o envio
 * seguinte também ficaria esperando sem resposta.
 */
async function reviveSession(options: WahaCall, session: string): Promise<boolean> {
  const post = async (act: "restart" | "stop" | "start") => {
    try {
      await call({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        path: `/api/sessions/${encodeURIComponent(session)}/${act}`,
        method: "POST",
        body: {},
        timeoutMs: 30_000,
      });
      return true;
    } catch {
      return false;
    }
  };
  if (!(await post("restart"))) {
    // Alguns estados recusam o "restart": parar e iniciar resolve.
    await post("stop");
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (!(await post("start"))) return false;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      const info = await call<SessionInfo>({
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        path: `/api/sessions/${encodeURIComponent(session)}`,
        method: "GET",
        timeoutMs: 10_000,
      });
      if (String(info?.status ?? "").toUpperCase() === "WORKING") return true;
    } catch {
      /* ainda iniciando */
    }
  }
  return false;
}

/**
 * Executa uma chamada da central (formato Evolution Go) usando a WAHA.
 * Quando a sessão está travada (servidor sem resposta), reinicia e reenvia uma
 * única vez, para a mensagem sair em segundos em vez de ficar minutos parada.
 */
export async function wahaDispatch(options: WahaCall): Promise<unknown> {
  try {
    return await wahaDispatchOnce(options);
  } catch (error) {
    const isSend = options.path.startsWith("/send/");
    if (!isSend || !isStuckError(error)) throw error;
    const session = sessionOf(options);
    console.error(`[waha] sessão ${session} travada — reiniciando e reenviando`);
    if (!(await reviveSession(options, session))) throw error;
    return await wahaDispatchOnce(options);
  }
}

async function wahaDispatchOnce(options: WahaCall): Promise<unknown> {
  const { path } = options;
  const body = (options.body ?? {}) as Record<string, any>;
  const session = sessionOf(options);


  const run = <T = unknown>(innerPath: string, method: Method, innerBody?: unknown, timeoutMs?: number) =>
    call<T>({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      session,
      path: innerPath,
      method,
      ...(innerBody === undefined ? {} : { body: innerBody }),
      timeoutMs: timeoutMs ?? options.timeoutMs ?? 20_000,
    });

  const sessionConfig = (webhookUrl?: string) => ({
    ...(webhookUrl
      ? {
          webhooks: [
            {
              url: webhookUrl,
              events: [...WAHA_EVENTS],
              retries: { delaySeconds: 2, attempts: 5, policy: "exponential" },
            },
          ],
        }
      : {}),
  });

  // Texto não precisa de espera longa: se passar disso a sessão está travada e
  // o envio é retomado depois de reiniciá-la.
  const TEXT_TIMEOUT = 25_000;
  const sendText = async (chatId: string, text: string) =>
    sentEnvelope(await run("/api/sendText", "POST", { session, chatId, text }, TEXT_TIMEOUT));

  switch (path) {
    // ----------------------------------------------------------------- sessão
    case "/instance/create": {
      const name = String(body["name"] ?? session);
      try {
        await run("/api/sessions", "POST", { name, start: true, config: {} });
      } catch (error) {
        if (!isAlreadyError(error)) throw error;
      }
      return { data: { id: name, name, token: options.apiKey } };
    }
    case "/instance/connect": {
      const webhook = String(body["webhookUrl"] ?? "");
      const config = sessionConfig(webhook);
      try {
        await run(`/api/sessions/${encodeURIComponent(session)}`, "PUT", { config });
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
        await run("/api/sessions", "POST", { name: session, start: true, config });
      }
      // Garante que a sessão esteja pronta para leitura (ou já conectada).
      const state = await ensureScanState(options, session);

      let jid = "";
      try {
        const info = await run<SessionInfo>(`/api/sessions/${encodeURIComponent(session)}`, "GET");
        jid = String(info?.me?.id ?? "");
      } catch {
        /* sessão iniciando: seguimos para o QR */
      }
      let qrcode: string | null = null;
      if (!jid && state !== "WORKING") {
        for (let attempt = 0; attempt < 4 && !qrcode; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800));
          qrcode = await readQr(options, session);
        }
      }
      return { data: { jid, webhookUrl: webhook, ...(qrcode ? { Qrcode: qrcode } : {}) } };
    }
    case "/instance/qr": {
      let qrcode = await readQr(options, session);
      if (!qrcode) {
        const state = await ensureScanState(options, session);
        if (state !== "WORKING") {
          for (let attempt = 0; attempt < 4 && !qrcode; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800));
            qrcode = await readQr(options, session);
          }
        }
      }
      if (!qrcode) throw new Error("No QR code available yet, wait a moment and try again.");

      return { data: { Qrcode: qrcode, Code: null } };
    }
    case "/instance/status": {
      const info = await run<SessionInfo>(`/api/sessions/${encodeURIComponent(session)}`, "GET");
      const status = String(info?.status ?? "").toUpperCase();
      const loggedIn = status === "WORKING";
      const connected = loggedIn || ["STARTING", "SCAN_QR_CODE"].includes(status);
      return {
        data: {
          Status: status,
          Connected: connected,
          LoggedIn: loggedIn,
          Jid: String(info?.me?.id ?? ""),
          Name: String(info?.me?.pushName ?? info?.name ?? session),
        },
      };
    }
    case "/instance/pair": {
      const data = await run<Record<string, unknown>>(
        `/api/${encodeURIComponent(session)}/auth/request-code`,
        "POST",
        { phoneNumber: digits(String(body["phone"] ?? "")) },
      );
      const code = data?.["code"] ?? data?.["pairingCode"] ?? null;
      return { data: { PairingCode: typeof code === "string" ? code : null } };
    }
    case "/instance/logout": {
      const data = await run(`/api/sessions/${encodeURIComponent(session)}/logout`, "POST", {});
      return { data: data ?? {} };
    }
    case "/instance/disconnect": {
      const data = await run(`/api/sessions/${encodeURIComponent(session)}/stop`, "POST", {});
      return { data: data ?? {} };
    }
    case "/instance/all": {
      const list = await run<SessionInfo[]>("/api/sessions?all=true", "GET");
      const sessions = Array.isArray(list) ? list : [];
      return {
        data: sessions.map((item) => ({
          id: String(item?.name ?? ""),
          name: String(item?.name ?? ""),
          token: options.apiKey,
          status: String(item?.status ?? ""),
          webhook: String(item?.config?.webhooks?.[0]?.url ?? ""),
        })),
      };
    }
    case "/webhook":
    case "/instance/webhook": {
      const info = await run<SessionInfo>(`/api/sessions/${encodeURIComponent(session)}`, "GET");
      return { data: { webhook: String(info?.config?.webhooks?.[0]?.url ?? "") } };
    }

    // ------------------------------------------------------------------ envio
    case "/send/text": {
      const quoted = body["quoted"] as { messageId?: string } | undefined;
      const data = await run(
        "/api/sendText",
        "POST",
        {
          session,
          chatId: toChatId(body["number"]),
          text: String(body["text"] ?? ""),
          ...(quoted?.messageId ? { reply_to: quoted.messageId } : {}),
        },
        TEXT_TIMEOUT,
      );
      return sentEnvelope(data);
    }
    case "/send/link": {
      const text = [String(body["text"] ?? ""), String(body["url"] ?? "")].filter(Boolean).join("\n");
      return sendText(toChatId(body["number"]), text);
    }
    case "/send/media": {
      const type = String(body["type"] ?? "document");
      const url = String(body["url"] ?? "");
      const chatId = toChatId(body["number"]);
      const caption = String(body["caption"] ?? "");
      const filename = String(body["filename"] ?? "arquivo");
      if (type === "image") {
        return sentEnvelope(
          await run(
            "/api/sendImage",
            "POST",
            { session, chatId, file: { mimetype: "image/jpeg", filename, url }, caption },
            60_000,
          ),
        );
      }
      if (type === "video") {
        return sentEnvelope(
          await run(
            "/api/sendVideo",
            "POST",
            {
              session,
              chatId,
              file: { mimetype: "video/mp4", filename, url },
              caption,
              convert: true,
            },
            90_000,
          ),
        );
      }
      if (type === "audio") {
        return sentEnvelope(
          await run(
            "/api/sendVoice",
            "POST",
            {
              session,
              chatId,
              file: { mimetype: "audio/ogg; codecs=opus", filename: "audio.ogg", url },
              convert: true,
            },
            90_000,
          ),
        );
      }
      return sentEnvelope(
        await run(
          "/api/sendFile",
          "POST",
          {
            session,
            chatId,
            file: { mimetype: "application/octet-stream", filename, url },
            caption,
          },
          90_000,
        ),
      );
    }
    case "/send/sticker": {
      const chatId = toChatId(body["number"]);
      const url = String(body["sticker"] ?? "");
      const file = { mimetype: "image/webp", filename: "figurinha.webp", url };
      try {
        return sentEnvelope(
          await run("/api/sendSticker", "POST", { session, chatId, file }),
        );
      } catch (error) {
        // Versões antigas da WAHA ainda não possuem /api/sendSticker.
        // Nelas, preservamos a entrega como imagem em vez de perder o envio.
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (!/não encontrou essa sessão|not found|cannot post|404/i.test(message)) throw error;
        return sentEnvelope(
          await run("/api/sendImage", "POST", { session, chatId, file }),
        );
      }
    }
    case "/send/contact": {
      const card = body["vcard"] as { fullName?: string; phone?: string } | undefined;
      const name = String(card?.fullName ?? "Contato");
      const data = await run("/api/sendContactVcard", "POST", {
        session,
        chatId: toChatId(body["number"]),
        contacts: [{ vcard: vcard(name, String(card?.phone ?? "")) }],
      });
      return sentEnvelope(data);
    }
    case "/send/button": {
      const chatId = toChatId(body["number"]);
      const buttons = (body["buttons"] ?? []) as Array<Record<string, any>>;
      try {
        return sentEnvelope(
          await run("/api/sendButtons", "POST", {
            session,
            chatId,
            header: String(body["title"] ?? ""),
            body: String(body["description"] ?? body["title"] ?? ""),
            footer: String(body["footer"] ?? ""),
            buttons: buttons.slice(0, 3).map((button, index) => ({
              type: "reply",
              body: { text: String(button["displayText"] ?? `Opção ${index + 1}`) },
            })),
          }),
        );
      } catch {
        // Servidores WAHA sem botões interativos: menu numerado em texto.
        return sendText(
          chatId,
          optionsAsText(
            String(body["title"] ?? ""),
            String(body["description"] ?? ""),
            buttons.map((b, i) => String(b["displayText"] ?? `Opção ${i + 1}`)),
          ),
        );
      }
    }
    case "/send/list": {
      const chatId = toChatId(body["number"]);
      const sections = (body["sections"] ?? []) as Array<Record<string, any>>;
      const rows = sections.flatMap((section) =>
        ((section["rows"] ?? []) as Array<Record<string, any>>).map((row) => String(row["title"] ?? "")),
      );
      return sendText(
        chatId,
        optionsAsText(String(body["title"] ?? "Opções"), String(body["description"] ?? ""), rows),
      );
    }
    case "/send/poll": {
      const data = await run("/api/sendPoll", "POST", {
        session,
        chatId: toChatId(body["number"]),
        poll: {
          name: String(body["question"] ?? ""),
          options: (body["options"] ?? []) as string[],
          multipleAnswers: Number(body["maxAnswer"] ?? 1) > 1,
        },
      });
      return sentEnvelope(data);
    }
    case "/message/delete": {
      const chatId = toChatId(body["chat"]);
      const messageId = String(body["messageId"] ?? "");
      const data = await run(
        `/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
        "DELETE",
      );
      return { data: data ?? {} };
    }

    // -------------------------------------------------------- contatos/grupos
    case "/user/avatar": {
      const contactId = toChatId(body["number"]);
      const data = await run<Record<string, unknown>>(
        `/api/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(session)}`,
        "GET",
      );
      const url = data?.["profilePictureURL"] ?? data?.["url"] ?? null;
      return { data: { URL: typeof url === "string" ? url : null } };
    }
    case "/user/contacts": {
      const data = await run<Array<Record<string, unknown>>>(
        `/api/contacts/all?session=${encodeURIComponent(session)}`,
        "GET",
      );
      const list = (Array.isArray(data) ? data : []).map((item) => ({
        JID: String(item["id"] ?? ""),
        Name: String(item["name"] ?? item["pushname"] ?? item["shortName"] ?? ""),
        ...item,
      }));
      return { data: list };
    }
    case "/group/list":
    case "/group/myall": {
      if (path === "/group/myall") return { data: [] };
      const data = await run<Array<Record<string, unknown>>>(
        `/api/${encodeURIComponent(session)}/groups`,
        "GET",
        undefined,
        45_000,
      );
      const groups = (Array.isArray(data) ? data : []).map((item) => {
        const id = item["id"];
        const jid =
          typeof id === "string"
            ? id
            : String((id as Record<string, unknown> | null)?.["_serialized"] ?? "");
        return {
          JID: jid,
          id: jid,
          Name: String(item["name"] ?? item["subject"] ?? ""),
          name: String(item["name"] ?? item["subject"] ?? ""),
          ...item,
        };
      });
      return { data: groups };
    }
    case "/group/info": {
      const jid = String(body["groupJid"] ?? "");
      const data = await run<Record<string, unknown>>(
        `/api/${encodeURIComponent(session)}/groups/${encodeURIComponent(jid)}`,
        "GET",
      );
      return { data: data ?? {} };
    }

    // ------------------------------------------------------ conversas/mensagens
    case "/chat/all":
    case "/chat/list":
    case "/chats":
    case "/chat/findChats": {
      const data = await run<Array<Record<string, unknown>>>(
        `/api/${encodeURIComponent(session)}/chats?limit=200`,
        "GET",
        undefined,
        45_000,
      );
      return { data: Array.isArray(data) ? data : [] };
    }
    case "/chat/history":
    case "/chat/messages":
    case "/message/list":
    case "/chat/findMessages": {
      const chatId = toChatId(body["chatJid"] ?? body["chat"] ?? body["number"]);
      const limite = Number(body["limit"] ?? body["count"] ?? 50) || 50;
      const data = await run<Array<Record<string, unknown>>>(
        `/api/${encodeURIComponent(session)}/chats/${encodeURIComponent(chatId)}/messages?limit=${limite}&downloadMedia=false`,
        "GET",
        undefined,
        45_000,
      );
      return { data: Array.isArray(data) ? data : [] };
    }

    default:
      throw new Error(`A integração WAHA ainda não tem suporte para a operação ${path}.`);
  }
}

/** Confere endereço e chave da WAHA; devolve quantas sessões existem. */
export async function testWahaConnection(baseUrl: string, apiKey: string): Promise<number> {
  const list = await call<unknown>({
    baseUrl,
    apiKey,
    path: "/api/sessions?all=true",
    method: "GET",
    timeoutMs: 15_000,
  });
  return Array.isArray(list) ? list.length : 0;
}

/**
 * Baixa a mídia de uma mensagem recebida. A WAHA entrega a mídia já
 * descriptografada em /api/files/..., que exige a chave da API.
 */
export async function wahaDownloadMedia(input: {
  baseUrl: string;
  apiKey: string;
  media: Record<string, unknown> | undefined;
}): Promise<{ base64: string; mimetype: string } | null> {
  const media = input.media ?? {};
  const url = ["url", "URL", "mediaUrl", "mediaURL"].reduce<string>((found, key) => {
    if (found) return found;
    const value = media[key];
    return typeof value === "string" && value ? value : "";
  }, "");
  if (!url) return null;

  try {
    const alvo = new URL(url, normalizeWahaBaseUrl(input.baseUrl));
    const base = new URL(normalizeWahaBaseUrl(input.baseUrl));
    // Endereços internos (localhost/IP privado) são trocados pelo endereço
    // público configurado para a conexão.
    if (/^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i.test(alvo.hostname)) {
      alvo.protocol = base.protocol;
      alvo.hostname = base.hostname;
      alvo.port = base.port;
    }
    const response = await fetch(alvo.toString(), {
      headers: { "X-Api-Key": input.apiKey },
    });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    return {
      base64: buffer.toString("base64"),
      mimetype:
        (typeof media["mimetype"] === "string" ? (media["mimetype"] as string) : "") ||
        response.headers.get("content-type") ||
        "application/octet-stream",
    };
  } catch (error) {
    console.error("[waha] download de mídia falhou:", (error as Error).message);
    return null;
  }
}

/** Acrescenta a chave da API na URL do arquivo para permitir o download direto. */
export function wahaSignedMediaUrl(url: string, apiKey: string): string {
  if (!url || !apiKey) return url;
  try {
    const alvo = new URL(url);
    if (!alvo.searchParams.get("x-api-key")) alvo.searchParams.set("x-api-key", apiKey);
    return alvo.toString();
  } catch {
    return url;
  }
}
