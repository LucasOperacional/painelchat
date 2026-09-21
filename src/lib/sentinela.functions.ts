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
    throw new Error("Apenas administradores podem usar a IA Sentinela.");
  }
}

/** Situação da IA Sentinela: configuração, últimos ciclos, achados e bloqueios. */
export const statusSentinela = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { carregarSentinelaSettings } = await import("@/lib/sentinela.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await carregarSentinelaSettings();

    const [{ data: ciclos }, { data: achados }, { data: trafego }, { data: eventos }] =
      await Promise.all([
        supabaseAdmin
          .from("sentinela_ciclos")
          .select("*")
          .order("iniciado_em", { ascending: false })
          .limit(20),
        supabaseAdmin
          .from("sentinela_achados")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(60),
        supabaseAdmin
          .from("sentinela_trafego")
          .select("*")
          .order("ultimo_em", { ascending: false })
          .limit(20),
        supabaseAdmin
          .from("webhook_eventos")
          .select("status")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
          .limit(5000),
      ]);

    const lista = (eventos ?? []) as { status: string }[];
    return {
      settings: {
        ativo: s.ativo,
        intervaloMinutos: s.intervalo_minutos,
        autoReconectar: s.auto_reconectar,
        autoReenviar: s.auto_reenviar,
        autoRecuperarMidia: s.auto_recuperar_midia,
        autoLimparDuplicadas: s.auto_limpar_duplicadas,
        segurancaModo: s.seguranca_modo,
        limiteReqMinuto: s.limite_req_minuto,
        bloqueioMinutos: s.bloqueio_minutos,
        avisarPainel: s.avisar_painel,
        avisarWhatsapp: s.avisar_whatsapp,
        numeroAlerta: s.numero_alerta,
        resumoIa: s.resumo_ia,
        resumoIaEm: s.resumo_ia_em,
      },
      eventos24h: {
        total: lista.length,
        ok: lista.filter((e) => e.status === "ok").length,
        pendentes: lista.filter((e) => e.status !== "ok").length,
      },
      ciclos: ((ciclos ?? []) as Record<string, unknown>[]).map((c) => ({
        id: String(c["id"]),
        iniciadoEm: String(c["iniciado_em"]),
        duracaoMs: Number(c["duracao_ms"] ?? 0),
        verificacoes: Number(c["verificacoes"] ?? 0),
        problemas: Number(c["problemas"] ?? 0),
        corrigidos: Number(c["corrigidos"] ?? 0),
        severidade: String(c["severidade"] ?? "ok"),
        resumo: String(c["resumo"] ?? ""),
      })),
      achados: ((achados ?? []) as Record<string, unknown>[]).map((a) => ({
        id: String(a["id"]),
        tipo: String(a["tipo"] ?? ""),
        severidade: String(a["severidade"] ?? "aviso"),
        titulo: String(a["titulo"] ?? ""),
        detalhe: String(a["detalhe"] ?? ""),
        alvo: String(a["alvo"] ?? ""),
        acao: String(a["acao"] ?? ""),
        status: String(a["status"] ?? "aberto"),
        criadoEm: String(a["created_at"]),
      })),
      bloqueios: ((trafego ?? []) as Record<string, unknown>[]).map((t) => ({
        id: String(t["id"]),
        ip: String(t["ip"] ?? ""),
        rota: String(t["rota"] ?? ""),
        requisicoes: Number(t["requisicoes"] ?? 0),
        bloqueadoAte: (t["bloqueado_ate"] as string | null) ?? null,
        motivo: String(t["motivo"] ?? ""),
        totalBloqueios: Number(t["total_bloqueios"] ?? 0),
        ultimoEm: String(t["ultimo_em"]),
      })),
    };
  });

const SettingsInput = z.object({
  ativo: z.boolean(),
  autoReconectar: z.boolean(),
  autoReenviar: z.boolean(),
  autoRecuperarMidia: z.boolean(),
  autoLimparDuplicadas: z.boolean(),
  segurancaModo: z.enum(["bloquear", "alertar", "misto"]),
  limiteReqMinuto: z.number().int().min(10).max(10000),
  bloqueioMinutos: z.number().int().min(1).max(1440),
  avisarPainel: z.boolean(),
  avisarWhatsapp: z.boolean(),
  numeroAlerta: z.string().min(10).max(20),
});

/** Salva as regras da IA Sentinela. */
export const salvarSentinelaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { carregarSentinelaSettings } = await import("@/lib/sentinela.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const atual = await carregarSentinelaSettings();

    const { error } = await supabaseAdmin
      .from("sentinela_settings")
      .update({
        ativo: data.ativo,
        auto_reconectar: data.autoReconectar,
        auto_reenviar: data.autoReenviar,
        auto_recuperar_midia: data.autoRecuperarMidia,
        auto_limpar_duplicadas: data.autoLimparDuplicadas,
        seguranca_modo: data.segurancaModo,
        limite_req_minuto: data.limiteReqMinuto,
        bloqueio_minutos: data.bloqueioMinutos,
        avisar_painel: data.avisarPainel,
        avisar_whatsapp: data.avisarWhatsapp,
        numero_alerta: data.numeroAlerta.replace(/\D/g, ""),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", atual.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Roda uma verificação completa agora. */
export const verificarAgoraSentinela = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { executarCicloSentinela } = await import("@/lib/sentinela.server");
    return await executarCicloSentinela({ forcado: true });
  });

/** Marca um achado como resolvido ou ignorado. */
export const resolverAchado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(["corrigido", "ignorado"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sentinela_achados")
      .update({ status: data.status } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Libera uma origem bloqueada. */
export const liberarOrigem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("sentinela_trafego")
      .update({ bloqueado_ate: null, requisicoes: 0, motivo: "Liberado manualmente." } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
