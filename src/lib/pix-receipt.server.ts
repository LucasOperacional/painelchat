// Reconhecimento automático de comprovante de Pix.
// Quando a central envia a chave Pix, fica registrada uma cobrança pendente na
// conversa. Se o cliente responder com uma imagem (ou PDF) de comprovante, a
// IA confere o documento e, dando certo, o pagamento é confirmado sozinho.

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION_MODEL = "google/gemini-2.5-flash";

/** Primeira imagem/arquivo presente no corpo da mensagem recebida. */
export function extractMediaUrl(body: string): string | null {
  const text = body ?? "";
  if (!/🖼|📎|https?:\/\//.test(text)) return null;
  const match = text.match(/https?:\/\/\S+/);
  if (!match) return null;
  const url = match[0].replace(/[),.]+$/, "");
  if (!/\.(png|jpe?g|webp|pdf)(\?|$)/i.test(url) && !/🖼|📎/.test(text)) return null;
  return url;
}

export type ReceiptAnalysis = {
  isReceipt: boolean;
  amount: number | null;
  payer: string | null;
};

/** Pergunta à IA se a imagem recebida é um comprovante de Pix e qual o valor. */
export async function analyzePixReceipt(url: string): Promise<ReceiptAnalysis | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Você confere comprovantes de pagamento Pix brasileiros. Responda SOMENTE um JSON: " +
            '{"isReceipt": boolean, "amount": number|null, "payer": string|null}. ' +
            "isReceipt é true apenas se a imagem for mesmo um comprovante/recibo de transferência Pix concluída. " +
            "amount é o valor pago em reais (ponto como separador decimal).",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Este arquivo é um comprovante de Pix? Qual o valor?" },
            { type: "image_url", image_url: { url } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("[pix-receipt] IA respondeu", response.status, await response.text());
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const raw = payload?.choices?.[0]?.message?.content ?? "";
  const json = raw.match(/\{[\s\S]*\}/);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json[0]) as ReceiptAnalysis;
    return {
      isReceipt: !!parsed.isReceipt,
      amount: typeof parsed.amount === "number" && parsed.amount > 0 ? parsed.amount : null,
      payer: typeof parsed.payer === "string" ? parsed.payer : null,
    };
  } catch {
    return null;
  }
}

const formatBRL = (value: number) => value.toFixed(2).replace(".", ",");

/**
 * Chamado a cada mensagem recebida: se houver cobrança Pix pendente na conversa
 * e o cliente mandar um comprovante, confirma o pagamento automaticamente.
 */
export async function checkPixReceipt(conversationId: string, body: string) {
  const url = extractMediaUrl(body);
  if (!url) return { checked: false as const };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: charge } = await supabaseAdmin
    .from("pix_charges")
    .select(
      "id, conversation_id, whatsapp_config_id, amount, description, confirmed_at, estoque_categoria_id",
    )

    .eq("conversation_id", conversationId)
    .is("confirmed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!charge) return { checked: false as const };

  let analysis: ReceiptAnalysis | null = null;
  try {
    analysis = await analyzePixReceipt(url);
  } catch (error) {
    console.error("[pix-receipt] falha ao analisar:", (error as Error).message);
  }
  if (!analysis?.isReceipt) return { checked: true as const, confirmed: false };

  const expected = Number(charge.amount ?? 0);
  const paid = analysis.amount;

  // Pagou menos do que o cobrado: não confirma sozinho, avisa o atendente.
  // (Se pagou o valor certo ou a mais, segue e libera a entrega na hora.)
  if (expected > 0 && paid !== null && paid < expected - 0.01) {
    await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      direction: "system",
      body:
        `⚠️ Comprovante recebido de R$ ${formatBRL(paid)}, diferente do valor cobrado ` +
        `(R$ ${formatBRL(expected)}). Confira antes de confirmar o pagamento.`,
    });
    return { checked: true as const, confirmed: false, mismatch: true };
  }

  const { confirmPixCharge } = await import("@/lib/pix-confirm.server");
  const result = await confirmPixCharge({
    ...charge,
    amount: expected > 0 ? expected : (paid ?? 0),
  });
  return { checked: true as const, confirmed: result.confirmed };
}
