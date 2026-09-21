import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DAS_MEI_BUCKET, DAS_MEI_MAX_BYTES, isPdfSignature, sanitizePdfName } from "@/lib/das-mei";

type Ctx = {
  supabase: { from: (t: string) => any };
  userId: string;
};

const claimInput = z.object({
  token: z.string().uuid(),
  nome: z.string().max(120).optional(),
});

/**
 * Finaliza um compartilhamento vindo do celular: move o PDF da área temporária
 * para a pasta privada do usuário e registra o documento.
 */
export const claimSharedDas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => claimInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as never as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const inboxPath = `_inbox/${data.token}.pdf`;
    const baixado = await supabaseAdmin.storage.from(DAS_MEI_BUCKET).download(inboxPath);
    if (baixado.error || !baixado.data) {
      return { ok: false as const, erro: "Arquivo compartilhado não encontrado ou já enviado." };
    }

    const bytes = new Uint8Array(await baixado.data.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > DAS_MEI_MAX_BYTES || !isPdfSignature(bytes.slice(0, 5))) {
      await supabaseAdmin.storage.from(DAS_MEI_BUCKET).remove([inboxPath]);
      return { ok: false as const, erro: "O arquivo compartilhado não é um PDF válido." };
    }

    const ano = String(new Date().getFullYear());
    const storagePath = `${userId}/${ano}/${crypto.randomUUID()}.pdf`;
    const up = await supabaseAdmin.storage.from(DAS_MEI_BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (up.error) return { ok: false as const, erro: up.error.message };

    const nome = sanitizePdfName(data.nome ?? "guia.pdf");
    const { data: row, error } = await supabase
      .from("das_mei_documentos")
      .insert({
        user_id: userId,
        nome_original: nome,
        storage_path: storagePath,
        tamanho_bytes: bytes.byteLength,
        status: "pendente",
      })
      .select("id")
      .single();

    if (error) {
      await supabaseAdmin.storage.from(DAS_MEI_BUCKET).remove([storagePath]);
      return { ok: false as const, erro: error.message };
    }

    await supabaseAdmin.storage.from(DAS_MEI_BUCKET).remove([inboxPath]);
    return { ok: true as const, id: (row as { id: string }).id };
  });

const enviarInput = z.object({
  docId: z.string().uuid(),
  contactId: z.string().uuid(),
  mensagem: z.string().max(500).optional(),
});

/** Envia a guia DAS em PDF para um contato pelo WhatsApp e registra na conversa. */
export const enviarDasParaContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => enviarInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as never as Ctx & { supabase: any };

    const { data: doc, error: docError } = await supabase
      .from("das_mei_documentos")
      .select("id, nome_original, storage_path, competencia, valor, data_vencimento")
      .eq("id", data.docId)
      .maybeSingle();
    if (docError) return { ok: false as const, erro: docError.message };
    if (!doc) return { ok: false as const, erro: "Guia não encontrada." };

    const { data: contato, error: contatoError } = await supabase
      .from("contacts")
      .select("id, name, phone, wa_jid")
      .eq("id", data.contactId)
      .maybeSingle();
    if (contatoError) return { ok: false as const, erro: contatoError.message };
    if (!contato) return { ok: false as const, erro: "Contato não encontrado." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Link temporário (24h) só para o WhatsApp baixar o arquivo do bucket privado.
    const assinado = await supabaseAdmin.storage
      .from(DAS_MEI_BUCKET)
      .createSignedUrl(doc.storage_path as string, 60 * 60 * 24, { download: doc.nome_original as string });
    if (assinado.error || !assinado.data?.signedUrl) {
      return { ok: false as const, erro: "Não foi possível preparar o arquivo para envio." };
    }

    // Conversa aberta com o contato (reaproveita quando já existe).
    let conversationId: string | null = null;
    let whatsappConfigId: string | null = null;
    const { data: aberta } = await supabase
      .from("conversations")
      .select("id, whatsapp_config_id")
      .eq("contact_id", data.contactId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aberta) {
      conversationId = aberta.id as string;
      whatsappConfigId = (aberta.whatsapp_config_id as string | null) ?? null;
    } else {
      const { data: fila } = await supabase
        .from("queues")
        .select("id, department_id")
        .eq("is_active", true)
        .order("priority")
        .limit(1)
        .maybeSingle();
      const criada = await supabase
        .from("conversations")
        .insert({
          contact_id: data.contactId,
          assigned_to: userId,
          status: "open",
          channel: "whatsapp",
          queue_id: fila?.id ?? null,
          department_id: fila?.department_id ?? null,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      conversationId = (criada.data?.id as string | undefined) ?? null;
    }

    const { ensureEvolutionDevice, evolutionSendMedia, evolutionSendText, loadEvolutionApiKey } =
      await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(whatsappConfigId);
    const apiKey = await loadEvolutionApiKey(config.id);
    if (!config.base_url || !config.instance_id || !apiKey) {
      return {
        ok: false as const,
        erro: "Conecte um dispositivo de WhatsApp em Administração → Dispositivos.",
      };
    }

    const jidDigits = contato.wa_jid ? digitsOnly(String(contato.wa_jid).split("@")[0] ?? "") : "";
    const digits = jidDigits || digitsOnly(String(contato.phone ?? ""));
    if (!digits) return { ok: false as const, erro: "Este contato não tem número de WhatsApp." };
    const isGroup = String(contato.wa_jid ?? "").includes("@g.us");
    const number = isGroup ? String(contato.wa_jid) : `${digits}@s.whatsapp.net`;

    const target = { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id };
    const legenda =
      (data.mensagem ?? "").trim() ||
      `Segue a guia DAS${doc.competencia ? ` da competência ${doc.competencia}` : ""}.`;

    let externalId: string | null = null;
    try {
      externalId = await evolutionSendMedia(target, {
        number,
        url: assinado.data.signedUrl,
        fileName: (doc.nome_original as string) || "das.pdf",
        mimeType: "application/pdf",
        caption: legenda,
      });
      if (legenda) {
        // Alguns aparelhos não exibem legenda em documento: reforça em texto.
        await evolutionSendText(target, { number, text: legenda }).catch(() => null);
      }
    } catch (e) {
      return { ok: false as const, erro: (e as Error).message };
    }

    if (conversationId) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        direction: "outbound",
        body: `${legenda}\n📎 ${doc.nome_original}: ${assinado.data.signedUrl}`,
        external_id: externalId,
      });
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    return { ok: true as const, conversationId, contato: String(contato.name ?? digits) };
  });
