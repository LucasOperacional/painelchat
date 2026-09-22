import { supabaseAdmin } from "@/integrations/supabase/client.server";
const { data } = await supabaseAdmin.from("webhook_eventos").select("id,payload,created_at").eq("id","2f1ce90c-7aff-4e9d-a169-c1d2af05359a").single();
const p = (data as any).payload as Record<string, any>;
console.log("chaves:", Object.keys(p));
const form = new URLSearchParams();
for (const [k,v] of Object.entries(p)) if (typeof v === "string") form.set(k, v);
const res = await fetch("http://localhost:8080/api/public/evolution?token=cac568acac7e4fd5b3051173ba96d621", { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body: form.toString() });
console.log(res.status, await res.text());
