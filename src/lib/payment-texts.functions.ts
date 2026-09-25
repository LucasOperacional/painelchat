import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PAYMENT_TEXT_KEYS = ["pix_padrao", "pix_confirmacao", "cobranca_padrao"] as const;
export type PaymentTextKey = (typeof PAYMENT_TEXT_KEYS)[number];

/** Textos de pagamento salvos (vazio = usa o padrão do sistema). */
export const getPaymentTexts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("payment_texts").select("key, value");
    if (error) throw new Error(error.message);
    const mapa: Record<string, string> = {};
    for (const linha of (data ?? []) as { key: string; value: string }[]) {
      mapa[linha.key] = linha.value;
    }
    return {
      pix_padrao: mapa["pix_padrao"] ?? "",
      pix_confirmacao: mapa["pix_confirmacao"] ?? "",
      cobranca_padrao: mapa["cobranca_padrao"] ?? "",
    };
  });

const saveSchema = z.object({
  pix_padrao: z.string().trim().max(2000).default(""),
  pix_confirmacao: z.string().trim().max(2000).default(""),
  cobranca_padrao: z.string().trim().max(2000).default(""),
});

export const savePaymentTexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const agora = new Date().toISOString();
    const linhas = (Object.entries(data) as [string, string][]).map(([key, value]) => ({
      key,
      value,
      updated_at: agora,
    }));
    const { error } = await context.supabase
      .from("payment_texts")
      .upsert(linhas, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
