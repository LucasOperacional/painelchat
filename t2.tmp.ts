import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("misticpay_secrets").select("*").eq("provider","misticpay").maybeSingle();
const r = data as any;
const res = await fetch(`${r.base_url}/transactions/create`, { method:"POST", headers: { Authorization: "Basic " + Buffer.from(`${r.client_id}:${r.client_secret}`).toString("base64"), "Content-Type":"application/json", Accept:"application/json" }, body: JSON.stringify({ amount: 1.5, payerName: r.default_payer_name, payerDocument: r.default_payer_document, transactionId: "teste-"+Date.now(), description: "teste" }) });
const j = await res.json() as any;
console.log(Object.keys(j), Object.keys(j.data ?? {}));
for (const [k,v] of Object.entries(j.data ?? {})) console.log(k, typeof v === "string" ? v.slice(0,120) : v);
