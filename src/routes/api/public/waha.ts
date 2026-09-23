// Endereço alternativo de recebimento para a WAHA. O corpo é o mesmo envelope
// { event, session, payload } tratado no fluxo principal, então delegamos para
// o mesmo processamento (com a proteção da IA Sentinela).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/waha")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guardarWebhook } = await import("@/lib/sentinela.server");
        const { processarWebhookEvolution } = await import("@/routes/api/public/evolution");
        return guardarWebhook(request, processarWebhookEvolution);
      },
    },
  },
});
