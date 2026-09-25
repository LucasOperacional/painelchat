// Integração Efí Bank (Efí Pay) — API Pix.
// Docs: https://dev.efipay.com.br/docs/api-pix/credenciais
//
// A Efí exige certificado digital (.p12) em todas as chamadas — algo que o
// runtime deste sistema não consegue apresentar. Por isso as requisições são
// enviadas para um intermediário (relay) hospedado pelo cliente, que guarda o
// certificado e repassa a chamada para a Efí mantendo caminho, método, corpo e
// cabeçalho Authorization.
//
// Uso exclusivo no servidor.

const EFI_PRODUCTION = "https://pix.api.efipay.com.br";
const EFI_SANDBOX = "https://pix-h.api.efipay.com.br";
const PROVIDER = "efi";

export type EfiEnvironment = "producao" | "homologacao";

export type EfiCredentials = {
  clientId: string;
  clientSecret: string;
  environment: EfiEnvironment;
  pixKey: string;
  /** Endereço do intermediário que possui o certificado .p12 da Efí. */
  relayUrl: string;
  relayToken: string;
  expirationSeconds: number;
  /** Certificado .p12 da conta Efí em base64 (repassado ao intermediário). */
  certificateP12: string;
  certificateName: string;
  certificatePassword: string;
};

type SecretRow = {
  client_id?: string | null;
  client_secret?: string | null;
  environment?: string | null;
  pix_key?: string | null;
  relay_url?: string | null;
  relay_token?: string | null;
  expiration_seconds?: number | null;
  certificate_p12?: string | null;
  certificate_name?: string | null;
  certificate_password?: string | null;
};

export function efiOfficialBaseUrl(environment: EfiEnvironment) {
  return environment === "homologacao" ? EFI_SANDBOX : EFI_PRODUCTION;
}

export async function loadEfiCredentials(): Promise<EfiCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("efi_secrets")
    .select(
      "client_id, client_secret, environment, pix_key, relay_url, relay_token, expiration_seconds, certificate_p12, certificate_name, certificate_password",
    )
    .eq("provider", PROVIDER)
    .maybeSingle();

  const row = (data ?? null) as SecretRow | null;
  const clientId = row?.client_id?.trim() || process.env["EFI_CLIENT_ID"]?.trim() || "";
  const clientSecret =
    row?.client_secret?.trim() || process.env["EFI_CLIENT_SECRET"]?.trim() || "";
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    environment: row?.environment === "homologacao" ? "homologacao" : "producao",
    pixKey: row?.pix_key?.trim() || "",
    relayUrl: (row?.relay_url?.trim() || process.env["EFI_RELAY_URL"]?.trim() || "").replace(
      /\/+$/,
      "",
    ),
    relayToken: row?.relay_token?.trim() || process.env["EFI_RELAY_TOKEN"]?.trim() || "",
    expirationSeconds:
      row?.expiration_seconds && row.expiration_seconds > 0 ? row.expiration_seconds : 3600,
    certificateP12: row?.certificate_p12?.trim() || process.env["EFI_CERTIFICATE_P12"]?.trim() || "",
    certificateName: row?.certificate_name?.trim() || "",
    certificatePassword:
      row?.certificate_password ?? process.env["EFI_CERTIFICATE_PASSWORD"] ?? "",
  };
}

// O painel é servido em *.lovable.app — um intermediário nunca pode ser lá.
// Qualquer outro domínio (inclusive os do cliente) é um intermediário válido.
const OWN_HOSTS = /(^|\.)lovable\.app$/i;

export async function saveEfiCredentials(input: {
  clientId: string;
  clientSecret: string;
  environment: EfiEnvironment;
  pixKey?: string;
  relayUrl?: string;
  relayToken?: string;
  expirationSeconds?: number;
  certificateP12?: string;
  certificateName?: string;
  certificatePassword?: string | undefined;
}) {
  if (input.relayUrl?.trim()) {
    let host = "";
    try {
      host = new URL(input.relayUrl.trim()).hostname;
    } catch {
      throw new Error("Endereço do intermediário inválido.");
    }
    if (OWN_HOSTS.test(host)) {
      throw new Error(
        "O intermediário não pode ser o endereço do próprio painel. Informe o servidor intermediário que guarda o certificado da Efí.",
      );
    }
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("efi_secrets").upsert(
    {
      provider: PROVIDER,
      client_id: input.clientId.trim(),
      client_secret: input.clientSecret.trim(),
      environment: input.environment === "homologacao" ? "homologacao" : "producao",
      pix_key: input.pixKey?.trim() || null,
      relay_url: input.relayUrl?.trim().replace(/\/+$/, "") || null,
      relay_token: input.relayToken?.trim() || null,
      expiration_seconds:
        input.expirationSeconds && input.expirationSeconds > 0 ? input.expirationSeconds : 3600,
      ...(input.certificateP12?.trim()
        ? {
            certificate_p12: input.certificateP12.trim(),
            certificate_name: input.certificateName?.trim() || "certificado.p12",
          }
        : {}),
      ...(input.certificatePassword === undefined
        ? {}
        : { certificate_password: input.certificatePassword || null }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
  tokenCache = null;
}

export async function clearEfiCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("efi_secrets").delete().eq("provider", PROVIDER);
  if (error) throw new Error(error.message);
  tokenCache = null;
}

function baseUrlFor(creds: EfiCredentials) {
  return creds.relayUrl || efiOfficialBaseUrl(creds.environment);
}

function relayHeaders(creds: EfiCredentials): Record<string, string> {
  if (!creds.relayUrl) return {};
  const headers: Record<string, string> = {};
  if (creds.relayToken) headers["x-relay-token"] = creds.relayToken;
  // Diz ao intermediário em qual ambiente da Efí ele deve entregar o pedido.
  headers["x-efi-environment"] = creds.environment;
  // O intermediário usa o certificado enviado aqui para a conexão mTLS com a Efí.
  if (creds.certificateP12) {
    headers["x-efi-certificate"] = creds.certificateP12;
    if (creds.certificatePassword) {
      headers["x-efi-certificate-password"] = creds.certificatePassword;
    }
  }
  return headers;
}

function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const violations = b["violacoes"];
    if (Array.isArray(violations) && violations.length) {
      const first = violations[0] as Record<string, unknown>;
      const reason = first?.["razao"] ?? first?.["propriedade"];
      if (typeof reason === "string" && reason.trim()) return reason.trim();
    }
    const raw =
      b["mensagem"] ?? b["detail"] ?? b["error_description"] ?? b["message"] ?? b["error"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw) return JSON.stringify(raw).slice(0, 400);
  }
  if (typeof body === "string" && /<!doctype html|<html/i.test(body)) {
    return "O endereço do intermediário não é um intermediário da Efí (ele devolveu uma página de site). Use o endereço do seu servidor intermediário com o certificado, não o endereço do painel.";
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 400);
  if (status === 401 || status === 403) {
    return "A Efí recusou as credenciais ou o certificado do intermediário.";
  }
  if (status === 404) return "Recurso não encontrado na API da Efí.";
  return `A Efí respondeu com erro ${status}.`;
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function efiAccessToken(creds: EfiCredentials): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const res = await fetch(`${baseUrlFor(creds)}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      ...relayHeaders(creds),
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* resposta não-JSON (ex.: bloqueio do certificado) */
  }
  if (!res.ok) throw new Error(messageFromBody(body, res.status));

  const data = body as { access_token?: string; expires_in?: number };
  if (!data?.access_token) throw new Error("A Efí não retornou o token de acesso.");

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

/** Chamada autenticada à API Pix da Efí (através do intermediário, quando houver). */
export async function efiRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const creds = await loadEfiCredentials();
  if (!creds) {
    throw new Error("Cadastre as credenciais da Efí em Configurações → Efí Bank.");
  }

  const run = async (token: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
    try {
      return await fetch(`${baseUrlFor(creds)}${path}`, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...relayHeaders(creds),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response;
  try {
    res = await run(await efiAccessToken(creds));
    if (res.status === 401) {
      tokenCache = null;
      res = await run(await efiAccessToken(creds));
    }
  } catch (error) {
    const reason = (error as Error).name === "AbortError" ? "tempo esgotado" : (error as Error).message;
    throw new Error(
      creds.relayUrl
        ? `Não foi possível falar com o intermediário da Efí (${reason}).`
        : `Não foi possível falar com a Efí (${reason}).`,
    );
  }

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* mantém texto cru */
  }
  if (!res.ok) throw new Error(messageFromBody(body, res.status));
  return body as T;
}

export type EfiCharge = {
  txid: string;
  amount: number;
  status: string;
  copyPaste: string;
  qrCodeUrl: string;
  qrCodeBase64: string | null;
};

type CobResponse = {
  txid?: string;
  status?: string;
  valor?: { original?: string };
  loc?: { id?: number; location?: string };
  pixCopiaECola?: string;
};

type QrCodeResponse = { qrcode?: string; imagemQrcode?: string; linkVisualizacao?: string };

/** Cria uma cobrança imediata (POST /v2/cob) e devolve copia e cola + QR Code. */
export async function efiCreateCharge(input: {
  amount: number;
  description: string;
  payerName?: string;
  payerDocument?: string;
}): Promise<EfiCharge> {
  const creds = await loadEfiCredentials();
  if (!creds) throw new Error("Cadastre as credenciais da Efí em Configurações → Efí Bank.");
  if (!creds.pixKey) {
    throw new Error("Informe a chave Pix da conta Efí em Configurações → Efí Bank.");
  }

  const document = (input.payerDocument ?? "").replace(/\D/g, "");
  const devedor =
    document.length === 11
      ? { cpf: document, nome: input.payerName?.trim() || "Cliente" }
      : document.length === 14
        ? { cnpj: document, nome: input.payerName?.trim() || "Cliente" }
        : undefined;

  const cob = await efiRequest<CobResponse>("/v2/cob", {
    method: "POST",
    body: {
      calendario: { expiracao: creds.expirationSeconds },
      ...(devedor ? { devedor } : {}),
      valor: { original: input.amount.toFixed(2) },
      chave: creds.pixKey,
      solicitacaoPagador: input.description.slice(0, 140),
    },
  });

  const txid = cob?.txid?.trim();
  if (!txid) throw new Error("A Efí não retornou o identificador da cobrança.");

  let copyPaste = cob?.pixCopiaECola?.trim() ?? "";
  let qrCodeBase64: string | null = null;

  if (cob?.loc?.id) {
    try {
      const qr = await efiRequest<QrCodeResponse>(`/v2/loc/${cob.loc.id}/qrcode`);
      if (qr?.qrcode?.trim()) copyPaste = qr.qrcode.trim();
      qrCodeBase64 = qr?.imagemQrcode?.trim() || null;
    } catch {
      /* sem imagem: seguimos com o copia e cola */
    }
  }

  if (!copyPaste) throw new Error("A Efí não retornou o código Pix copia e cola.");

  return {
    txid,
    amount: input.amount,
    status: cob?.status ?? "ATIVA",
    copyPaste,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(copyPaste)}`,
    qrCodeBase64,
  };
}

/** Consulta o status de uma cobrança (GET /v2/cob/{txid}). */
export async function efiCheckCharge(txid: string) {
  return await efiRequest<CobResponse>(`/v2/cob/${encodeURIComponent(txid)}`);
}

/** "CONCLUIDA" quando o Pix foi pago. */
export function efiChargeStatus(res: { status?: string } | null | undefined) {
  return res?.status ?? "";
}
