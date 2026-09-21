import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: { from: (t: string) => any };
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
