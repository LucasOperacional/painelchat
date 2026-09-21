import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CF_API = "https://api.cloudflare.com/client/v4";
const DEFAULT_TARGET_IP = "185.158.133.1";

type Ctx = { supabase: { from: (table: string) => any }; userId: string };

async function papeis(context: Ctx) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

async function assertSuperAdmin(context: Ctx) {
  if (!(await papeis(context)).includes("superadmin")) {
    throw new Error("Apenas o superadmin pode configurar a Cloudflare.");
  }
}

/** Consultar/publicar endereços é permitido também ao administrador do painel. */
async function assertAdmin(context: Ctx) {
  const lista = await papeis(context);
  if (!lista.includes("superadmin") && !lista.includes("admin")) {
    throw new Error("Apenas administradores podem gerenciar os endereços.");
  }
}


function normalizeHost(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

type Credenciais = {
  auth_mode: string;
  api_token: string | null;
  email: string;
  global_api_key: string;
  account_id: string;
  zone_id: string;
  zone_name: string;
  target_ip: string;
  proxied: boolean;
  verified_at: string | null;
};

type Auth = { mode: "token"; token: string } | { mode: "global"; email: string; key: string };

function authHeaders(auth: Auth): Record<string, string> {
  return auth.mode === "token"
    ? { Authorization: `Bearer ${auth.token}` }
    : { "X-Auth-Email": auth.email, "X-Auth-Key": auth.key };
}

function authFrom(cred: Credenciais): Auth {
  if (cred.auth_mode === "global") {
    if (!cred.email || !cred.global_api_key) throw new Error("Credenciais da Cloudflare incompletas.");
    return { mode: "global", email: cred.email, key: cred.global_api_key };
  }
  if (!cred.api_token) throw new Error("Credenciais da Cloudflare incompletas.");
  return { mode: "token", token: cred.api_token };
}

async function carregarCredenciais(): Promise<Credenciais | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("cloudflare_secrets")
    .select(
      "auth_mode, api_token, email, global_api_key, account_id, zone_id, zone_name, target_ip, proxied, verified_at",
    )
    .eq("provider", "cloudflare")
    .maybeSingle();
  return (data as Credenciais | null) ?? null;
}

async function cloudflare(auth: Auth, path: string, init?: RequestInit) {
  const resp = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      ...authHeaders(auth),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await resp.json().catch(() => null)) as
    | { success?: boolean; result?: any; errors?: { message?: string }[] }
    | null;
  if (!resp.ok || !body?.success) {
    const detalhe = body?.errors?.[0]?.message ?? `HTTP ${resp.status}`;
    throw new Error(`Cloudflare recusou a operação: ${detalhe}`);
  }
  return body.result;
}

async function gravarRegistro(
  auth: Auth,
  zoneId: string,
  name: string,
  content: string,
  _proxied: boolean,
) {
  // O IP de destino pertence à própria rede da Cloudflare; ativar o proxy
  // (nuvem laranja) sobre ele gera o erro 1000 "DNS points to prohibited IP".
  // Por isso o registro é sempre criado com proxy DESLIGADO (somente DNS).
  const proxied = false;
  // Busca por nome (sem filtrar tipo): qualquer registro antigo com o mesmo
  // endereço (A apontando para outro IP, CNAME, AAAA etc.) conflita com o
  // novo apontamento. Apaga tudo e recria o registro A com o IP correto.
  const existentes = (await cloudflare(
    auth,
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}&per_page=100`,
  )) as { id: string; type: string; content: string; proxied: boolean }[];
  let correto = false;
  for (const antigo of existentes ?? []) {
    // Já existe um A com o IP certo e proxy desligado: mantém (evita janela sem DNS).
    if (!correto && antigo.type === "A" && antigo.content === content && !antigo.proxied) {
      correto = true;
      continue;
    }
    await cloudflare(auth, `/zones/${zoneId}/dns_records/${antigo.id}`, { method: "DELETE" });
  }
  if (!correto) {
    await cloudflare(auth, `/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({ type: "A", name, content, ttl: 1, proxied }),
    });
  }
}

/**
 * Descobre a qual domínio da conta Cloudflare um endereço pertence.
 * Assim qualquer domínio da conta (não só o domínio base) funciona sozinho.
 */
async function resolverZona(auth: Auth, host: string, cred: Credenciais) {
  if (cred.zone_id && cred.zone_name && (host === cred.zone_name || host.endsWith(`.${cred.zone_name}`))) {
    return { id: cred.zone_id, name: cred.zone_name };
  }
  const zonas = (await cloudflare(auth, `/zones?per_page=200`)) as { id: string; name: string }[];
  const candidatas = (zonas ?? [])
    .filter((z) => host === z.name || host.endsWith(`.${z.name}`))
    .sort((a, b) => b.name.length - a.name.length);
  const zona = candidatas[0];
  if (!zona) {
    throw new Error(
      `O endereço ${host} não pertence a nenhum domínio desta conta da Cloudflare. Adicione o domínio na Cloudflare e tente de novo.`,
    );
  }
  return { id: zona.id, name: zona.name };
}

/** Diz se a Cloudflare já está conectada, sem nunca devolver as credenciais. */
export const statusCloudflare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const cred = await carregarCredenciais();
    const temCredencial = Boolean(
      cred && (cred.auth_mode === "global" ? cred.email && cred.global_api_key : cred.api_token),
    );
    return {
      conectado: Boolean(temCredencial && cred?.zone_id),
      modo: cred?.auth_mode ?? "token",
      email: cred?.email ?? "",
      contaId: cred?.account_id ?? "",
      zonaId: cred?.zone_id ?? "",
      dominio: cred?.zone_name ?? "",
      apontaPara: cred?.target_ip ?? DEFAULT_TARGET_IP,
      proxy: cred?.proxied ?? false,
      validadoEm: cred?.verified_at ?? null,
    };
  });

/**
 * Salva as credenciais da Cloudflare (token de API ou e-mail + chave global),
 * confere se o domínio base existe na conta e cria o registro raiz e o curinga (*)
 * que fazem os endereços e subdomínios das franquias funcionarem.
 */
export const conectarCloudflare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        modo: z.enum(["token", "global"]).default("token"),
        apiToken: z.string().trim().default(""),
        email: z.string().trim().default(""),
        globalApiKey: z.string().trim().default(""),
        accountId: z.string().trim().default(""),
        baseDomain: z.string().trim().min(3, "Informe o domínio base."),
        targetIp: z.string().trim().default(DEFAULT_TARGET_IP),
        proxied: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context as Ctx);

    const anterior = await carregarCredenciais();
    let auth: Auth;
    if (data.modo === "global") {
      const email = data.email || anterior?.email || "";
      const key = data.globalApiKey || anterior?.global_api_key || "";
      if (!email || !key) throw new Error("Informe o e-mail e a chave global da Cloudflare.");
      auth = { mode: "global", email, key };
    } else {
      const token = data.apiToken || anterior?.api_token || "";
      if (token.length < 20) throw new Error("Cole o token completo da Cloudflare.");
      auth = { mode: "token", token };
    }

    const dominio = normalizeHost(data.baseDomain).replace(/^www\./, "");
    if (!dominio.includes(".")) throw new Error("Informe um domínio válido, como minhamarca.com.br");
    const alvo = data.targetIp || DEFAULT_TARGET_IP;

    const zonas = (await cloudflare(
      auth,
      `/zones?name=${encodeURIComponent(dominio)}`,
    )) as { id: string; name: string; status: string; account?: { id: string } }[];
    const zona = zonas?.[0];
    if (!zona) {
      throw new Error(
        `O domínio ${dominio} não foi encontrado nesta conta da Cloudflare. Adicione-o na Cloudflare e tente novamente.`,
      );
    }

    // Domínio raiz + curinga: qualquer subdomínio de franquia passa a responder por esta central.
    await gravarRegistro(auth, zona.id, dominio, alvo, data.proxied);
    await gravarRegistro(auth, zona.id, `*.${dominio}`, alvo, data.proxied);

    const agora = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("cloudflare_secrets").upsert({
      provider: "cloudflare",
      auth_mode: auth.mode,
      api_token: auth.mode === "token" ? auth.token : "",
      email: auth.mode === "global" ? auth.email : "",
      global_api_key: auth.mode === "global" ? auth.key : "",
      account_id: data.accountId || zona.account?.id || anterior?.account_id || "",
      zone_id: zona.id,
      zone_name: zona.name,
      target_ip: alvo,
      proxied: data.proxied,
      verified_at: agora,
      updated_at: agora,
    });
    if (error) throw new Error(error.message);

    const { error: erroBase } = await supabaseAdmin
      .from("franchise_settings")
      .upsert({ id: true, base_domain: dominio, updated_at: agora });
    if (erroBase) throw new Error(erroBase.message);

    return {
      conectado: true,
      dominio: zona.name,
      statusZona: zona.status,
      contaId: zona.account?.id ?? "",
      apontaPara: alvo,
      validadoEm: agora,
    };
  });

/** Remove a conexão com a Cloudflare (o domínio continua na conta do cliente). */
export const desconectarCloudflare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cloudflare_secrets")
      .delete()
      .eq("provider", "cloudflare");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Verifica na Cloudflare se um domínio ou subdomínio já está publicado e para onde aponta. */
export const verificarDominioCloudflare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ host: z.string().trim().min(3) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const cred = await carregarCredenciais();
    if (!cred?.zone_id) throw new Error("Conecte a Cloudflare antes de verificar.");
    const auth = authFrom(cred);
    const host = normalizeHost(data.host);
    const zona = await resolverZona(auth, host, cred);
    const registros = (await cloudflare(
      auth,
      `/zones/${zona.id}/dns_records?name=${encodeURIComponent(host)}`,
    )) as { type: string; content: string; proxied: boolean }[];
    const curinga = (await cloudflare(
      auth,
      `/zones/${zona.id}/dns_records?type=A&name=${encodeURIComponent(`*.${zona.name}`)}`,
    )) as { content: string }[];
    const direto = registros?.[0];
    const alvoEsperado = cred.target_ip || DEFAULT_TARGET_IP;
    // Autocorreção do erro 1000: se o registro estiver com proxy ligado ou
    // apontando para outro IP, reescreve sozinho (somente DNS, IP correto).
    if (direto && (direto.proxied || (direto.type === "A" && direto.content !== alvoEsperado))) {
      await gravarRegistro(auth, zona.id, host, alvoEsperado, false);
      return {
        host,
        publicado: true,
        viaCuringa: false,
        tipo: "A",
        apontaPara: alvoEsperado,
        proxy: false,
      };
    }
    return {
      host,
      publicado: Boolean(direto) || Boolean(curinga?.[0]),
      viaCuringa: !direto && Boolean(curinga?.[0]),
      tipo: direto?.type ?? (curinga?.[0] ? "A (curinga)" : ""),
      apontaPara: direto?.content ?? curinga?.[0]?.content ?? "",
      proxy: direto?.proxied ?? cred.proxied,
    };
  });

/** Cria/atualiza o endereço de uma franquia específica na Cloudflare. */
export const publicarDominioFranquia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ domain: z.string().trim().min(3) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const cred = await carregarCredenciais();
    if (!cred?.zone_id) {
      throw new Error("Conecte a Cloudflare antes de publicar o endereço da franquia.");
    }
    const auth = authFrom(cred);
    const dominio = normalizeHost(data.domain);
    const zona = await resolverZona(auth, dominio, cred);
    const alvo = cred.target_ip || DEFAULT_TARGET_IP;
    await gravarRegistro(auth, zona.id, dominio, alvo, false);
    return { ok: true, dominio, apontaPara: alvo, zona: zona.name };
  });
