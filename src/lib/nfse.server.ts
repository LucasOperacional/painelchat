// Integração GerandoNotaFácil — API REST de NFS-e.
// Docs: https://www.gerandonotafacil.com.br/api-reference
// Uso exclusivo no servidor.

const DEFAULT_BASE_URL = "https://hgnusnokkqfvasrkualk.supabase.co/functions/v1/api-nfse";
const PROVIDER = "gerandonotafacil";

export type NfseCredentials = { token: string; baseUrl: string };

export async function loadNfseCredentials(): Promise<NfseCredentials | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("nfse_secrets")
    .select("api_token, base_url")
    .eq("provider", PROVIDER)
    .maybeSingle();

  const row = data as { api_token?: string; base_url?: string | null } | null;
  const saved = row?.api_token?.trim();
  const token = saved || process.env["GERANDONOTAFACIL_TOKEN"]?.trim() || "";
  if (!token) return null;
  const baseUrl =
    row?.base_url?.trim() || process.env["GERANDONOTAFACIL_BASE_URL"]?.trim() || DEFAULT_BASE_URL;
  return { token, baseUrl: baseUrl.replace(/\/+$/, "") };
}

export async function saveNfseCredentials(token: string, baseUrl?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("nfse_secrets").upsert(
    {
      provider: PROVIDER,
      api_token: token.trim(),
      base_url: baseUrl?.trim() ? baseUrl.trim().replace(/\/+$/, "") : DEFAULT_BASE_URL,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

export async function clearNfseCredentials() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("nfse_secrets").delete().eq("provider", PROVIDER);
  if (error) throw new Error(error.message);
}

function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const raw = b["error"] ?? b["message"] ?? b["detail"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (raw && typeof raw === "object") return JSON.stringify(raw);
  }
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 400);
  if (status === 401) return "Token da GerandoNotaFácil inválido ou expirado.";
  if (status === 429) return "Limite de emissões do plano atingido. Tente novamente mais tarde.";
  return `A GerandoNotaFácil respondeu com erro ${status}.`;
}

export async function nfseRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const creds = await loadNfseCredentials();
  if (!creds) {
    throw new Error(
      "Falta cadastrar o token da GerandoNotaFácil para emitir e consultar notas fiscais.",
    );
  }

  const res = await fetch(`${creds.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* mantém texto cru */
  }

  if (!res.ok) throw new Error(messageFromBody(parsed, res.status));
  return parsed as T;
}
