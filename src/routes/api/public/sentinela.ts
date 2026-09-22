import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/** Ciclo automático da IA Sentinela (chamado pelo agendador do banco). */
export const Route = createFileRoute("/api/public/sentinela")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { carregarSentinelaSettings, executarCicloSentinela, registrarTrafego } = await import(
          "@/lib/sentinela.server"
        );

        const settings = await carregarSentinelaSettings();
        const trafego = await registrarTrafego(request, "sentinela", settings);
        if (trafego.bloqueado) return new Response("Too Many Requests", { status: 429 });



        const esperado = settings.cron_token ?? "";
        if (!esperado) return new Response("Não configurado", { status: 500 });

        const recebido = request.headers.get("x-sentinela-token") ?? "";
        const a = createHash("sha256").update(recebido).digest();
        const b = createHash("sha256").update(esperado).digest();
        if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

        try {
          const origem = new URL(request.url).origin;
          return Response.json(await executarCicloSentinela({ baseUrl: origem }));
        } catch (error) {
          const detalhe = error instanceof Error ? error.message : "Falha no ciclo da Sentinela.";
          return Response.json({ erro: detalhe }, { status: 500 });
        }
      },
    },
  },
});
