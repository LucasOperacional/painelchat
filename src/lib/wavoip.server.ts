// Integração Wavoip — ligações de WhatsApp (Click To Call + API REST v2).
// Docs: https://wavoip.gitbook.io/api/api
// API: https://api.wavoip.com (rotas sob /v2, Bearer JWT de POST /v2/auth/login)
// Click To Call: https://app.wavoip.com/call?token=...&phone=...
// Uso exclusivo no servidor.

const PROVIDER = "wavoip";
const DEFAULT_BASE_URL = "https://api.wavoip.com";
const DEFAULT_CALL_URL = "https://app.wavoip.com/call";

export type WavoipCredentials = {
  deviceToken: string;
  email: string;
  password: string;
  baseUrl: string;
  callUrl: string;
  startIfReady: boolean;
  closeAfterCall: boolean;
};

export const wavoipDefaults = { baseUrl: DEFAULT_BASE_URL, callUrl: DEFAULT_CALL_URL };

export async function loadWavoipCredentials(): Promise<WavoipCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wavoip_secrets")
    .select("device_token, email, password, base_url, call_url, start_if_ready, close_after_call")
    .eq("provider", PROVIDER)
    .maybeSingle();

  const deviceToken = data?.device_token?.trim() || process.env["WAVOIP_DEVICE_TOKEN"]?.trim() || "";
  const email = data?.email?.trim() || process.env["WAVOIP_EMAIL"]?.trim() || "";
  const password = data?.password ?? process.env["WAVOIP_PASSWORD"] ?? "";
  if (!deviceToken && !email) return null;

  return {
    deviceToken,
    email,
    password,
    baseUrl: (data?.base_url?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    callUrl: (data?.call_url?.trim() || DEFAULT_CALL_URL).replace(/\/+$/, ""),
    startIfReady: data?.start_if_ready ?? true,
    closeAfterCall: data?.close_after_call ?? true,
  };
}

export async function saveWavoipCredentials(input: {
  deviceToken?: string;
  email?: string;
  password?: string;
  baseUrl?: string;
  callUrl?: string;
  startIfReady?: boolean;
  closeAfterCall?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("wavoip_secrets").upsert(
    {
      provider: PROVIDER,
      device_token: input.deviceToken?.trim() ?? "",
      email: input.email?.trim() ?? "",
      base_url: input.baseUrl?.trim()
        ? input.baseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_BASE_URL,
      call_url: input.callUrl?.trim()
        ? input.callUrl.trim().replace(/\/+$/, "")
        : DEFAULT_CALL_URL,
      start_if_ready: input.startIfReady ?? true,
      close_after_call: input.closeAfterCall ?? true,
      updated_at: new Date().toISOString(),
      ...(input.password ? { password: input.password } : {}),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
  tokenCache = null;
}

export async function clearWavoipCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("wavoip_secrets").delete().eq("provider", PROVIDER);
  tokenCache = null;
}

/** Monta a URL do Click To Call para um número em formato internacional. */
export function wavoipCallUrl(
  creds: WavoipCredentials,
  input: { phone: string; name?: string },
) {
  const phone = input.phone.replace(/\D/g, "");
  const params = new URLSearchParams({ token: creds.deviceToken, phone });
  if (input.name?.trim()) params.set("name", input.name.trim().slice(0, 60));
  if (creds.startIfReady) params.set("start_if_ready", "true");
  if (creds.closeAfterCall) params.set("close_after_call", "true");
  return `${creds.callUrl}?${params.toString()}`;
}

// ---- API REST (histórico de chamadas) ------------------------------------

let tokenCache: { token: string; expiresAt: number } | null = null;

async function wavoipToken(creds: WavoipCredentials) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  if (!creds.email || !creds.password) {
    throw new Error("Informe o e-mail e a senha da conta Wavoip para ler o histórico.");
  }
  const res = await fetch(`${creds.baseUrl}/v2/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as
    | { data?: { token?: string }; code?: string; message?: string }
    | null;
  if (!res.ok || !body?.data?.token) {
    if (body?.code === "WRONG_CREDENTIALS") {
      throw new Error("E-mail ou senha da Wavoip incorretos.");
    }
    throw new Error(body?.message || `Falha ao autenticar na Wavoip (${res.status}).`);
  }
  tokenCache = { token: body.data.token, expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000 };
  return body.data.token;
}

async function wavoipRequest<T>(
  creds: WavoipCredentials,
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const token = await wavoipToken(creds);
  const url = new URL(`${creds.baseUrl}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { code?: string; message?: string })
    | null;
  if (res.status === 401) {
    tokenCache = null;
    throw new Error("A sessão da Wavoip expirou. Tente novamente.");
  }
  if (res.status === 429) throw new Error("Muitas consultas à Wavoip. Aguarde alguns segundos.");
  if (!res.ok || !body) {
    throw new Error(body?.message || `Erro na Wavoip (${res.status}).`);
  }
  return body;
}

export type WavoipCall = {
  id: string;
  id_session: number | null;
  caller: string | null;
  receiver: string | null;
  status: string;
  reason: string | null;
  duration: number | null;
  record_status: string | null;
  type: string | null;
  direction: string | null;
  created_date: string;
};

export async function wavoipListCalls(
  creds: WavoipCredentials,
  query: { count?: number; cursor?: string; search?: string; direction?: string },
) {
  return wavoipRequest<{ data: WavoipCall[]; nextCursor: string | null }>(
    creds,
    "/v2/calls",
    {
      count: query.count ?? 30,
      cursor: query.cursor,
      search: query.search,
      direction: query.direction,
    },
  );
}

export async function wavoipListDevices(creds: WavoipCredentials) {
  return wavoipRequest<{ data: Array<Record<string, unknown>> }>(creds, "/v2/devices");
}
