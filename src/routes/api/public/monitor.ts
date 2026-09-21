import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/** Verificação automática das conexões (chamada pelo pg_cron via pg_net). */
export const Route = createFileRoute("/api/public/monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { carregarMonitorSettings, verificarConexoes } = await import(
          "@/lib/monitor.server"
        );
        const settings = await carregarMonitorSettings();
        const expected = settings.cron_token ?? "";
        if (!expected) return new Response("Não configurado", { status: 500 });

        const provided = request.headers.get("x-monitor-token") ?? "";
        const a = createHash("sha256").update(provided).digest();
        const b = createHash("sha256").update(expected).digest();
        if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

        try {
          return Response.json(await verificarConexoes());
        } catch (error) {
          const detalhe = error instanceof Error ? error.message : "Falha na verificação.";
          return Response.json({ erro: detalhe }, { status: 500 });
        }
      },
    },
  },
});
