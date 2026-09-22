import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/** Verificação automática das conexões (chamada pelo pg_cron via pg_net). */
export const Route = createFileRoute("/api/public/monitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { carregarMonitorSettings, verificarConexoes } = await import(
            "@/lib/monitor.server"
          );
          const settings = await carregarMonitorSettings();
          const expected = settings.cron_token ?? "";
          if (!expected) {
            return Response.json({ erro: "Monitor não configurado." }, { status: 200 });
          }

          const provided = request.headers.get("x-monitor-token") ?? "";
          const a = createHash("sha256").update(provided).digest();
          const b = createHash("sha256").update(expected).digest();
          if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

          return Response.json(await verificarConexoes(request.url));
        } catch (error) {
          // O cron não deve receber 500: devolvemos o motivo e tentamos no próximo ciclo.
          const detalhe = error instanceof Error ? error.message : "Falha na verificação.";
          console.error("[monitor] ciclo falhou:", detalhe);
          return Response.json({ erro: detalhe, tentarNovamente: true }, { status: 200 });
        }
      },

    },
  },
});
