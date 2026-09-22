import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("misticpay_secrets").select("*").eq("provider","misticpay").maybeSingle();
const r = data as any;
const body = JSON.stringify({ amount: 1.5, payerName: r.default_payer_name, payerDocument: r.default_payer_document, transactionId: "teste-"+Date.now(), description: "teste" });
for (const [nome, headers] of [
  ["basic", { Authorization: "Basic " + Buffer.from(`${r.client_id}:${r.client_secret}`).toString("base64") }],
  ["cics", { ci: r.client_id, cs: r.client_secret }],
] as const) {
  const res = await fetch(`${r.base_url}/transactions/create`, { method:"POST", headers: { ...headers, "Content-Type":"application/json", Accept:"application/json" }, body });
  console.log(nome, res.status, (await res.text()).slice(0,500));
}
