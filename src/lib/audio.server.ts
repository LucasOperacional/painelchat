// Recebimento de áudios do WhatsApp: guarda o arquivo na central e transcreve.
// Uso exclusivo no servidor.

const EXT_BY_MIME: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
};

function extFor(mime: string) {
  return EXT_BY_MIME[mime.split(";")[0]!.trim().toLowerCase()] ?? "ogg";
}

function absoluteMediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^https:\/\//i.test(value)) return value;
  return null;
}

function base64ToBytes(base64: string): Uint8Array | null {
  if (/^\[conteúdo grande removido:/i.test(base64.trim())) return null;
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const normalized = clean.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;
  const semPadding = normalized.replace(/=+$/, "");
  if (semPadding.length % 4 === 1) return null;
  const padded = semPadding.padEnd(Math.ceil(semPadding.length / 4) * 4, "=");
  let binary = "";
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isEncryptedWhatsappUrl(value: string | null) {
  if (!value) return false;
  if (/\.enc(?:\?|$)/i.test(value)) return true;
  try {
    return /(?:^|\.)mmg\.whatsapp\.net$/i.test(new URL(value).hostname);
  } catch {
    return /mmg\.whatsapp\.net/i.test(value);
  }
}

/** Baixa (ou decodifica) o áudio recebido e guarda na central, devolvendo um link para ouvir. */
export async function storeInboundAudio(input: {
  phoneDigits: string;
  mimeType?: string | null;
  base64?: string | null;
  url?: string | null;
}): Promise<{ url: string; transcript: string | null } | null> {
  let bytes: Uint8Array | null = null;
  let mime = (input.mimeType ?? "").split(";")[0]?.trim() || "audio/ogg";
  const usableUrl = absoluteMediaUrl(input.url);

  try {
    if (input.base64) {
      bytes = base64ToBytes(input.base64);
    }
    if (!bytes && usableUrl && !isEncryptedWhatsappUrl(usableUrl)) {
      const res = await fetch(usableUrl);
      if (res.ok) {
        bytes = new Uint8Array(await res.arrayBuffer());
        const headerMime = res.headers.get("content-type");
        if (headerMime?.startsWith("audio/")) mime = headerMime.split(";")[0]!.trim();
      }
    }
  } catch (error) {
    console.error("[audio] falha ao obter o áudio recebido:", (error as Error).message);
  }

  if (!bytes || bytes.byteLength < 256) {
    // Sem os bytes, ainda dá para ouvir pelo link original quando ele for público.
    if (usableUrl && !isEncryptedWhatsappUrl(usableUrl)) {
      return { url: usableUrl, transcript: null };
    }
    return null;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `recebidos/${input.phoneDigits}/${crypto.randomUUID()}.${extFor(mime)}`;
  const upload = await supabaseAdmin.storage
    .from("anexos")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) {
    console.error("[audio] falha ao guardar o áudio:", upload.error.message);
    return null;
  }

  const signed = await supabaseAdmin.storage
    .from("anexos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("[audio] falha ao criar o link do áudio:", signed.error?.message);
    return null;
  }

  const transcript = await transcribeAudio(bytes, mime);
  return { url: signed.data.signedUrl, transcript };
}

/** Transcrição do áudio com a IA da plataforma (melhor esforço, nunca travando o webhook). */
const MODELO_TRANSCRICAO = "google/gemini-3.5-transcribe";
const LIMITE_TRANSCRICAO_BYTES = 14 * 1024 * 1024; // limite do modelo de transcrição
const LIMITE_TRANSCRICAO_MS = 60_000;

/** O modelo só aceita arquivos declarados como áudio (o navegador às vezes marca vídeo). */
function mimeParaTranscricao(mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (base.startsWith("audio/")) return base;
  if (base === "video/webm") return "audio/webm";
  if (base === "video/mp4" || base === "video/quicktime") return "audio/mp4";
  return "audio/ogg";
}

/** Lê a resposta em fluxo (SSE) e junta o texto conforme ele chega. */
async function lerTranscricao(res: Response): Promise<string | null> {
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("event-stream")) {
    const data = (await res.json().catch(() => null)) as { text?: string } | null;
    return data?.text?.trim() || null;
  }
  const texto = await res.text();
  let acumulado = "";
  let completo: string | null = null;
  for (const linha of texto.split("\n")) {
    if (!linha.startsWith("data:")) continue;
    const bruto = linha.slice(5).trim();
    if (!bruto || bruto === "[DONE]") continue;
    try {
      const evento = JSON.parse(bruto) as { delta?: string; text?: string; type?: string };
      if (typeof evento.delta === "string") acumulado += evento.delta;
      if (typeof evento.text === "string" && evento.text.trim()) completo = evento.text;
    } catch {
      // linha parcial: ignora
    }
  }
  const final = (completo ?? acumulado).trim();
  return final || null;
}

/** Descarta respostas sem fala de verdade ("...", "[inaudível]", ruídos). */
function transcricaoValida(texto: string): boolean {
  const limpo = texto.replace(/[\s.…]+/g, "");
  if (limpo.length < 2) return false;
  if (/^\[.*\]$/.test(texto.trim())) return false;
  return /[a-zà-úA-ZÀ-Ú0-9]/.test(texto);
}

async function pedirTranscricao(
  bytes: Uint8Array,
  mime: string,
  apiKey: string,
  idioma?: string,
): Promise<{ texto: string | null; status: number }> {
  const controller = new AbortController();
  const parar = setTimeout(() => controller.abort(), LIMITE_TRANSCRICAO_MS);
  try {
    const envio = mimeParaTranscricao(mime);
    const form = new FormData();
    form.append("model", MODELO_TRANSCRICAO);
    form.append("response_format", "json");
    form.append("stream", "true");
    if (idioma) form.append("language", idioma);
    form.append("file", new Blob([bytes as BlobPart], { type: envio }), `audio.${extFor(envio)}`);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error("[audio] transcrição falhou:", res.status, await res.text().catch(() => ""));
      return { texto: null, status: res.status };
    }
    return { texto: await lerTranscricao(res), status: res.status };
  } catch (error) {
    console.error("[audio] transcrição falhou:", (error as Error).message);
    return { texto: null, status: 0 };
  } finally {
    clearTimeout(parar);
  }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function transcribeAudio(bytes: Uint8Array, mime: string): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  if (bytes.byteLength < 1024) return null;
  if (bytes.byteLength > LIMITE_TRANSCRICAO_BYTES) {
    console.warn("[audio] áudio grande demais para transcrever:", bytes.byteLength);
    return null;
  }

  // 1ª tentativa em português; instabilidade passageira é repetida; se vier vazio,
  // tenta de novo deixando o modelo detectar o idioma sozinho.
  for (const idioma of ["pt-BR", undefined] as const) {
    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      const { texto, status } = await pedirTranscricao(bytes, mime, apiKey, idioma);
      if (texto && transcricaoValida(texto)) return texto;
      const repetir = status === 429 || status >= 500 || status === 0;
      if (!repetir) break;
      if (tentativa === 1) await esperar(1200);
    }
  }
  return null;
}


/**
 * Áudio enviado pelo atendente: baixa o arquivo recém-guardado, transcreve e
 * devolve o corpo no formato de player de áudio (melhor esforço — se a
 * transcrição falhar, o áudio entra só com o player).
 */
export async function outboundAudioBody(input: {
  url: string;
  mimeType?: string | null;
}): Promise<string> {
  let transcript: string | null = null;
  try {
    const res = await fetch(input.url);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime =
        res.headers.get("content-type")?.split(";")[0]?.trim() ||
        (input.mimeType ?? "").split(";")[0]?.trim() ||
        "audio/ogg";
      if (bytes.byteLength >= 256) transcript = await transcribeAudio(bytes, mime);
    }
  } catch (error) {
    console.error("[audio] transcrição do áudio enviado falhou:", (error as Error).message);
  }
  return audioMessageBody({ url: input.url, transcript });
}

/** Monta o corpo da mensagem de áudio no formato que a central entende. */
export function audioMessageBody(stored: { url: string; transcript: string | null }) {
  const lines = [`🎵 Áudio: ${stored.url}`];
  if (stored.transcript) lines.push(`🗣 Transcrição: ${stored.transcript}`);
  return lines.join("\n");
}
