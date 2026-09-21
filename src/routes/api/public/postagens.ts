import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

/** Agendador das postagens em grupos e Status (chamado pelo pg_cron via pg_net). */
export const Route = createFileRoute("/api/public/postagens")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { carregarPostagensToken, executarPostagensPendentes } = await import(
          "@/lib/postagens.server"
        );
        const expected = await carregarPostagensToken();
        if (!expected) return new Response("Não configurado", { status: 500 });

        const provided = request.headers.get("x-postagens-token") ?? "";
        const a = createHash("sha256").update(provided).digest();
        const b = createHash("sha256").update(expected).digest();
        if (!timingSafeEqual(a, b)) return new Response("Unauthorized", { status: 401 });

        try {
          return Response.json(await executarPostagensPendentes());
        } catch (error) {
          const detalhe = error instanceof Error ? error.message : "Falha no agendador.";
          return Response.json({ erro: detalhe }, { status: 500 });
        }
      },
    },
  },
});
