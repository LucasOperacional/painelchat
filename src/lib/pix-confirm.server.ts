// Confirmação de pagamento Pix (MisticPay) — usada pelo webhook e pela
// verificação automática feita pela tela de atendimento.

export const PAID_TOKENS = [
  "paid",
  "pago",
  "approved",
  "aprovad",
  "completed",
  "completo",
  "concluid",
  "success",
];

export function isPaidStatus(status: string) {
  const s = (status ?? "").toLowerCase();
  return PAID_TOKENS.some((token) => s.includes(token));
}

function formatBRL(amount: number) {
  return amount.toFixed(2).replace(".", ",");
}

export type PixChargeRow = {
  id: string;
  conversation_id: string;
  whatsapp_config_id: string | null;
  amount: number | string;
  description: string | null;
  confirmed_at: string | null;
  estoque_categoria_id?: string | null;
};


/** Marca a cobrança como paga e avisa o cliente no WhatsApp (uma única vez). */
export async function confirmPixCharge(charge: PixChargeRow) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (charge.confirmed_at) return { confirmed: false, reason: "already-confirmed" as const };

  const now = new Date().toISOString();
  // Trava: só segue quem conseguir marcar a linha ainda não confirmada.
  const { data: locked } = await supabaseAdmin
    .from("pix_charges")
    .update({ status: "pago", paid_at: now, confirmed_at: now })
    .eq("id", charge.id)
    .is("confirmed_at", null)
    .select("id")
    .maybeSingle();
  if (!locked) return { confirmed: false, reason: "already-confirmed" as const };

  const amount = Number(charge.amount ?? 0);

  // Entrada na carteira do sistema (tela Banco).
  await supabaseAdmin.from("bank_transactions").insert({
    direction: "in",
    amount,
    description: charge.description || "Pix recebido",
    status: "pago",
    provider: "misticpay",
    transaction_id: `charge-${charge.id}`,
    paid_at: now,
  });
  // Estoque vinculado: libera o login automaticamente junto com a confirmação.
  const { entregarEstoqueDaCobranca } = await import("@/lib/estoque.server");
  const entrega = await entregarEstoqueDaCobranca(charge);

  const { loadPaymentText, aplicarVariaveis } = await import("@/lib/payment-texts.server");
  const modeloConfirmacao = (await loadPaymentText("pix_confirmacao")).trim();
  const text = modeloConfirmacao
    ? [
        aplicarVariaveis(modeloConfirmacao, {
          valor: `R$ ${formatBRL(amount)}`,
          descricao: charge.description ?? "",
        }),
        ...(entrega ? ["", entrega.texto] : []),
      ].join("\n")
    : [
        "✅ *Pagamento confirmado!*",
        "",
        `Recebemos o seu Pix de R$ ${formatBRL(amount)}${
          charge.description ? ` referente a ${charge.description}` : ""
        }.`,
        ...(entrega ? ["", entrega.texto] : []),
        "",
        "Obrigado! Qualquer dúvida é só chamar por aqui.",
      ].join("\n");


  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("id, whatsapp_config_id, contact:contacts(phone, wa_jid)")
    .eq("id", charge.conversation_id)
    .maybeSingle();

  const contact = (conversation?.contact ?? null) as
    | { phone: string; wa_jid: string | null }
    | null;

  let externalId: string | null = null;
  let deliveryError: string | null = null;

  if (contact) {
    try {
      const { ensureEvolutionDevice, loadEvolutionApiKey, evolutionSendText } = await import(
        "@/lib/evolution.server"
      );
      const { digitsOnly } = await import("@/lib/phone");

      const config = await ensureEvolutionDevice(
        charge.whatsapp_config_id ?? conversation?.whatsapp_config_id ?? null,
      );
      const hasKey = config ? await loadEvolutionApiKey(config.id) : null;
      if (config?.base_url && config.instance_id && hasKey) {
        const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
        const isGroupChat = !!contact.wa_jid?.includes("@g.us");
        const number = isGroupChat
          ? contact.wa_jid!
          : `${jidDigits || digitsOnly(contact.phone)}@s.whatsapp.net`;
        externalId = await evolutionSendText(
          { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
          { number, text },
        );
      } else {
        deliveryError = "Nenhum dispositivo de WhatsApp conectado.";
      }
    } catch (error) {
      deliveryError = (error as Error).message;
    }
  } else {
    deliveryError = "Contato da conversa não encontrado.";
  }

  await supabaseAdmin.from("messages").insert({
    conversation_id: charge.conversation_id,
    direction: externalId ? "outbound" : "system",
    body: externalId ? text : `${text}\n\n(não enviado: ${deliveryError ?? "sem contato"})`,
    external_id: externalId,
  });

  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: now })
    .eq("id", charge.conversation_id);

  return { confirmed: true, sent: !!externalId, deliveryError };
}
