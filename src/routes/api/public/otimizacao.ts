import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Otimização automática do servidor (chamada pelo pg_cron via pg_net). */
export const Route = createFileRoute("/api/public/otimizacao")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const negado = await authenticateCronRequest(request);
        if (negado) return negado;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("otimizacao_settings")
          .select("ativo, intervalo_horas, ultima_execucao")
          .eq("id", true)
          .maybeSingle();

        const c = cfg as {
          ativo?: boolean;
          intervalo_horas?: number;
          ultima_execucao?: string | null;
        } | null;

        if (c && c.ativo === false) {
          return Response.json({ ok: true, ignorado: "desativado" });
        }

        const intervalo = Math.max(c?.intervalo_horas ?? 6, 1) * 3_600_000;
        const ultima = c?.ultima_execucao ? new Date(c.ultima_execucao).getTime() : 0;
        if (Date.now() - ultima < intervalo) {
          return Response.json({ ok: true, ignorado: "intervalo" });
        }

        try {
          const { otimizarServidor } = await import("@/lib/otimizacao.server");
          return Response.json({ ok: true, relatorio: await otimizarServidor() });
        } catch (error) {
          const detalhe = error instanceof Error ? error.message : "Falha na otimização.";
          return Response.json({ ok: false, erro: detalhe }, { status: 500 });
        }
      },
    },
  },
});
