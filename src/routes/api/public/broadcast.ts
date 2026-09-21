import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/** Disparador do agendador de divulgação em grupos (chamado pelo pg_cron via pg_net). */
export const Route = createFileRoute("/api/public/broadcast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: settings } = await supabaseAdmin
          .from("broadcast_settings")
          .select("cron_token")
          .maybeSingle();
        const expected = (settings as { cron_token?: string } | null)?.cron_token ?? "";
        if (!expected) return new Response("Não configurado", { status: 500 });

        const provided = request.headers.get("x-broadcast-token") ?? "";
        const a = createHash("sha256").update(provided).digest();
        const b = createHash("sha256").update(expected).digest();
        if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

        const { runDueBroadcastCampaigns } = await import("@/lib/broadcast.server");
        const result = await runDueBroadcastCampaigns();
        return Response.json(result);
      },
    },
  },
});
