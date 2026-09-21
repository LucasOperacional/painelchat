// Webhook da MisticPay — recebe a confirmação de pagamento (cash-in) e avisa
// o cliente no WhatsApp assim que o Pix cai na conta.
// URL: /api/public/misticpay?token=MISTICPAY_WEBHOOK_TOKEN

import { createFileRoute } from "@tanstack/react-router";

type Json = Record<string, unknown>;

function field(obj: Json | null | undefined, ...names: string[]): unknown {
  if (!obj) return undefined;
  const keys = Object.keys(obj);
  for (const name of names) {
    const hit = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (hit !== undefined && obj[hit] !== undefined && obj[hit] !== null) return obj[hit];
  }
  return undefined;
}

function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

async function handle(request: Request) {
  const expected = process.env["MISTICPAY_WEBHOOK_TOKEN"] ?? "";
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
  if (!expected || token !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Json = {};
  try {
    payload = (await request.json()) as Json;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const data = (field(payload, "data", "transaction", "payload") as Json | undefined) ?? payload;
  const transactionId =
    asString(field(data, "transactionId", "transaction_id", "externalId", "external_id", "id")) ||
    asString(field(payload, "transactionId", "transaction_id"));
  const status =
    asString(field(data, "transactionState", "status", "state", "situation")) ||
    asString(field(payload, "status", "event", "type"));

  if (!transactionId) return Response.json({ received: true, ignored: "no-transaction-id" });

  const { isPaidStatus, confirmPixCharge } = await import("@/lib/pix-confirm.server");
  if (!isPaidStatus(status)) return Response.json({ received: true, ignored: `status:${status}` });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: charge } = await supabaseAdmin
    .from("pix_charges")
    .select("id, conversation_id, whatsapp_config_id, amount, description, confirmed_at, estoque_categoria_id")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  if (!charge) {
    // Pode ser um Pix enviado pela tela Banco (saque).
    const { data: payout } = await supabaseAdmin
      .from("bank_transactions")
      .select("id")
      .eq("transaction_id", transactionId)
      .eq("direction", "out")
      .maybeSingle();
    if (payout) {
      await supabaseAdmin
        .from("bank_transactions")
        .update({ status: "pago", paid_at: new Date().toISOString() })
        .eq("id", payout.id);
      return Response.json({ received: true, payout: true });
    }
    return Response.json({ received: true, ignored: "charge-not-found" });
  }

  const result = await confirmPixCharge(charge);
  return Response.json({ received: true, ...result });
}

export const Route = createFileRoute("/api/public/misticpay")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: () => new Response("ok"),
    },
  },
});
