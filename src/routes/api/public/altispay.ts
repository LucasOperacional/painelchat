// Webhook da AltisPay — recebe PAYMENT_CONFIRMED / PAYMENT_RECEIVED e avisa
// o cliente no WhatsApp assim que o Pix cai na conta.
// URL: /api/public/altispay  (header X-Altis-Token com o segredo do endpoint)

import { createFileRoute } from "@tanstack/react-router";

type Json = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

async function handle(request: Request) {
  const { loadAltispayCredentials } = await import("@/lib/altispay.server");
  const creds = await loadAltispayCredentials();
  const expected = creds?.webhookToken ?? process.env["ALTISPAY_WEBHOOK_TOKEN"] ?? "";
  const url = new URL(request.url);
  const token =
    request.headers.get("x-altis-token") ??
    request.headers.get("x-webhook-token") ??
    url.searchParams.get("token") ??
    "";
  if (!expected || token !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Json = {};
  try {
    payload = (await request.json()) as Json;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const payment = (payload["payment"] as Json | undefined) ?? payload;
  const chargeId = asString(payment["id"]) || asString(payload["id"]);
  const event = asString(payload["event"]);
  const status = asString(payment["status"]) || event;

  if (!chargeId) return Response.json({ received: true, ignored: "no-charge-id" });

  const paid = /RECEIVED|CONFIRMED|PAID/i.test(status);
  if (!paid) return Response.json({ received: true, ignored: `status:${status}` });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: charge } = await supabaseAdmin
    .from("pix_charges")
    .select("id, conversation_id, whatsapp_config_id, amount, description, confirmed_at, estoque_categoria_id")
    .eq("transaction_id", chargeId)
    .maybeSingle();

  if (!charge) return Response.json({ received: true, ignored: "charge-not-found" });

  const { confirmPixCharge } = await import("@/lib/pix-confirm.server");
  const result = await confirmPixCharge(charge);
  return Response.json({ received: true, ...result });
}

export const Route = createFileRoute("/api/public/altispay")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: () => new Response("ok"),
    },
  },
});
