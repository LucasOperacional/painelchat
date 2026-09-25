import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: {
    from: (t: string) => any;
    storage: {
      from: (bucket: string) => {
        createSignedUrl: (path: string, expiresIn: number) => Promise<{
          data: { signedUrl?: string } | null;
          error: unknown;
        }>;
      };
    };
  };
  userId: string;
};

export type WebviewSite = {
  id: string;
  title: string;
  url: string;
  description: string;
  open_external: boolean;
  use_proxy: boolean;
  sort_order: number;
};

export type WebviewDocument = {
  id: string;
  webview_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  url: string;
};

export type SavedDocument = WebviewDocument & { site_title: string };

type DocumentRow = {
  id: string;
  webview_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

async function signDocuments(supabase: Ctx["supabase"], rows: DocumentRow[]) {
  return Promise.all(
    rows.map(async (row) => {
      const signed = await supabase.storage.from("anexos").createSignedUrl(row.storage_path, 60 * 60);
      return signed.data?.signedUrl ? { ...row, url: signed.data.signedUrl } : null;
    }),
  );
}

const SELECT = "id, title, url, description, open_external, use_proxy, sort_order";

async function assertAdmin(ctx: Ctx) {
  const { data: roles, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  if (!((roles ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem gerenciar os sites.");
  }
}

/** Lista os sites cadastrados para abrir dentro do sistema. */
export const listWebviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as never as Ctx;
    const { data, error } = await supabase
      .from("webviews")
      .select(SELECT)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as WebviewSite[];
  });

/** Lista os documentos capturados e gera links privados temporários. */
export const listWebviewDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ webviewId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context as never as Ctx;
    const { data: rows, error } = await supabase
      .from("webview_documents")
      .select("id, webview_id, storage_path, file_name, mime_type, size_bytes, created_at")
      .eq("webview_id", data.webviewId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const documents = await Promise.all(
      ((rows ?? []) as Array<{
        id: string;
        webview_id: string;
        storage_path: string;
        file_name: string;
        mime_type: string;
        size_bytes: number;
        created_at: string;
      }>).map(async (row) => {
        const signed = await supabase.storage.from("anexos").createSignedUrl(row.storage_path, 60 * 60);
        return signed.data?.signedUrl ? { ...row, url: signed.data.signedUrl } : null;
      }),
    );
    return documents.filter((row): row is NonNullable<typeof row> => row !== null) as WebviewDocument[];
  });

/** Lista todos os documentos salvos pela central, com o site de origem. */
export const listSavedDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as never as Ctx;

    let query = supabase
      .from("webview_documents")
      .select("id, webview_id, storage_path, file_name, mime_type, size_bytes, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) query = query.ilike("file_name", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: sites, error: sitesError } = await supabase.from("webviews").select("id, title");
    if (sitesError) throw new Error(sitesError.message);

    const titles = new Map<string, string>((sites ?? []).map((s: { id: string; title: string }) => [s.id, s.title]));
    const signed = await signDocuments(supabase, (rows ?? []) as DocumentRow[]);

    return signed
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => ({ ...row, site_title: titles.get(row.webview_id) ?? "Site removido" })) as SavedDocument[];
  });

const siteSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Informe o nome do site").max(80),
  url: z
    .string()
    .trim()
    .min(1, "Informe o endereço do site")
    .max(500)
    .refine((v) => /^https?:\/\//i.test(v), "O endereço deve começar com https://"),
  description: z.string().trim().max(300).default(""),
  openExternal: z.boolean().default(false),
  useProxy: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/** Cria ou atualiza um site do webview. */
export const saveWebview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => siteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as never as Ctx;
    await assertAdmin(ctx);
    const row = {
      title: data.title,
      url: data.url,
      description: data.description,
      open_external: data.openExternal,
      use_proxy: data.useProxy,
      sort_order: data.sortOrder,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await ctx.supabase.from("webviews").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await ctx.supabase
      .from("webviews")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (created as { id: string }).id };
  });

/** Remove um site cadastrado. */
export const deleteWebview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as never as Ctx;
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.from("webviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
