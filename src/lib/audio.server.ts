// Recebimento de áudios do WhatsApp: guarda o arquivo na central e transcreve.
// Uso exclusivo no servidor.

import { fetchResiliente } from "./http.server";

const DOWNLOAD_TIMEOUT_MS = 30_000;

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
      const res = await fetchResiliente(
        usableUrl,
        {},
        { label: "o servidor do áudio", timeoutMs: DOWNLOAD_TIMEOUT_MS },
      );
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

  // O áudio já está guardado e com link: a transcrição é um extra e não pode,
  // em nenhuma hipótese, impedir a mensagem de chegar na conversa.
  let transcript: string | null = null;
  try {
    transcript = await transcribeAudio(bytes, mime);
  } catch (error) {
    console.error("[audio] transcrição falhou:", (error as Error).message);
  }
  return { url: signed.data.signedUrl, transcript };
}

/** Transcrição do áudio com a IA da plataforma (melhor esforço, nunca travando o webhook). */
const MODELO_TRANSCRICAO = "google/gemini-3.5-transcribe";
const LIMITE_TRANSCRICAO_BYTES = 14 * 1024 * 1024; // limite do modelo de transcrição
/** Prazo de uma tentativa. */
const LIMITE_TRANSCRICAO_MS = 25_000;
/**
 * Prazo de TODAS as tentativas somadas. A transcrição roda dentro do webhook, e
 * o servidor corta a requisição se ela demorar demais — quando isso acontecia, a
 * mensagem de áudio inteira se perdia. Com o orçamento abaixo a transcrição
 * desiste sozinha em tempo de o áudio ainda entrar na conversa.
 */
const ORCAMENTO_TRANSCRICAO_MS = 45_000;

/** O modelo só aceita arquivos declarados como áudio (o navegador às vezes marca vídeo). */
function mimeParaTranscricao(mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (base.startsWith("audio/")) return base;
  if (base === "video/webm") return "audio/webm";
  if (base === "video/mp4" || base === "video/quicktime") return "audio/mp4";
  return "audio/ogg";
}

/** Pesca o texto da transcrição em qualquer um dos formatos que a plataforma usa. */
function textoDoEvento(evento: unknown): string | null {
  if (!evento || typeof evento !== "object") return null;
  const e = evento as Record<string, unknown>;
  for (const campo of ["text", "transcript", "delta"]) {
    const valor = e[campo];
    if (typeof valor === "string" && valor.trim()) return valor;
  }
  // Formato de conversa: { choices: [{ message | delta: { content } }] }
  const choices = e["choices"];
  if (Array.isArray(choices)) {
    for (const escolha of choices) {
      if (!escolha || typeof escolha !== "object") continue;
      const c = escolha as Record<string, unknown>;
      for (const onde of ["message", "delta"]) {
        const bloco = c[onde] as Record<string, unknown> | undefined;
        const conteudo = bloco?.["content"];
        if (typeof conteudo === "string" && conteudo.trim()) return conteudo;
      }
    }
  }
  return null;
}

/** Lê a resposta, seja ela JSON de uma vez ou em fluxo (SSE). */
async function lerTranscricao(res: Response): Promise<string | null> {
  const tipo = res.headers.get("content-type") ?? "";
  const bruto = await res.text();
  if (!bruto.trim()) return null;

  // Resposta única: pode vir como JSON ou como texto puro (response_format=text).
  if (!tipo.includes("event-stream") && !bruto.startsWith("data:")) {
    if (!tipo.includes("json")) {
      try {
        const direto = textoDoEvento(JSON.parse(bruto));
        if (direto) return direto.trim();
      } catch {
        // não era JSON: é o próprio texto da fala
      }
      return bruto.trim() || null;
    }
    let dados: unknown = null;
    try {
      dados = JSON.parse(bruto);
    } catch {
      return null;
    }
    return textoDoEvento(dados)?.trim() || null;
  }

  // Fluxo SSE: junta os pedaços (delta) e prefere um texto completo, se vier.
  let acumulado = "";
  let completo: string | null = null;
  for (const linha of bruto.split("\n")) {
    if (!linha.startsWith("data:")) continue;
    const carga = linha.slice(5).trim();
    if (!carga || carga === "[DONE]") continue;
    let evento: unknown;
    try {
      evento = JSON.parse(carga);
    } catch {
      continue; // linha parcial: ignora
    }
    const e = evento as Record<string, unknown>;
    const delta = e["delta"];
    if (typeof delta === "string") {
      acumulado += delta;
      continue;
    }
    const pedaco = textoDoEvento(evento);
    if (pedaco) completo = pedaco;
  }
  const final = (completo ?? acumulado).trim();
  return final || null;
}

/** Descarta respostas sem fala de verdade ("...", "[inaudível]", ruídos). */
function transcricaoValida(texto: string): boolean {
  const limpo = texto.replace(/[\s.…]+/g, "");
  if (limpo.length < 2) return false;
  if (/^\[.*\]$/.test(texto.trim())) return false;
  // Qualquer letra ou número de qualquer idioma (a faixa antiga deixava de fora
  // acentos comuns, como o trema, e recusava transcrições boas).
  return /[\p{L}\p{N}]/u.test(texto);
}

/** Explica a falha em português, para o log ajudar quem for olhar depois. */
function motivoDaFalha(status: number): string {
  if (status === 401 || status === 403) return "chave da IA recusada (verifique LOVABLE_API_KEY)";
  if (status === 402) return "sem créditos de IA no espaço de trabalho";
  if (status === 404) return `modelo não encontrado (${MODELO_TRANSCRICAO})`;
  if (status === 413) return "áudio recusado por tamanho";
  if (status === 429) return "limite de uso da IA atingido";
  if (status >= 500) return "instabilidade do serviço de IA";
  return `resposta inesperada (${status})`;
}

async function pedirTranscricao(
  bytes: Uint8Array,
  mime: string,
  apiKey: string,
  prazoMs: number,
  idioma?: string,
): Promise<{ texto: string | null; status: number }> {
  const controller = new AbortController();
  const parar = setTimeout(() => controller.abort(), prazoMs);
  try {
    const envio = mimeParaTranscricao(mime);
    const form = new FormData();
    form.append("model", MODELO_TRANSCRICAO);
    // Resposta de uma vez: pedir JSON e fluxo ao mesmo tempo deixava a leitura
    // adivinhando o formato, e o texto às vezes se perdia.
    form.append("response_format", "json");
    form.append("stream", "false");
    if (idioma) form.append("language", idioma);
    form.append("file", new Blob([bytes as BlobPart], { type: envio }), `audio.${extFor(envio)}`);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        // A plataforma também aceita a chave neste cabeçalho; mandar os dois
        // evita depender de qual deles o gateway está exigindo hoje.
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detalhe = (await res.text().catch(() => "")).slice(0, 300);
      console.error(
        `[audio] transcrição falhou: ${motivoDaFalha(res.status)} — HTTP ${res.status} ${detalhe}`,
      );
      return { texto: null, status: res.status };
    }
    return { texto: await lerTranscricao(res), status: res.status };
  } catch (error) {
    const msg = (error as Error).name === "AbortError" ? "tempo esgotado" : (error as Error).message;
    console.error("[audio] transcrição falhou:", msg);
    return { texto: null, status: 0 };
  } finally {
    clearTimeout(parar);
  }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function transcribeAudio(bytes: Uint8Array, mime: string): Promise<string | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    console.warn("[audio] sem LOVABLE_API_KEY: o áudio entra sem transcrição.");
    return null;
  }
  if (bytes.byteLength < 1024) return null;
  if (bytes.byteLength > LIMITE_TRANSCRICAO_BYTES) {
    console.warn("[audio] áudio grande demais para transcrever:", bytes.byteLength);
    return null;
  }

  const comecou = Date.now();
  const restante = () => ORCAMENTO_TRANSCRICAO_MS - (Date.now() - comecou);

  // 1ª tentativa em português; instabilidade passageira é repetida; se vier vazio,
  // tenta de novo deixando o modelo detectar o idioma sozinho. Tudo dentro do
  // orçamento de tempo, para o áudio nunca deixar de aparecer na conversa.
  for (const idioma of ["pt-BR", undefined] as const) {
    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      const prazo = Math.min(LIMITE_TRANSCRICAO_MS, restante());
      if (prazo < 3_000) {
        console.warn("[audio] sem tempo para transcrever: o áudio entra sem a transcrição.");
        return null;
      }
      const { texto, status } = await pedirTranscricao(bytes, mime, apiKey, prazo, idioma);
      if (texto && transcricaoValida(texto)) return texto;
      const repetir = status === 429 || status >= 500 || status === 0;
      // Chave, créditos ou modelo errado não melhoram tentando de novo, em
      // idioma nenhum: desiste na hora em vez de gastar o tempo do webhook.
      const definitivo = status >= 400 && status < 500 && !repetir;
      if (definitivo) return null;
      if (!repetir) break;
      if (tentativa === 1 && restante() > 5_000) await esperar(1200);
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
    const res = await fetchResiliente(
      input.url,
      {},
      { label: "o servidor do áudio", timeoutMs: DOWNLOAD_TIMEOUT_MS },
    );
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
