// Integração MisticPay — gateway de pagamentos PIX.
// Docs: https://docs.misticpay.com/ (base https://api.misticpay.com/api)
// Uso exclusivo no servidor.

const DEFAULT_BASE_URL = "https://api.misticpay.com/api";
const PROVIDER = "misticpay";

export type MisticpayCredentials = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  /** "basic" = chave de acesso pk_/sk_ ; "cics" = credencial legada ci/cs. */
  authMode: "basic" | "cics";
  defaultPayerName: string;
  defaultPayerDocument: string;
};

type SecretRow = {
  client_id?: string | null;
  client_secret?: string | null;
  base_url?: string | null;
  auth_mode?: string | null;
  default_payer_name?: string | null;
  default_payer_document?: string | null;
};

export async function loadMisticpayCredentials(): Promise<MisticpayCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("misticpay_secrets")
    .select(
      "client_id, client_secret, base_url, auth_mode, default_payer_name, default_payer_document",
    )
    .eq("provider", PROVIDER)
    .maybeSingle();

  const row = (data ?? null) as SecretRow | null;
  const clientId = row?.client_id?.trim() || process.env["MISTICPAY_CLIENT_ID"]?.trim() || "";
  const clientSecret =
    row?.client_secret?.trim() || process.env["MISTICPAY_CLIENT_SECRET"]?.trim() || "";
  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    baseUrl: (row?.base_url?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    // Detecta o tipo pelo prefixo da chave (ci_/cs_ = legado, pk_/sk_ = basic)
    // para não quebrar quando o tipo salvo estiver errado.
    authMode: /^ci[_-]/i.test(clientId)
      ? "cics"
      : /^pk[_-]/i.test(clientId)
        ? "basic"
        : row?.auth_mode === "cics"
          ? "cics"
          : "basic",
    defaultPayerName: row?.default_payer_name?.trim() || "",
    defaultPayerDocument: (row?.default_payer_document ?? "").replace(/\D/g, ""),
  };
}

export async function saveMisticpayCredentials(input: {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  authMode?: "basic" | "cics";
  defaultPayerName?: string;
  defaultPayerDocument?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("misticpay_secrets").upsert(
    {
      provider: PROVIDER,
      client_id: input.clientId.trim(),
      client_secret: input.clientSecret.trim(),
      base_url: input.baseUrl?.trim()
        ? input.baseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_BASE_URL,
      auth_mode: input.authMode === "cics" ? "cics" : "basic",
      default_payer_name: input.defaultPayerName?.trim() || null,
      default_payer_document: input.defaultPayerDocument?.replace(/\D/g, "") || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

export async function clearMisticpayCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("misticpay_secrets")
    .delete()
    .eq("provider", PROVIDER);
  if (error) throw new Error(error.message);
}

function authHeaders(creds: MisticpayCredentials): Record<string, string> {
  if (creds.authMode === "cics") {
    return { ci: creds.clientId, cs: creds.clientSecret };
  }
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  return { Authorization: `Basic ${basic}` };
}

function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const raw = b["error"] ?? b["message"] ?? b["detail"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw) return JSON.stringify(raw).slice(0, 400);
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 400);
  if (status === 401 || status === 403) return "Credenciais da MisticPay inválidas ou sem permissão.";
  if (status === 429) return "Limite de requisições da MisticPay atingido. Tente novamente em instantes.";
  return `A MisticPay respondeu com erro ${status}.`;
}

export async function misticpayRequest<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const creds = await loadMisticpayCredentials();
  if (!creds) {
    throw new Error(
      "Cadastre as credenciais da MisticPay em Configurações para gerar cobranças Pix.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${creds.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...authHeaders(creds),
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
        ? "A MisticPay não respondeu no tempo esperado."
        : `Falha ao falar com a MisticPay: ${err.message}`,
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

export type MisticpayCharge = {
  transactionId: string;
  amount: number;
  status: string;
  copyPaste: string;
  qrCodeUrl: string;
  qrCodeBase64: string | null;
};

type MisticpayCheckResponse = {
  message?: string;
  transaction?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

/** Normaliza o status retornado pelas versões atual e legada da MisticPay. */
export function misticpayTransactionStatus(response: MisticpayCheckResponse | null | undefined) {
  const transaction = response?.transaction;
  const data = response?.data;
  const nestedTransaction =
    data?.["transaction"] && typeof data["transaction"] === "object"
      ? (data["transaction"] as Record<string, unknown>)
      : null;
  const status =
    transaction?.["transactionState"] ??
    transaction?.["status"] ??
    nestedTransaction?.["transactionState"] ??
    nestedTransaction?.["status"] ??
    data?.["transactionState"] ??
    data?.["status"] ??
    data?.["state"] ??
    "";
  return typeof status === "string" || typeof status === "number" ? String(status).trim() : "";
}

type CreateResponse = {
  message?: string;
  data?: {
    transactionId?: string | number;
    transactionAmount?: number;
    transactionState?: string;
    qrCodeBase64?: string | null;
    qrcodeUrl?: string | null;
    copyPaste?: string | null;
  };
};

/** Cria uma cobrança Pix (cash-in) e devolve copia e cola + QR Code. */
export async function misticpayCreateCharge(input: {
  amount: number;
  payerName: string;
  payerDocument: string;
  description: string;
  transactionId: string;
  projectWebhook?: string;
}): Promise<MisticpayCharge> {
  const res = await misticpayRequest<CreateResponse>("/transactions/create", {
    method: "POST",
    body: {
      amount: input.amount,
      payerName: input.payerName,
      payerDocument: input.payerDocument.replace(/\D/g, ""),
      transactionId: input.transactionId,
      description: input.description,
      ...(input.projectWebhook ? { projectWebhook: input.projectWebhook } : {}),
    },
  });

  const data = res?.data;
  const copyPaste = data?.copyPaste?.trim() ?? "";
  if (!copyPaste) throw new Error("A MisticPay não retornou o código Pix copia e cola.");

  const qrCodeUrl =
    data?.qrcodeUrl?.trim() ||
    `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(copyPaste)}`;

  return {
    transactionId: String(data?.transactionId ?? input.transactionId),
    amount: input.amount,
    status: data?.transactionState ?? "PENDENTE",
    copyPaste,
    qrCodeUrl,
    qrCodeBase64: data?.qrCodeBase64 ?? null,
  };
}

/** Consulta o status de uma cobrança. */
export async function misticpayCheckCharge(transactionId: string) {
  return await misticpayRequest<MisticpayCheckResponse>(
    "/transactions/check",
    { method: "POST", body: { transactionId } },
  );
}

export type MisticpayPixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

type WithdrawResponse = {
  message?: string;
  data?: {
    jobId?: string;
    transactionId?: string | number;
    status?: string;
    message?: string;
  };
};

/** Envia um Pix (cash-out) para uma chave. O valor sai do saldo da conta. */
export async function misticpayWithdraw(input: {
  amount: number;
  pixKey: string;
  pixKeyType: MisticpayPixKeyType;
  description: string;
  projectWebhook?: string;
}) {
  const res = await misticpayRequest<WithdrawResponse>("/transactions/withdraw", {
    method: "POST",
    body: {
      amount: input.amount,
      pixKey: input.pixKey,
      pixKeyType: input.pixKeyType,
      description: input.description,
      ...(input.projectWebhook ? { projectWebhook: input.projectWebhook } : {}),
    },
  });

  return {
    transactionId: String(res?.data?.transactionId ?? res?.data?.jobId ?? ""),
    status: res?.data?.status ?? "QUEUED",
    message: res?.data?.message ?? res?.message ?? "",
  };
}

/** Paga um QR Code Pix estático (copia e cola) com o saldo da conta. */
export async function misticpayWithdrawQrcode(input: {
  qrCode: string;
  amount?: number;
  description: string;
  projectWebhook?: string;
}) {
  const res = await misticpayRequest<WithdrawResponse>("/transactions/withdraw/qrcode", {
    method: "POST",
    body: {
      qrCode: input.qrCode,
      ...(input.amount ? { amount: input.amount } : {}),
      description: input.description,
      ...(input.projectWebhook ? { projectWebhook: input.projectWebhook } : {}),
    },
  });

  return {
    transactionId: String(res?.data?.transactionId ?? res?.data?.jobId ?? ""),
    status: res?.data?.status ?? "QUEUED",
    message: res?.data?.message ?? res?.message ?? "",
  };
}

/** Saldo disponível na conta MisticPay (em reais). */
export async function misticpayBalance(): Promise<number | null> {
  const res = await misticpayRequest<{ data?: { availableBalance?: number } }>("/users/info");
  const value = res?.data?.availableBalance;
  return typeof value === "number" ? value : null;
}
