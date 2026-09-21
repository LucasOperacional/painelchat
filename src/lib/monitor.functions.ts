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
  if (!((data ?? []) as { role: string }[]).some((r) => r.role === "admin")) {
    throw new Error("Apenas administradores podem usar o monitoramento.");
  }
}

/** Situação atual do monitor, dos aparelhos e das últimas ocorrências. */
export const statusMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { carregarMonitorSettings } = await import("@/lib/monitor.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await carregarMonitorSettings();

    const { data: devices } = await supabaseAdmin
      .from("whatsapp_config")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at");
    const { data: eventos } = await supabaseAdmin
      .from("monitor_eventos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      settings: {
        ativo: settings.ativo,
        numeroAlerta: settings.numero_alerta,
        autoReconectar: settings.auto_reconectar,
        intervaloMinutos: settings.intervalo_minutos,
      },
      devices: ((devices ?? []) as Record<string, unknown>[]).map((d) => ({
        id: String(d["id"]),
        label: String(d["label"] || d["instance_name"] || "Dispositivo"),
        provider: String(d["provider"] ?? "evolution"),
        phone: String(d["phone"] ?? ""),
        status: String(d["status"] ?? ""),
        estado: (d["monitor_estado"] as string | null) ?? null,
        desde: (d["monitor_desde"] as string | null) ?? null,
        tentativas: Number(d["monitor_tentativas"] ?? 0),
        ultimoCheck: (d["monitor_ultimo_check"] as string | null) ?? null,
        ultimoErro: (d["monitor_ultimo_erro"] as string | null) ?? null,
      })),
      eventos: ((eventos ?? []) as Record<string, unknown>[]).map((e) => ({
        id: String(e["id"]),
        deviceLabel: String(e["device_label"] ?? ""),
        tipo: String(e["tipo"] ?? ""),
        severidade: String(e["severidade"] ?? "erro"),
        mensagem: String(e["mensagem"] ?? ""),
        alertaEnviado: Boolean(e["alerta_enviado"]),
        alertaDetalhe: (e["alerta_detalhe"] as string | null) ?? null,
        criadoEm: String(e["created_at"] ?? ""),
      })),
    };
  });

/** Frequência de mensagens nas últimas 24h e falhas de envio. */
export const estatisticasMensagens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const agora = new Date();
    const inicio = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const desde = inicio.toISOString();

    const [msgs, perdidas, difusao, cobrancas] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("direction, created_at")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("monitor_eventos")
        .select("id, tipo, mensagem, device_label, created_at")
        .gte("created_at", desde)
        .eq("severidade", "erro")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("broadcast_runs")
        .select("id, target, detail, created_at")
        .gte("created_at", desde)
        .eq("ok", false)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("cobranca_envios")
        .select("id, tipo, detalhe, created_at")
        .gte("created_at", desde)
        .eq("ok", false)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const linhas = (msgs.data ?? []) as { direction: string; created_at: string }[];
    const enviadas = linhas.filter((m) => m.direction === "outbound").length;
    const recebidas = linhas.filter((m) => m.direction === "inbound").length;

    // Série por hora (24 baldes, do mais antigo ao mais recente)
    const baldes = Array.from({ length: 24 }, (_, i) => {
      const hora = new Date(inicio.getTime() + i * 60 * 60 * 1000);
      return {
        hora: hora.toISOString(),
        rotulo: String(hora.getUTCHours()).padStart(2, "0"),
        enviadas: 0,
        recebidas: 0,
      };
    });
    for (const m of linhas) {
      const idx = Math.floor(
        (new Date(m.created_at).getTime() - inicio.getTime()) / (60 * 60 * 1000),
      );
      const balde = baldes[idx];
      if (!balde) continue;
      if (m.direction === "outbound") balde.enviadas += 1;
      else if (m.direction === "inbound") balde.recebidas += 1;
    }

    type Falha = { id: string; origem: string; descricao: string; criadoEm: string };
    const falhas: Falha[] = [
      ...((perdidas.data ?? []) as Record<string, unknown>[]).map((e) => ({
        id: `ev-${String(e["id"])}`,
        origem: String(e["device_label"] || e["tipo"] || "Conexão"),
        descricao: String(e["mensagem"] ?? ""),
        criadoEm: String(e["created_at"] ?? ""),
      })),
      ...((difusao.data ?? []) as Record<string, unknown>[]).map((e) => ({
        id: `bc-${String(e["id"])}`,
        origem: `Disparo · ${String(e["target"] ?? "")}`,
        descricao: String(e["detail"] ?? ""),
        criadoEm: String(e["created_at"] ?? ""),
      })),
      ...((cobrancas.data ?? []) as Record<string, unknown>[]).map((e) => ({
        id: `cb-${String(e["id"])}`,
        origem: `Cobrança · ${String(e["tipo"] ?? "")}`,
        descricao: String(e["detalhe"] ?? ""),
        criadoEm: String(e["created_at"] ?? ""),
      })),
    ].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));

    const ultimaHora = linhas.filter(
      (m) => new Date(m.created_at).getTime() >= agora.getTime() - 60 * 60 * 1000,
    ).length;

    return {
      enviadas,
      recebidas,
      total: linhas.length,
      ultimaHora,
      porHora: Math.round((linhas.length / 24) * 10) / 10,
      naoEnviadas: falhas.length,
      serie: baldes,
      falhas: falhas.slice(0, 30),
    };
  });

/** Liga/desliga o monitor e ajusta o número que recebe os avisos. */
export const salvarMonitorSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ativo: z.boolean(),
        numeroAlerta: z.string().min(10).max(20),
        autoReconectar: z.boolean(),
        intervaloMinutos: z.number().int().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { carregarMonitorSettings } = await import("@/lib/monitor.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const settings = await carregarMonitorSettings();
    const { error } = await supabaseAdmin
      .from("monitor_settings")
      .update({
        ativo: data.ativo,
        numero_alerta: data.numeroAlerta.replace(/\D/g, ""),
        auto_reconectar: data.autoReconectar,
        intervalo_minutos: data.intervaloMinutos,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", settings.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Roda a verificação agora mesmo. */
export const verificarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { verificarConexoes } = await import("@/lib/monitor.server");
    return verificarConexoes();
  });

/** Envia uma mensagem de teste para o número de plantão. */
export const testarAlerta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { registrarOcorrencia, carregarMonitorSettings } = await import("@/lib/monitor.server");
    const settings = await carregarMonitorSettings();
    await registrarOcorrencia({
      tipo: "Teste de alerta",
      mensagem: "Mensagem de teste do monitoramento de conexões.",
      severidade: "ok",
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("monitor_eventos")
      .select("alerta_enviado, alerta_detalhe")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const linha = (data ?? {}) as { alerta_enviado?: boolean; alerta_detalhe?: string };
    return {
      ok: Boolean(linha.alerta_enviado),
      detalhe: linha.alerta_detalhe ?? "",
      numero: settings.numero_alerta,
    };
  });
