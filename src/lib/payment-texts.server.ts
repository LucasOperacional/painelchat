// Textos de pagamento editáveis (Pix e cobranças). Uso exclusivo no servidor.

/** Busca um texto salvo; devolve "" quando não existe. */
export async function loadPaymentText(key: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("payment_texts")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) return "";
  return String((data as { value?: string } | null)?.value ?? "");
}

/** Substitui variáveis {nome} no texto pelos valores informados. */
export function aplicarVariaveis(texto: string, variaveis: Record<string, string>): string {
  let saida = texto;
  for (const [chave, valor] of Object.entries(variaveis)) {
    saida = saida.split(`{${chave}}`).join(valor);
  }
  return saida;
}
