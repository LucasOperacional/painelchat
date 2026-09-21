import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function exigirAdmin(context: unknown) {
  const ctx = context as never as Ctx;
  const { data: roles, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  if (!((roles ?? []) as { role: string }[]).some((r) => r.role === "admin")) {
    throw new Error("Apenas administradores podem importar o histórico.");
  }
}

/** Regra: importar automaticamente o histórico do celular ao parear. */
export const getHistoricoSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as never as Ctx;
    const { data, error } = await ctx.supabase
      .from("inbound_settings")
      .select("sync_history")
      .eq("id", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { sincronizarHistorico: (data as { sync_history?: boolean } | null)?.sync_history !== false };
  });

export const saveHistoricoSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ sincronizarHistorico: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("inbound_settings").upsert({
      id: true,
      sync_history: data.sincronizarHistorico,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Importa as conversas e grupos que já existem no celular conectado. */
export const importarHistoricoWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        deviceId: z.string().uuid().nullable().optional(),
        limitePorConversa: z.number().int().min(1).max(500).optional(),
        incluirGrupos: z.boolean().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    await exigirAdmin(context);
    const { importarHistoricoDoDispositivo } = await import("@/lib/historico.server");
    return importarHistoricoDoDispositivo({
      deviceId: data.deviceId ?? null,
      ...(data.limitePorConversa === undefined ? {} : { limitePorConversa: data.limitePorConversa }),
      ...(data.incluirGrupos === undefined ? {} : { incluirGrupos: data.incluirGrupos }),
    });
  });
