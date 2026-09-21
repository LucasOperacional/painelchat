import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type ProjectBranding = {
  id: string;
  name: string;
  slug: string;
  isCentral: boolean;
  logoUrl: string | null;
  loginLogoUrl: string | null;
  dashboardLogoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  chatBackgroundColor: string;
  chatBackgroundUrl: string | null;
  headline: string;
  tagline: string;
};

function normalizeHost(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

/** Public read: resolves which connected project answers for a host. */
export const getProjectByHost = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ host: z.string().default("") }).parse(data))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabasePublic = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const host = normalizeHost(data.host);
    const columns =
      "id, name, slug, is_central, is_active, logo_url, login_logo_url, dashboard_logo_url, favicon_url, primary_color, accent_color, chat_background_color, chat_background_url, headline, tagline";

    let row: Record<string, unknown> | null = null;

    if (host) {
      const { data: domain } = await supabasePublic
        .from("project_domains")
        .select(`domain, projects!inner(${columns})`)
        .eq("domain", host)
        .maybeSingle();
      const linked = (domain as { projects?: Record<string, unknown> } | null)?.projects ?? null;
      if (linked && linked["is_active"]) row = linked;
    }

    if (!row) {
      const { data: central } = await supabasePublic
        .from("projects")
        .select(columns)
        .eq("is_central", true)
        .eq("is_active", true)
        .maybeSingle();
      row = (central as Record<string, unknown> | null) ?? null;
    }

    if (!row) return null;

    return {
      id: String(row["id"]),
      name: String(row["name"]),
      slug: String(row["slug"]),
      isCentral: Boolean(row["is_central"]),
      logoUrl: (row["logo_url"] as string | null) ?? null,
      loginLogoUrl: (row["login_logo_url"] as string | null) ?? null,
      dashboardLogoUrl: (row["dashboard_logo_url"] as string | null) ?? null,
      faviconUrl: (row["favicon_url"] as string | null) ?? null,
      primaryColor: String(row["primary_color"] ?? ""),
      accentColor: String(row["accent_color"] ?? ""),
      chatBackgroundColor: String(row["chat_background_color"] ?? "#f1f5f9"),
      chatBackgroundUrl: (row["chat_background_url"] as string | null) ?? null,
      headline: String(row["headline"] ?? ""),
      tagline: String(row["tagline"] ?? ""),
    } satisfies ProjectBranding;
  });

type AdminCtx = { supabase: { from: (table: string) => any }; userId: string };

async function assertSuperAdmin(context: AdminCtx) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: { role: string }) => r.role === "superadmin")) {
    throw new Error("Apenas o superadmin pode gerenciar as franquias.");
  }
}

async function assertAdmin(context: AdminCtx) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "superadmin")) {
    throw new Error("Apenas administradores podem alterar estas configurações.");
  }
}

/** Endereço base usado para gerar o site de cada franquia (ex.: minhamarca.com.br). */
export const getFranchiseSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("franchise_settings")
      .select("base_domain")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { baseDomain: (data?.base_domain as string | undefined) ?? "" };
  });

export const saveFranchiseSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ baseDomain: z.string().trim().default("") }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const baseDomain = data.baseDomain ? normalizeHost(data.baseDomain) : "";
    if (baseDomain && !baseDomain.includes(".")) {
      throw new Error("Informe um endereço base válido, como minhamarca.com.br");
    }
    const { error } = await context.supabase
      .from("franchise_settings")
      .upsert({ id: true, base_domain: baseDomain, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { baseDomain };
  });


export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // A lista inclui a chave de vínculo: só o superadmin pode vê-la.
    await assertSuperAdmin(context as AdminCtx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*, project_domains(id, domain, is_primary)")
      .order("is_central", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

function randomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const projectInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Informe o nome do projeto"),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífen"),
  accessKey: z
    .string()
    .trim()
    .max(120, "Chave muito longa")
    .regex(/^[a-zA-Z0-9._-]*$/, "Use apenas letras, números, ponto, hífen ou sublinhado")
    .default(""),
  domain: z.string().trim().default(""),
  criarSubdominio: z.boolean().default(true),
  subdominio: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]*$/, "Use apenas letras minúsculas, números e hífen")
    .default(""),
  isActive: z.boolean().default(true),
  logoUrl: z.string().trim().default(""),
  faviconUrl: z.string().trim().default(""),
  primaryColor: z.string().trim().default("#0f766e"),
  accentColor: z.string().trim().default("#14b8a6"),
  headline: z.string().trim().default(""),
  tagline: z.string().trim().default(""),
});

/**
 * Mantém o endereço do painel central marcado como principal.
 * Se o projeto central ainda não tiver um principal definido, usa
 * `cpanel.<domínio base>` quando ele já estiver cadastrado.
 */
async function garantirPainelPrincipal(context: { supabase: any }) {
  // Se já existe um principal escolhido (em qualquer projeto), respeita a escolha.
  const { data: jaPrincipal } = await context.supabase
    .from("project_domains")
    .select("id")
    .eq("is_primary", true)
    .limit(1);
  if (jaPrincipal && jaPrincipal.length > 0) return;

  const { data: central } = await context.supabase
    .from("projects")
    .select("id, project_domains(id, domain, is_primary)")
    .eq("is_central", true)
    .maybeSingle();
  const dominios = (central?.project_domains ?? []) as {
    id: string;
    domain: string;
    is_primary: boolean;
  }[];
  if (!central || dominios.length === 0) return;

  const { data: settings } = await context.supabase
    .from("franchise_settings")
    .select("base_domain")
    .eq("id", true)
    .maybeSingle();
  const base = normalizeHost((settings?.base_domain as string | undefined) ?? "");
  const preferido =
    dominios.find((d) => d.is_primary) ??
    (base ? dominios.find((d) => d.domain === `cpanel.${base}`) : undefined) ??
    dominios[0];
  if (!preferido) return;

  for (const d of dominios) {
    const desejado = d.id === preferido.id;
    if (d.is_primary !== desejado) {
      await context.supabase
        .from("project_domains")
        .update({ is_primary: desejado })
        .eq("id", d.id);
    }
  }
}

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => projectInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const accessKey = data.accessKey || randomKey();
    let domain = data.domain ? normalizeHost(data.domain) : "";
    if (domain && !domain.includes(".")) {
      // Digitou só o nome (ex.: "genesis"): completa com o domínio base
      // automaticamente, em vez de barrar a criação da franquia.
      const { data: baseSettings } = await context.supabase
        .from("franchise_settings")
        .select("base_domain")
        .eq("id", true)
        .maybeSingle();
      const baseDomain = normalizeHost((baseSettings?.base_domain as string | undefined) ?? "");
      if (baseDomain.includes(".") && /^[a-z0-9-]+$/.test(domain)) {
        domain = `${domain}.${baseDomain}`;
      } else {
        throw new Error("Informe um domínio válido, como dominio2.com");
      }
    }
    const row = {
      name: data.name,
      slug: data.slug,
      access_key: accessKey,
      is_active: data.isActive,
      logo_url: data.logoUrl || null,
      favicon_url: data.faviconUrl || null,
      primary_color: data.primaryColor,
      accent_color: data.accentColor,
      headline: data.headline,
      tagline: data.tagline,
      updated_at: new Date().toISOString(),
    };
    let projectId = data.id ?? "";
    let generatedDomain = "";
    if (data.id) {
      const { error } = await context.supabase.from("projects").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await context.supabase
        .from("projects")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      projectId = created.id;

      // Toda franquia nova ganha um endereço próprio (subdomínio) no domínio base,
      // servindo a mesma central: mesmo banco, mesmas conexões e mesmas integrações.
      const { data: settings } = await context.supabase
        .from("franchise_settings")
        .select("base_domain")
        .eq("id", true)
        .maybeSingle();
      const base = normalizeHost((settings?.base_domain as string | undefined) ?? "");
      const rotulo = (data.subdominio || data.slug).replace(/^-+|-+$/g, "");
      if (data.criarSubdominio && rotulo && base && base.includes(".")) {
        generatedDomain = `${rotulo}.${base}`;
        const { error: genError } = await context.supabase
          .from("project_domains")
          .insert({
            project_id: projectId,
            domain: generatedDomain,
            access_key: accessKey,
            is_primary: true,
          });
        if (genError && genError.code !== "23505") throw new Error(genError.message);
        if (genError) generatedDomain = "";
      }
    }

    // O painel principal (central) continua ativo e principal: criar a franquia
    // apenas acrescenta um endereço novo, sem nunca trocar o endereço principal.
    await garantirPainelPrincipal(context);

    if (domain) {
      const { error: domainError } = await context.supabase
        .from("project_domains")
        .insert({ project_id: projectId, domain, access_key: accessKey });
      if (domainError && domainError.code !== "23505") throw new Error(domainError.message);
      if (domainError) throw new Error("Este domínio já está vinculado a uma franquia.");
    }

    // Franquia nova nasce vazia e com um acesso de administrador próprio,
    // para o endereço abrir funcionando sem nenhum ajuste no painel central.
    let adminEmail = "";
    let adminSenha = "";
    if (!data.id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      adminEmail = `admin@${generatedDomain || `${data.slug}.local`}`;
      adminSenha = randomKey().slice(0, 10);
      const criado = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminSenha,
        email_confirm: true,
        user_metadata: { full_name: `Administrador ${data.name}`, project_id: projectId },
      });
      if (criado.error) {
        adminEmail = "";
        adminSenha = "";
      } else {
        const novoId = criado.data.user!.id;
        await supabaseAdmin
          .from("profiles")
          .update({ project_id: projectId, username: data.slug, full_name: `Administrador ${data.name}` })
          .eq("id", novoId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", novoId);
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: novoId, role: "admin", project_id: projectId });
        await context.supabase
          .from("projects")
          .update({ admin_email: adminEmail, admin_password: adminSenha })
          .eq("id", projectId);
      }
    }

    return { id: projectId, accessKey, generatedDomain, adminEmail, adminSenha };
  });


export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { data: proj, error: readError } = await context.supabase
      .from("projects")
      .select("is_central")
      .eq("id", data.id)
      .single();
    if (readError) throw new Error(readError.message);
    if (proj.is_central) throw new Error("O projeto central não pode ser removido.");
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addProjectDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        domain: z.string().trim().min(3),
        accessKey: z.string().trim().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const domain = normalizeHost(data.domain);
    if (!domain.includes(".")) throw new Error("Informe um domínio válido, como dominio2.com");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project, error: projectError } = await supabaseAdmin
      .from("projects")
      .select("access_key")
      .eq("id", data.projectId)
      .single();
    if (projectError) throw new Error(projectError.message);
    if (data.accessKey && data.accessKey !== project.access_key) {
      throw new Error("Chave de vínculo inválida para este projeto.");
    }
    const { error } = await context.supabase
      .from("project_domains")
      .insert({ project_id: data.projectId, domain, access_key: project.access_key });
    if (error) {
      throw new Error(
        error.code === "23505" ? "Este domínio já está vinculado a um projeto." : error.message,
      );
    }
    return { ok: true };
  });

export const removeProjectDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase.from("project_domains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Define qual endereço é o painel principal (dentro do sistema). */
export const definirPainelPrincipal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { data: alvo, error: erroAlvo } = await context.supabase
      .from("project_domains")
      .select("id, domain, project_id")
      .eq("id", data.id)
      .maybeSingle();
    if (erroAlvo) throw new Error(erroAlvo.message);
    if (!alvo) throw new Error("Endereço não encontrado.");

    // Só um endereço fica marcado como principal em todo o sistema.
    const { error: erroLimpar } = await context.supabase
      .from("project_domains")
      .update({ is_primary: false })
      .eq("is_primary", true);
    if (erroLimpar) throw new Error(erroLimpar.message);

    const { error } = await context.supabase
      .from("project_domains")
      .update({ is_primary: true })
      .eq("id", alvo.id);
    if (error) throw new Error(error.message);
    return { ok: true, domain: alvo.domain as string };
  });

const brandingInput = z.object({
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Cor principal inválida"),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Cor de destaque inválida"),
  chatBackgroundColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Cor do chat inválida"),
  chatBackgroundUrl: z.union([
    z.literal(""),
    z.string().trim().url("Informe um endereço de imagem válido").refine(
      (value) => value.startsWith("https://"),
      "A imagem precisa usar um endereço seguro (https)",
    ),
  ]),
  logoUrl: z.string().trim().default(""),
  loginLogoUrl: z.string().trim().default(""),
  dashboardLogoUrl: z.string().trim().default(""),
  faviconUrl: z.string().trim().default(""),
  headline: z.string().trim().default(""),
  tagline: z.string().trim().default(""),
});

/** Reads the central project appearance settings (colors + logos). */
export const getBrandingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select(
        "id, name, primary_color, accent_color, chat_background_color, chat_background_url, logo_url, login_logo_url, dashboard_logo_url, favicon_url, headline, tagline",
      )
      .eq("is_central", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
  });

/** Saves colors and logos of the central project. */
export const saveBrandingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => brandingInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as AdminCtx);
    const { error } = await context.supabase
      .from("projects")
      .update({
        primary_color: data.primaryColor,
        accent_color: data.accentColor,
        chat_background_color: data.chatBackgroundColor,
        chat_background_url: data.chatBackgroundUrl || null,
        logo_url: data.logoUrl || null,
        login_logo_url: data.loginLogoUrl || null,
        dashboard_logo_url: data.dashboardLogoUrl || null,
        favicon_url: data.faviconUrl || null,
        headline: data.headline,
        tagline: data.tagline,
        updated_at: new Date().toISOString(),
      })
      .eq("is_central", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
