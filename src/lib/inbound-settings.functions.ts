import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Lê a preferência de recebimento (ex.: ignorar mensagens de grupos). */
export const getInboundSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as never as {
      supabase: { from: (t: string) => any };
    }).supabase
      .from("inbound_settings")
      .select("ignore_groups")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ignoreGroups: !!data?.ignore_groups };
  });

export const saveInboundSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ ignoreGroups: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as never as { supabase: { from: (t: string) => any }; userId: string };
    const { data: roles, error: rolesError } = await ctx.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId);
    if (rolesError) throw new Error(rolesError.message);
    if (!((roles ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
      throw new Error("Apenas administradores podem alterar esta configuração.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("inbound_settings").upsert({
      id: true,
      ignore_groups: data.ignoreGroups,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
