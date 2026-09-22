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
  const papeis = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!papeis.some((r) => r === "admin" || r === "superadmin")) {
    throw new Error("Apenas administradores podem otimizar o servidor.");
  }
}

export type RelatorioOtimizacao = {
  executado_em: string;
  tamanho_antes: number;
  tamanho_depois: number;
  liberado: number;
  eventos_removidos: number;
  ciclos_removidos: number;
  achados_removidos: number;
  trafego_removido: number;
  mensagens_removidas: number;
};

type Settings = {
  ativo: boolean;
  intervalo_horas: number;
  retencao_eventos_horas: number;
  retencao_logs_dias: number;
  retencao_mensagens_dias: number;
  limpar_anexos_orfaos: boolean;
  ultima_execucao: string | null;
  ultimo_relatorio: RelatorioOtimizacao | null;
};

/** Configuração da otimização automática, uso atual do banco e último relatório. */
export const statusOtimizacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: cfg }, { data: uso }] = await Promise.all([
      supabaseAdmin.from("otimizacao_settings").select("*").eq("id", true).maybeSingle(),
      supabaseAdmin.rpc("otimizacao_status"),
    ]);

    const settings = (cfg ?? {
      ativo: true,
      intervalo_horas: 6,
      retencao_eventos_horas: 6,
      retencao_logs_dias: 7,
      retencao_mensagens_dias: 0,
      limpar_anexos_orfaos: true,
      ultima_execucao: null,
      ultimo_relatorio: null,
    }) as unknown as Settings;

    return {
      settings,
      uso: (uso ?? null) as {
        tamanho_banco: number;
        eventos: number;
        mensagens: number;
        ciclos: number;
        achados: number;
      } | null,
    };
  });

/** Salva a configuração da otimização automática. */
export const salvarOtimizacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ativo: z.boolean().optional(),
        intervaloHoras: z.number().int().min(1).max(168).optional(),
        retencaoEventosHoras: z.number().int().min(1).max(720).optional(),
        retencaoLogsDias: z.number().int().min(1).max(365).optional(),
        retencaoMensagensDias: z.number().int().min(0).max(3650).optional(),
        limparAnexosOrfaos: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = { id: true, updated_at: new Date().toISOString() };
    if (data.ativo !== undefined) patch["ativo"] = data.ativo;
    if (data.intervaloHoras !== undefined) patch["intervalo_horas"] = data.intervaloHoras;
    if (data.retencaoEventosHoras !== undefined)
      patch["retencao_eventos_horas"] = data.retencaoEventosHoras;
    if (data.retencaoLogsDias !== undefined) patch["retencao_logs_dias"] = data.retencaoLogsDias;
    if (data.retencaoMensagensDias !== undefined)
      patch["retencao_mensagens_dias"] = data.retencaoMensagensDias;
    if (data.limparAnexosOrfaos !== undefined)
      patch["limpar_anexos_orfaos"] = data.limparAnexosOrfaos;

    const { error } = await supabaseAdmin.from("otimizacao_settings").upsert(patch as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Executa a otimização agora (limpeza de registros antigos e liberação de espaço). */
export const otimizarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { otimizarServidor } = await import("@/lib/otimizacao.server");
    return await otimizarServidor();
  });
