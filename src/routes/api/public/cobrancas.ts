import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/** Disparador das cobranças agendadas (chamado pelo pg_cron via pg_net). */
export const Route = createFileRoute("/api/public/cobrancas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("cobranca_settings")
          .select("cron_token")
          .maybeSingle();
        const expected = (settings as { cron_token?: string } | null)?.cron_token ?? "";
        if (!expected) return new Response("Não configurado", { status: 500 });

        const provided = request.headers.get("x-cobrancas-token") ?? "";
        const a = createHash("sha256").update(provided).digest();
        const b = createHash("sha256").update(expected).digest();
        if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

        const { executarCobrancasPendentes } = await import("@/lib/cobrancas.server");
        return Response.json(await executarCobrancasPendentes());
      },
    },
  },
});
