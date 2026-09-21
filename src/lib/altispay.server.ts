// Integração AltisPay — gateway de pagamentos PIX.
// Docs: https://app.altispay.com.br/docs
// Produção: https://app.altispay.com.br/api/v1 — Sandbox: https://sandbox.altispay.com.br/api/v1
// Autenticação por header X-Api-Key (altis_… / altis_sandbox_…).
// Uso exclusivo no servidor.

const PROD_BASE_URL = "https://app.altispay.com.br/api/v1";
const SANDBOX_BASE_URL = "https://sandbox.altispay.com.br/api/v1";
const PROVIDER = "altispay";

export type AltispayEnvironment = "producao" | "sandbox";

export type AltispayCredentials = {
  apiKey: string;
  baseUrl: string;
  environment: AltispayEnvironment;
  defaultPayerName: string;
  defaultPayerDocument: string;
  defaultPayerEmail: string;
  webhookToken: string;
};

type SecretRow = {
  api_key?: string | null;
  base_url?: string | null;
  environment?: string | null;
  default_payer_name?: string | null;
  default_payer_document?: string | null;
  default_payer_email?: string | null;
  webhook_token?: string | null;
};

export function altispayDefaultBaseUrl(environment: AltispayEnvironment) {
  return environment === "sandbox" ? SANDBOX_BASE_URL : PROD_BASE_URL;
}

export async function loadAltispayCredentials(): Promise<AltispayCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("altispay_secrets")
    .select(
      "api_key, base_url, environment, default_payer_name, default_payer_document, default_payer_email, webhook_token",
    )
    .eq("provider", PROVIDER)
    .maybeSingle();

  const row = (data ?? null) as SecretRow | null;
  const apiKey = row?.api_key?.trim() || process.env["ALTISPAY_API_KEY"]?.trim() || "";
  if (!apiKey) return null;

  const environment: AltispayEnvironment =
    row?.environment === "sandbox" || apiKey.startsWith("altis_sandbox_") ? "sandbox" : "producao";

  return {
    apiKey,
    baseUrl: (row?.base_url?.trim() || altispayDefaultBaseUrl(environment)).replace(/\/+$/, ""),
    environment,
    defaultPayerName: row?.default_payer_name?.trim() || "",
    defaultPayerDocument: (row?.default_payer_document ?? "").replace(/\D/g, ""),
    defaultPayerEmail: row?.default_payer_email?.trim() || "",
    webhookToken: row?.webhook_token?.trim() || process.env["ALTISPAY_WEBHOOK_TOKEN"]?.trim() || "",
  };
}

export async function saveAltispayCredentials(input: {
  apiKey: string;
  baseUrl?: string;
  environment?: AltispayEnvironment;
  defaultPayerName?: string;
  defaultPayerDocument?: string;
  defaultPayerEmail?: string;
  webhookToken?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const environment: AltispayEnvironment = input.environment === "sandbox" ? "sandbox" : "producao";
  const { error } = await supabaseAdmin.from("altispay_secrets").upsert(
    {
      provider: PROVIDER,
      environment,
      base_url: input.baseUrl?.trim()
        ? input.baseUrl.trim().replace(/\/+$/, "")
        : altispayDefaultBaseUrl(environment),
      default_payer_name: input.defaultPayerName?.trim() || null,
      default_payer_document: input.defaultPayerDocument?.replace(/\D/g, "") || null,
      default_payer_email: input.defaultPayerEmail?.trim() || null,
      updated_at: new Date().toISOString(),
      ...(input.apiKey?.trim() ? { api_key: input.apiKey.trim() } : {}),
      ...(input.webhookToken?.trim() ? { webhook_token: input.webhookToken.trim() } : {}),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

export async function clearAltispayCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("altispay_secrets")
    .delete()
    .eq("provider", PROVIDER);
  if (error) throw new Error(error.message);
}

function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const raw = b["message"] ?? b["error"] ?? b["detail"] ?? b["errors"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw) return JSON.stringify(raw).slice(0, 400);
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 400);
  if (status === 401 || status === 403) return "Chave de API da AltisPay inválida ou sem permissão.";
  if (status === 429) return "Limite de requisições da AltisPay atingido. Tente novamente em instantes.";
  return `A AltisPay respondeu com erro ${status}.`;
}

export async function altispayRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const creds = await loadAltispayCredentials();
  if (!creds) {
    throw new Error(
      "Cadastre a chave de API da AltisPay em Configurações para gerar cobranças Pix.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${creds.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "X-Api-Key": creds.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const err = error as Error;
    throw new Error(
      err.name === "AbortError"
        ? "A AltisPay não respondeu no tempo esperado."
        : `Falha ao falar com a AltisPay: ${err.message}`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* mantém texto cru */
  }
  if (!res.ok) throw new Error(messageFromBody(parsed, res.status));
  return parsed as T;
}

export type AltispayCharge = {
  id: string;
  amount: number;
  status: string;
  copyPaste: string;
  qrCodeUrl: string;
  qrCodeBase64: string | null;
};

type ChargeResponse = {
  id?: string;
  status?: string;
  value?: number;
  billing_type?: string;
  external_reference?: string | null;
  pix?: {
    payload?: string | null;
    encoded_image?: string | null;
    expiration_date?: string | null;
  } | null;
  data?: Record<string, unknown>;
};

function unwrap(res: ChargeResponse | null | undefined): ChargeResponse {
  if (res?.data && typeof res.data === "object" && (res.data as ChargeResponse).id) {
    return res.data as ChargeResponse;
  }
  return res ?? {};
}

/** Cria uma cobrança Pix e devolve copia e cola + QR Code. */
export async function altispayCreateCharge(input: {
  amount: number;
  description: string;
  payerName: string;
  payerDocument: string;
  payerEmail?: string;
  externalReference: string;
}): Promise<AltispayCharge> {
  const customer: Record<string, string> = { name: input.payerName };
  const document = input.payerDocument.replace(/\D/g, "");
  if (document) customer["cpf_cnpj"] = document;
  if (input.payerEmail) customer["email"] = input.payerEmail;

  const res = unwrap(
    await altispayRequest<ChargeResponse>("/charges", {
      method: "POST",
      body: {
        billing_type: "PIX",
        value: input.amount,
        description: input.description,
        external_reference: input.externalReference,
        customer,
      },
    }),
  );

  const copyPaste = res.pix?.payload?.trim() ?? "";
  if (!copyPaste) throw new Error("A AltisPay não retornou o código Pix copia e cola.");

  return {
    id: String(res.id ?? input.externalReference),
    amount: input.amount,
    status: res.status ?? "PENDING",
    copyPaste,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(
      copyPaste,
    )}`,
    qrCodeBase64: res.pix?.encoded_image ?? null,
  };
}

/** Consulta o status de uma cobrança. */
export async function altispayCheckCharge(chargeId: string) {
  return await altispayRequest<ChargeResponse>(`/charges/${encodeURIComponent(chargeId)}`);
}

/** Normaliza o status: RECEIVED/CONFIRMED significam pago. */
export function altispayChargeStatus(res: ChargeResponse | null | undefined) {
  const data = unwrap(res);
  const status = String(data.status ?? "").trim().toUpperCase();
  if (status === "RECEIVED" || status === "CONFIRMED" || status === "PAID") return "pago";
  return status.toLowerCase();
}
