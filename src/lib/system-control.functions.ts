import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (
    !((data ?? []) as { role: string }[]).some(
      (r) => r.role === "admin" || r.role === "superadmin",
    )
  ) {
    throw new Error("Apenas administradores podem controlar o sistema.");
  }
}

/** Estado do sistema e número autorizado do administrador remoto. */
export const getSystemControl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { controleSistema } = await import("@/lib/remote-admin.server");
    return await controleSistema();
  });

/** Salva o número do administrador remoto e/ou o estado do sistema. */
export const saveSystemControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { adminPhone?: string; state?: string }) =>
    z
      .object({
        adminPhone: z.string().min(10).max(20).optional(),
        state: z.enum(["ligado", "desligado", "bloqueado"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { normalizarNumero, invalidarControleSistema, controleSistema } = await import(
      "@/lib/remote-admin.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = { id: true, updated_at: new Date().toISOString() };
    if (data.adminPhone !== undefined) {
      const numero = normalizarNumero(data.adminPhone);
      if (!numero) throw new Error("Número de administrador inválido.");
      patch["admin_phone"] = numero;
    }
    if (data.state) patch["state"] = data.state;

    const { error } = await supabaseAdmin.from("system_control").upsert(patch);
    if (error) throw new Error(error.message);
    invalidarControleSistema();
    return await controleSistema();
  });

/** Reinicia conexões e instâncias da Evolution API pelo painel. */
export const restartSystemConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { reiniciarConexoes } = await import("@/lib/remote-admin.server");
    const linhas = await reiniciarConexoes(getRequest().url);
    return { linhas };
  });
