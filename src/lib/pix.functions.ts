import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PIX_KEY_TYPES = [
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "random", label: "Chave aleatória" },
] as const;

export type PixKeyType = (typeof PIX_KEY_TYPES)[number]["value"];

const pixSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().trim().max(60).default("Pagamento via Pix"),
  description: z.string().trim().max(600).default(""),
  buttonText: z.string().trim().max(20).default("Pagar com Pix"),
  keyType: z.enum(["phone", "email", "cpf", "cnpj", "random"]),
  key: z.string().trim().min(3, "Informe a chave Pix").max(120),
  name: z.string().trim().min(1, "Informe o nome do recebedor").max(60),
  city: z.string().trim().max(40).default("SAO PAULO"),
  amount: z.string().trim().max(20).default(""),
  estoqueCategoriaId: z.string().uuid().nullable().default(null),
});

/** Remove acentos e caracteres não aceitos no BR Code. */
function sanitize(text: string, max: number) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .slice(0, max);
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** Normaliza a chave conforme o tipo (telefone vira +55..., CPF/CNPJ só dígitos). */
export function normalizePixKey(key: string, keyType: string) {
  const raw = key.trim();
  if (keyType === "phone") {
    const digits = raw.replace(/\D/g, "");
    return `+${digits.startsWith("55") ? digits : `55${digits}`}`;
  }
  if (keyType === "cpf" || keyType === "cnpj") return raw.replace(/\D/g, "");
  return raw;
}

/** Gera o código Pix "copia e cola" (BR Code EMV). */
export function buildPixPayload(input: {
  key: string;
  keyType: string;
  name: string;
  city: string;
  amount: string;
}) {
  const key = normalizePixKey(input.key, input.keyType);
  const amount = input.amount.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const merchant = field("00", "br.gov.bcb.pix") + field("01", key);
  let payload =
    field("00", "01") +
    field("26", merchant) +
    field("52", "0000") +
    field("53", "986") +
    (amount && Number(amount) > 0 ? field("54", Number(amount).toFixed(2)) : "") +
    field("58", "BR") +
    field("59", sanitize(input.name, 25) || "RECEBEDOR") +
    field("60", sanitize(input.city, 15) || "SAO PAULO") +
    field("62", field("05", "***"));
  payload += "6304";
  return payload + crc16(payload);
}

function pixText(input: {
  title: string;
  description: string;
  name: string;
  key: string;
  amount: string;
  payload: string;
}) {
  const lines = [`*${input.title}*`];
  if (input.description) lines.push("", input.description);
  if (input.amount) lines.push("", `Valor: R$ ${input.amount}`);
  lines.push(
    "",
    `Recebedor: ${input.name}`,
    `Chave Pix: \`\`\`${input.key}\`\`\``,
    "",
    "Pix copia e cola:",
    `\`\`\`${input.payload}\`\`\``,
  );
  return lines.join("\n");
}

type AlvoEnvio = { baseUrl: string; instanceId: string; configId: string };

/**
 * Entrega o Pix no formato de cartão com o botão nativo "Copiar" do WhatsApp
 * (Evolution Go: POST /send/button type=copy — WuzAPI: /chat/send/buttons com
 * copy_code). Se o servidor não suportar botões, cai para o QR Code em imagem
 * e, por último, para o texto com o copia e cola.
 */
async function entregarPix(
  target: AlvoEnvio,
  input: {
    number: string;
    title: string;
    description: string;
    footer?: string;
    copyCode: string;
    buttonLabel?: string;
    imageUrl?: string;
    texto: string;
  },
): Promise<{
  externalId: string | null;
  delivered: boolean;
  deliveryError: string | null;
  usouCard: boolean;
}> {
  const { evolutionSendButton, evolutionSendMedia, evolutionSendText } = await import(
    "@/lib/evolution.server"
  );

  try {
    const id = (await evolutionSendButton(target, {
      number: input.number,
      title: input.title,
      description: input.description,
      footer: input.footer ?? "",
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      buttons: [
        {
          type: "copy",
          displayText: input.buttonLabel || "Copiar chave Pix",
          id: "pix_copiar",
          copyCode: input.copyCode,
        },
      ],
    })) as string | null;
    return { externalId: id, delivered: true, deliveryError: null, usouCard: true };
  } catch (buttonError) {
    let deliveryError = (buttonError as Error).message;
    if (input.imageUrl) {
      try {
        const id = (await evolutionSendMedia(target, {
          number: input.number,
          url: input.imageUrl,
          fileName: "pix.png",
          mimeType: "image/png",
          caption: input.texto,
        })) as string | null;
        return { externalId: id, delivered: true, deliveryError: null, usouCard: false };
      } catch (mediaError) {
        deliveryError = (mediaError as Error).message;
      }
    }
    try {
      const id = (await evolutionSendText(target, {
        number: input.number,
        text: input.texto,
      })) as string | null;
      return { externalId: id, delivered: true, deliveryError: null, usouCard: false };
    } catch (textError) {
      return {
        externalId: null,
        delivered: false,
        deliveryError: (textError as Error).message || deliveryError,
        usouCard: false,
      };
    }
  }
}


/** Envia o card de Pix da Evolution Go na conversa e registra no histórico. */
export const sendPixCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => pixSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, first_response_at, whatsapp_config_id, contact:contacts(id, phone, wa_jid)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const contact = conversation.contact as { phone: string; wa_jid: string | null } | null;
    if (!contact) throw new Error("Contato da conversa não encontrado.");

    const { ensureEvolutionDevice, loadEvolutionApiKey } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(conversation.whatsapp_config_id ?? null);
    const canSend =
      !!config?.base_url && !!config?.instance_id && !!(await loadEvolutionApiKey(config.id));

    const payload = buildPixPayload(data);
    const body = pixText({ ...data, payload });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(payload)}`;
    let externalId: string | null = null;
    let deliveryError: string | null = null;
    let delivered = false;
    let usouCard = false;

    if (canSend) {
      const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
      const isGroupChat = !!contact.wa_jid?.includes("@g.us");
      const recipientDigits = jidDigits || digitsOnly(contact.phone);
      // Assim como no envio comum, o JID completo evita que a Evolution apenas
      // aceite/enfileire a mídia sem entregá-la ao destinatário correto.
      const number = isGroupChat ? contact.wa_jid! : `${recipientDigits}@s.whatsapp.net`;
      const target = {
        baseUrl: config!.base_url,
        instanceId: config!.instance_id,
        configId: config!.id,
      };

      const descricao = [
        data.description,
        `${PIX_KEY_TYPES.find((t) => t.value === data.keyType)?.label ?? "Chave"}: ${data.key}`,
        data.amount ? `Valor: R$ ${data.amount}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const entrega = await entregarPix(target, {
        number,
        title: data.name || data.title,
        description: descricao,
        footer: data.title,
        copyCode: payload,
        buttonLabel: data.buttonText || "Copiar chave Pix",
        imageUrl: qrUrl,
        texto: body,
      });
      externalId = entrega.externalId;
      delivered = entrega.delivered;
      deliveryError = entrega.deliveryError;
      usouCard = entrega.usouCard;
    } else {
      deliveryError = "Conecte um dispositivo de WhatsApp para enviar o Pix.";
    }


    const insert = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound",
      body: delivered && externalId && !usouCard ? `🖼 Imagem: ${qrUrl}\n${body}` : body,
      external_id: externalId,
    });
    if (insert.error) throw new Error(insert.error.message);

    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    // Deixa a cobrança pendente registrada: assim, quando o cliente responder
    // com o comprovante, o sistema reconhece e confirma o pagamento sozinho.
    if (delivered) {
      const parsedAmount = Number(
        data.amount.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""),
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("pix_charges").insert({
        transaction_id: `manual-${crypto.randomUUID()}`,
        conversation_id: data.conversationId,
        whatsapp_config_id: conversation.whatsapp_config_id ?? null,
        amount: Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0,
        description: data.title || "Pagamento via Pix",
        status: "pendente",
        provider: "manual",
        estoque_categoria_id: data.estoqueCategoriaId,
      });
    }

    return { sent: delivered, deliveryError };
  });

// ---------------------------------------------------------------------------
// Cobrança Pix pela MisticPay (https://docs.misticpay.com)
// Gera a cobrança com valor no gateway e entrega o QR Code + copia e cola.
// ---------------------------------------------------------------------------

const misticSchema = z.object({
  conversationId: z.string().uuid(),
  amount: z.string().trim().min(1, "Informe o valor da cobrança"),
  description: z.string().trim().max(140).default("Pagamento via Pix"),
  payerName: z.string().trim().max(80).default(""),
  payerDocument: z.string().trim().max(20).default(""),
  estoqueCategoriaId: z.string().uuid().nullable().default(null),
});

function parseAmount(value: string) {
  const normalized = value
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor da cobrança inválido.");
  return Math.round(amount * 100) / 100;
}

function formatBRL(amount: number) {
  return amount.toFixed(2).replace(".", ",");
}

export const sendMisticpayCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => misticSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(
        "id, first_response_at, whatsapp_config_id, contact:contacts(id, name, phone, wa_jid)",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const contact = conversation.contact as {
      name: string | null;
      phone: string;
      wa_jid: string | null;
    } | null;
    if (!contact) throw new Error("Contato da conversa não encontrado.");

    const { loadMisticpayCredentials, misticpayCreateCharge } = await import(
      "@/lib/misticpay.server"
    );
    const creds = await loadMisticpayCredentials();
    if (!creds) {
      throw new Error("Cadastre as credenciais da MisticPay em Configurações → MisticPay.");
    }

    const amount = parseAmount(data.amount);
    const payerName =
      data.payerName.trim() || contact.name?.trim() || creds.defaultPayerName || "Cliente";
    const payerDocument =
      data.payerDocument.replace(/\D/g, "") ||
      (creds.defaultPayerDocument ?? "").replace(/\D/g, "");
    if (payerDocument && payerDocument.length !== 11) {
      throw new Error("O CPF do pagador, quando informado, precisa ter 11 dígitos.");
    }
    if (!payerDocument) {
      throw new Error(
        "A MisticPay exige um CPF para gerar a cobrança. Informe o CPF do pagador ou cadastre um CPF padrão em Configurações → MisticPay.",
      );
    }

    const transactionId = `conv-${data.conversationId.slice(0, 8)}-${Date.now()}`;
    const webhookToken = process.env["MISTICPAY_WEBHOOK_TOKEN"] ?? "";
    const publicBase = (
      process.env["PUBLIC_SITE_URL"] ??
      "https://project--7735c9b1-51e5-4325-8317-f1e55fa697f4.lovable.app"
    ).replace(/\/+$/, "");

    const charge = await misticpayCreateCharge({
      amount,
      payerName,
      payerDocument,
      description: data.description || "Pagamento via Pix",
      transactionId,
      ...(webhookToken
        ? {
            projectWebhook: `${publicBase}/api/public/misticpay?token=${encodeURIComponent(
              webhookToken,
            )}`,
          }
        : {}),
    });

    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("pix_charges").insert({
        transaction_id: charge.transactionId || transactionId,
        conversation_id: data.conversationId,
        whatsapp_config_id: conversation.whatsapp_config_id ?? null,
        amount,
        description: data.description || "Pagamento via Pix",
        estoque_categoria_id: data.estoqueCategoriaId,
      });
    }


    const body = [
      `*${data.description || "Pagamento via Pix"}*`,
      "",
      `Valor: R$ ${formatBRL(amount)}`,
      "",
      "Pague pelo QR Code acima ou use o Pix copia e cola:",
      `\`\`\`${charge.copyPaste}\`\`\``,
    ].join("\n");

    const { ensureEvolutionDevice, loadEvolutionApiKey } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(conversation.whatsapp_config_id ?? null);
    const canSend =
      !!config?.base_url && !!config?.instance_id && !!(await loadEvolutionApiKey(config.id));

    let externalId: string | null = null;
    let deliveryError: string | null = null;
    let delivered = false;
    let usouCard = false;

    if (canSend) {
      const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
      const isGroupChat = !!contact.wa_jid?.includes("@g.us");
      const recipientDigits = jidDigits || digitsOnly(contact.phone);
      const number = isGroupChat ? contact.wa_jid! : `${recipientDigits}@s.whatsapp.net`;
      const target = {
        baseUrl: config!.base_url,
        instanceId: config!.instance_id,
        configId: config!.id,
      };

      const entrega = await entregarPix(target, {
        number,
        title: data.description || "Pagamento via Pix",
        description: `Valor: R$ ${formatBRL(amount)}`,
        footer: "Toque em Copiar e cole no app do seu banco",
        copyCode: charge.copyPaste,
        buttonLabel: "Copiar chave Pix",
        imageUrl: charge.qrCodeUrl,
        texto: body,
      });
      externalId = entrega.externalId;
      delivered = entrega.delivered;
      deliveryError = entrega.deliveryError;
      usouCard = entrega.usouCard;
    } else {
      deliveryError = "Conecte um dispositivo de WhatsApp para enviar a cobrança.";
    }


    const insert = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound",
      body:
        delivered && externalId && !usouCard
          ? `🖼 Imagem: ${charge.qrCodeUrl}\n${body}`
          : body,

      external_id: externalId,
    });
    if (insert.error) throw new Error(insert.error.message);

    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    return {
      sent: delivered,
      deliveryError,
      transactionId: charge.transactionId,
      copyPaste: charge.copyPaste,
      amount,
    };
  });

// ---------------------------------------------------------------------------
// Cobrança Pix pela Efí Bank (https://dev.efipay.com.br/docs/api-pix)
// ---------------------------------------------------------------------------

const efiSchema = z.object({
  conversationId: z.string().uuid(),
  amount: z.string().trim().min(1, "Informe o valor da cobrança"),
  description: z.string().trim().max(140).default("Pagamento via Pix"),
  payerName: z.string().trim().max(80).default(""),
  payerDocument: z.string().trim().max(20).default(""),
  estoqueCategoriaId: z.string().uuid().nullable().default(null),
});

export const sendEfiCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => efiSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(
        "id, first_response_at, whatsapp_config_id, contact:contacts(id, name, phone, wa_jid)",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const contact = conversation.contact as {
      name: string | null;
      phone: string;
      wa_jid: string | null;
    } | null;
    if (!contact) throw new Error("Contato da conversa não encontrado.");

    const { efiCreateCharge } = await import("@/lib/efi.server");
    const amount = parseAmount(data.amount);
    const description = data.description || "Pagamento via Pix";

    const charge = await efiCreateCharge({
      amount,
      description,
      payerName: data.payerName.trim() || contact.name?.trim() || "Cliente",
      payerDocument: data.payerDocument,
    });

    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("pix_charges").insert({
        provider: "efi",
        transaction_id: charge.txid,
        conversation_id: data.conversationId,
        whatsapp_config_id: conversation.whatsapp_config_id ?? null,
        amount,
        description,
        estoque_categoria_id: data.estoqueCategoriaId,
      });
    }

    const body = [
      `*${description}*`,
      "",
      `Valor: R$ ${formatBRL(amount)}`,
      "",
      "Pague pelo QR Code acima ou use o Pix copia e cola:",
      `\`\`\`${charge.copyPaste}\`\`\``,
    ].join("\n");

    const { ensureEvolutionDevice, loadEvolutionApiKey } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(conversation.whatsapp_config_id ?? null);
    const canSend =
      !!config?.base_url && !!config?.instance_id && !!(await loadEvolutionApiKey(config.id));

    let externalId: string | null = null;
    let deliveryError: string | null = null;
    let delivered = false;
    let usouCard = false;

    if (canSend) {
      const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
      const isGroupChat = !!contact.wa_jid?.includes("@g.us");
      const recipientDigits = jidDigits || digitsOnly(contact.phone);
      const number = isGroupChat ? contact.wa_jid! : `${recipientDigits}@s.whatsapp.net`;
      const target = {
        baseUrl: config!.base_url,
        instanceId: config!.instance_id,
        configId: config!.id,
      };

      const entrega = await entregarPix(target, {
        number,
        title: description,
        description: `Valor: R$ ${formatBRL(amount)}`,
        footer: "Toque em Copiar e cole no app do seu banco",
        copyCode: charge.copyPaste,
        buttonLabel: "Copiar chave Pix",
        imageUrl: charge.qrCodeUrl,
        texto: body,
      });
      externalId = entrega.externalId;
      delivered = entrega.delivered;
      deliveryError = entrega.deliveryError;
      usouCard = entrega.usouCard;
    } else {
      deliveryError = "Conecte um dispositivo de WhatsApp para enviar a cobrança.";
    }


    const insert = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound",
      body:
        delivered && externalId && !usouCard
          ? `🖼 Imagem: ${charge.qrCodeUrl}\n${body}`
          : body,

      external_id: externalId,
    });
    if (insert.error) throw new Error(insert.error.message);

    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    return {
      sent: delivered,
      deliveryError,
      transactionId: charge.txid,
      copyPaste: charge.copyPaste,
      amount,
    };
  });

// ---------------------------------------------------------------------------
// Cobrança Pix pela AltisPay (https://app.altispay.com.br/docs)
// ---------------------------------------------------------------------------

const altispaySchema = z.object({
  conversationId: z.string().uuid(),
  amount: z.string().trim().min(1, "Informe o valor da cobrança"),
  description: z.string().trim().max(140).default("Pagamento via Pix"),
  payerName: z.string().trim().max(80).default(""),
  payerDocument: z.string().trim().max(20).default(""),
  estoqueCategoriaId: z.string().uuid().nullable().default(null),
});

export const sendAltispayCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => altispaySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select(
        "id, first_response_at, whatsapp_config_id, contact:contacts(id, name, phone, wa_jid)",
      )
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const contact = conversation.contact as {
      name: string | null;
      phone: string;
      wa_jid: string | null;
    } | null;
    if (!contact) throw new Error("Contato da conversa não encontrado.");

    const { loadAltispayCredentials, altispayCreateCharge } = await import(
      "@/lib/altispay.server"
    );
    const creds = await loadAltispayCredentials();
    if (!creds) {
      throw new Error("Cadastre a chave de API da AltisPay em Configurações → AltisPay.");
    }

    const amount = parseAmount(data.amount);
    const description = data.description || "Pagamento via Pix";
    const payerDocument =
      data.payerDocument.replace(/\D/g, "") || creds.defaultPayerDocument || "";
    if (payerDocument && payerDocument.length !== 11 && payerDocument.length !== 14) {
      throw new Error("O CPF/CNPJ do pagador, quando informado, precisa ter 11 ou 14 dígitos.");
    }

    const charge = await altispayCreateCharge({
      amount,
      description,
      payerName: data.payerName.trim() || contact.name?.trim() || creds.defaultPayerName || "Cliente",
      payerDocument,
      payerEmail: creds.defaultPayerEmail,
      externalReference: `conv-${data.conversationId.slice(0, 8)}-${Date.now()}`,
    });

    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("pix_charges").insert({
        provider: "altispay",
        transaction_id: charge.id,
        conversation_id: data.conversationId,
        whatsapp_config_id: conversation.whatsapp_config_id ?? null,
        amount,
        description,
        estoque_categoria_id: data.estoqueCategoriaId,
      });
    }

    const body = [
      `*${description}*`,
      "",
      `Valor: R$ ${formatBRL(amount)}`,
      "",
      "Pague pelo QR Code acima ou use o Pix copia e cola:",
      `\`\`\`${charge.copyPaste}\`\`\``,
    ].join("\n");

    const { ensureEvolutionDevice, loadEvolutionApiKey } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(conversation.whatsapp_config_id ?? null);
    const canSend =
      !!config?.base_url && !!config?.instance_id && !!(await loadEvolutionApiKey(config.id));

    let externalId: string | null = null;
    let deliveryError: string | null = null;
    let delivered = false;
    let usouCard = false;

    if (canSend) {
      const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
      const isGroupChat = !!contact.wa_jid?.includes("@g.us");
      const recipientDigits = jidDigits || digitsOnly(contact.phone);
      const number = isGroupChat ? contact.wa_jid! : `${recipientDigits}@s.whatsapp.net`;
      const target = {
        baseUrl: config!.base_url,
        instanceId: config!.instance_id,
        configId: config!.id,
      };

      const entrega = await entregarPix(target, {
        number,
        title: description,
        description: `Valor: R$ ${formatBRL(amount)}`,
        footer: "Toque em Copiar e cole no app do seu banco",
        copyCode: charge.copyPaste,
        buttonLabel: "Copiar chave Pix",
        imageUrl: charge.qrCodeUrl,
        texto: body,
      });
      externalId = entrega.externalId;
      delivered = entrega.delivered;
      deliveryError = entrega.deliveryError;
      usouCard = entrega.usouCard;
    } else {
      deliveryError = "Conecte um dispositivo de WhatsApp para enviar a cobrança.";
    }


    const insert = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound",
      body:
        delivered && externalId && !usouCard
          ? `🖼 Imagem: ${charge.qrCodeUrl}\n${body}`
          : body,

      external_id: externalId,
    });
    if (insert.error) throw new Error(insert.error.message);

    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    return {
      sent: delivered,
      deliveryError,
      transactionId: charge.id,
      copyPaste: charge.copyPaste,
      amount,
    };
  });

// ---------------------------------------------------------------------------
// Verificação automática: consulta no gateway (MisticPay, Efí ou AltisPay) as
// cobranças ainda pendentes e, quando o Pix cai na conta, envia a mensagem de
// pagamento confirmado.
// ---------------------------------------------------------------------------


export const checkPendingPixCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pending } = await supabaseAdmin
      .from("pix_charges")
      .select(
        "id, provider, transaction_id, conversation_id, whatsapp_config_id, amount, description, confirmed_at, estoque_categoria_id",
      )
      .is("confirmed_at", null)
      .gte("created_at", since)
      .limit(25);

    if (!pending?.length) return { checked: 0, confirmed: 0 };

    const { misticpayCheckCharge, misticpayTransactionStatus } = await import(
      "@/lib/misticpay.server"
    );
    const { isPaidStatus, confirmPixCharge } = await import("@/lib/pix-confirm.server");

    let confirmed = 0;
    for (const charge of pending) {
      try {
        let status: string;
        const provider = (charge as { provider?: string }).provider;
        // Chave Pix manual não tem gateway: a confirmação vem do comprovante.
        if (provider === "manual") continue;
        if (provider === "efi") {
          const { efiCheckCharge, efiChargeStatus } = await import("@/lib/efi.server");
          status = efiChargeStatus(await efiCheckCharge(charge.transaction_id));
        } else if (provider === "altispay") {
          const { altispayCheckCharge, altispayChargeStatus } = await import(
            "@/lib/altispay.server"
          );
          status = altispayChargeStatus(await altispayCheckCharge(charge.transaction_id));
        } else {
          status = misticpayTransactionStatus(await misticpayCheckCharge(charge.transaction_id));
        }
        if (!isPaidStatus(status)) continue;
        const result = await confirmPixCharge(charge);
        if (result.confirmed) confirmed += 1;
      } catch {
        /* uma cobrança com erro não interrompe as demais */
      }
    }

    return { checked: pending.length, confirmed };
  });
