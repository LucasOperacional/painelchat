// Recebimento de figurinhas e imagens do WhatsApp: guarda o arquivo na central
// para exibir na conversa. Uso exclusivo no servidor.

const EXT_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

function extFor(mime: string) {
  return EXT_BY_MIME[mime.split(";")[0]!.trim().toLowerCase()] ?? "webp";
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

async function bytesFromInput(input: { base64?: string | null; url?: string | null }, usableUrl: string | null) {
  const decoded = input.base64 ? base64ToBytes(input.base64) : null;
  if (decoded) return decoded;
  if (!usableUrl) return null;
  const res = await fetch(usableUrl);
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

function absoluteMediaUrl(value?: string | null): string | null {
  const url = value?.trim();
  if (!url) return null;
  const full = url.startsWith("//") ? `https:${url}` : url;
  if (!/^https?:\/\//i.test(full)) return null;
  // Endereço interno do servidor do provedor (localhost/rede privada): não serve
  // nem para baixar nem para exibir na conversa.
  try {
    const host = new URL(full).hostname;
    if (
      /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i.test(
        host,
      )
    )
      return null;
  } catch {
    return null;
  }
  return full;
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

/** Baixa (ou decodifica) a imagem/figurinha recebida e devolve um link para exibir. */
export async function storeInboundImage(input: {
  phoneDigits: string;
  mimeType?: string | null;
  base64?: string | null;
  url?: string | null;
  folder?: string;
}): Promise<string | null> {
  let bytes: Uint8Array | null = null;
  let mime = (input.mimeType ?? "").split(";")[0]?.trim() || "image/webp";
  const normalizedUrl = absoluteMediaUrl(input.url);
  const usableUrl = normalizedUrl && !isEncryptedWhatsappUrl(normalizedUrl) ? normalizedUrl : null;

  try {
    bytes = await bytesFromInput(input, usableUrl);
    if (bytes && usableUrl && !input.base64) {
      const res = await fetch(usableUrl, { method: "HEAD" }).catch(() => null);
      const headerMime = res?.headers.get("content-type");
      if (headerMime?.startsWith("image/")) mime = headerMime.split(";")[0]!.trim();
    }
  } catch (error) {
    console.error("[midia] falha ao obter a imagem recebida:", (error as Error).message);
  }

  if (!bytes || bytes.byteLength < 64) return usableUrl;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const folder = input.folder ?? "imagens";
  const path = `recebidos/${folder}/${input.phoneDigits}/${crypto.randomUUID()}.${extFor(mime)}`;
  const upload = await supabaseAdmin.storage
    .from("anexos")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) {
    console.error("[midia] falha ao guardar a imagem:", upload.error.message);
    return usableUrl;
  }

  const signed = await supabaseAdmin.storage
    .from("anexos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("[midia] falha ao criar o link da imagem:", signed.error?.message);
    return usableUrl;
  }
  return signed.data.signedUrl;
}

const VIDEO_EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "video/x-matroska": "mkv",
};

/** Baixa (ou decodifica) o vídeo recebido e devolve um link para exibir. */
export async function storeInboundVideo(input: {
  phoneDigits: string;
  mimeType?: string | null;
  base64?: string | null;
  url?: string | null;
}): Promise<string | null> {
  let bytes: Uint8Array | null = null;
  let mime = (input.mimeType ?? "").split(";")[0]?.trim() || "video/mp4";
  const normalizedUrl = absoluteMediaUrl(input.url);
  const usableUrl = normalizedUrl && !isEncryptedWhatsappUrl(normalizedUrl) ? normalizedUrl : null;

  try {
    bytes = await bytesFromInput(input, usableUrl);
    if (bytes && usableUrl && !input.base64) {
      const res = await fetch(usableUrl, { method: "HEAD" }).catch(() => null);
      const headerMime = res?.headers.get("content-type");
      if (headerMime?.startsWith("video/")) mime = headerMime.split(";")[0]!.trim();
    }
  } catch (error) {
    console.error("[midia] falha ao obter o vídeo recebido:", (error as Error).message);
  }

  if (!bytes || bytes.byteLength < 64) return usableUrl;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ext = VIDEO_EXT_BY_MIME[mime.toLowerCase()] ?? "mp4";
  const path = `recebidos/videos/${input.phoneDigits}/${crypto.randomUUID()}.${ext}`;
  const upload = await supabaseAdmin.storage
    .from("anexos")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) {
    console.error("[midia] falha ao guardar o vídeo:", upload.error.message);
    return usableUrl;
  }

  const signed = await supabaseAdmin.storage
    .from("anexos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("[midia] falha ao criar o link do vídeo:", signed.error?.message);
    return usableUrl;
  }
  return signed.data.signedUrl;
}

function safeFileName(value: string) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(-120);
  return cleaned || "documento.pdf";
}

/** Guarda documentos recebidos e devolve um link temporário para abrir ou baixar. */
export async function storeInboundDocument(input: {
  phoneDigits: string;
  fileName?: string | null;
  mimeType?: string | null;
  base64?: string | null;
  url?: string | null;
}): Promise<{ name: string; url: string } | null> {
  let bytes: Uint8Array | null = null;
  let mime = (input.mimeType ?? "").split(";")[0]?.trim() || "application/octet-stream";
  const name = safeFileName(input.fileName ?? (mime === "application/pdf" ? "documento.pdf" : "documento"));
  const normalizedUrl = absoluteMediaUrl(input.url);
  const usableUrl = normalizedUrl && !isEncryptedWhatsappUrl(normalizedUrl) ? normalizedUrl : null;

  try {
    bytes = await bytesFromInput(input, usableUrl);
    if (bytes && usableUrl && !input.base64) {
      const res = await fetch(usableUrl, { method: "HEAD" }).catch(() => null);
      const headerMime = res?.headers.get("content-type");
      if (headerMime) mime = headerMime.split(";")[0]?.trim() || mime;
    }
  } catch (error) {
    console.error("[midia] falha ao obter o documento recebido:", (error as Error).message);
  }

  if (!bytes || bytes.byteLength < 16) {
    return usableUrl ? { name, url: usableUrl } : null;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `recebidos/documentos/${input.phoneDigits}/${crypto.randomUUID()}-${name}`;
  const upload = await supabaseAdmin.storage
    .from("anexos")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error) {
    console.error("[midia] falha ao guardar o documento:", upload.error.message);
    return usableUrl ? { name, url: usableUrl } : null;
  }

  const signed = await supabaseAdmin.storage
    .from("anexos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signed.error || !signed.data?.signedUrl) {
    console.error("[midia] falha ao criar o link do documento:", signed.error?.message);
    return usableUrl ? { name, url: usableUrl } : null;
  }
  return { name, url: signed.data.signedUrl };
}

/** Corpo da mensagem de vídeo no formato que a central entende. */
export function videoMessageBody(url: string, caption?: string | null) {
  const lines = [`🎬 Vídeo: ${url}`];
  if (caption?.trim()) lines.push(caption.trim());
  return lines.join("\n");
}

/** Corpo de documento no formato que a conversa transforma em cartão. */
export function documentMessageBody(name: string, url: string, caption?: string | null) {
  const lines = [`📎 ${name}: ${url}`];
  if (caption?.trim()) lines.push(caption.trim());
  return lines.join("\n");
}

/** Corpo da mensagem de figurinha no formato que a central entende. */
export function stickerMessageBody(url: string) {
  return `🖼 Figurinha: ${url}`;
}

/** Corpo da mensagem de imagem no formato que a central entende. */
export function imageMessageBody(url: string, caption?: string | null) {
  const lines = [`🖼 Imagem: ${url}`];
  if (caption?.trim()) lines.push(caption.trim());
  return lines.join("\n");
}
