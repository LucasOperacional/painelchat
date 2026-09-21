import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = {
  supabase: { from: (t: string) => any };
  userId: string;
};

/** Formatos suportados pela Evolution Go. */
export type ButtonMenuKind = "text" | "button" | "list";

/** Para onde a conversa vai quando o cliente clica na opção. */
export type MenuRouteAction = "none" | "queue" | "department";

export type MenuOptionRoute = {
  action: MenuRouteAction;
  targetId: string | null;
  reply: string;
};

export type ButtonMenu = {
  id: string;
  title: string;
  message: string;
  options: string[];
  option_routes: MenuOptionRoute[];
  kind: ButtonMenuKind;
  footer: string;
  button_text: string;
  image_url: string;
};

export const MENU_KIND_LABELS: Record<ButtonMenuKind, string> = {
  text: "Texto numerado",
  button: "Botões (até 3)",
  list: "Menu em lista",
};

/** Lista os menus de botão disponíveis para todos os atendentes. */
export const listButtonMenus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as never as Ctx;
    const { data, error } = await supabase
      .from("button_menus")
      .select("id, title, message, options, option_routes, kind, footer, button_text, image_url")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ButtonMenu[];
  });

async function assertAdmin(ctx: Ctx) {
  const { data: roles, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  if (!((roles ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem gerenciar os menus de botão.");
  }
}

const menuSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Informe um título"),
  message: z.string().trim().max(1000).default(""),
  options: z.array(z.string().trim().min(1)).min(1, "Adicione ao menos uma opção").max(10),
  kind: z.enum(["text", "button", "list"]).default("text"),
  footer: z.string().trim().max(200).default(""),
  buttonText: z.string().trim().max(24).default("Ver menu"),
  imageUrl: z.string().trim().max(500).default(""),
  optionRoutes: z
    .array(
      z.object({
        action: z.enum(["none", "queue", "department"]).default("none"),
        targetId: z.string().uuid().nullable().default(null),
        reply: z.string().trim().max(500).default(""),
      }),
    )
    .default([]),
});

/** Filas e departamentos disponíveis como destino das opções do menu. */
export const listMenuTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as never as Ctx;
    const [queues, departments] = await Promise.all([
      supabase.from("queues").select("id, name").eq("is_active", true).order("name"),
      supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    ]);
    return {
      queues: (queues.data ?? []) as { id: string; name: string }[],
      departments: (departments.data ?? []) as { id: string; name: string }[],
    };
  });

export const saveButtonMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => menuSchema.parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as never as Ctx;
    await assertAdmin(ctx);
    if (data.kind === "button" && data.options.length > 3) {
      throw new Error("O WhatsApp aceita no máximo 3 botões. Use o menu em lista.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      title: data.title,
      message: data.message,
      options: data.options,
      option_routes: data.options.map((_, i) => {
        const route = data.optionRoutes[i];
        const action = route?.action ?? "none";
        return {
          action,
          targetId: action === "none" ? null : (route?.targetId ?? null),
          reply: route?.reply ?? "",
        };
      }),
      kind: data.kind,
      footer: data.footer,
      button_text: data.buttonText || "Ver menu",
      image_url: data.imageUrl,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabaseAdmin.from("button_menus").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("button_menus").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteButtonMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as never as Ctx;
    await assertAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("button_menus").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Formata o menu como mensagem de texto numerada para envio no WhatsApp. */
export function formatButtonMenuText(menu: Pick<ButtonMenu, "title" | "message" | "options">) {
  const lines: string[] = [`*${menu.title}*`];
  if (menu.message) lines.push("", menu.message);
  lines.push("");
  menu.options.forEach((opt, i) => lines.push(`*${i + 1}* - ${opt}`));
  lines.push("", "Responda com o número da opção desejada.");
  return lines.join("\n");
}

/**
 * Envia o menu na conversa usando o formato nativo da Evolution Go
 * (/send/button ou /send/list) e registra a mensagem no histórico.
 */
export const sendButtonMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ conversationId: z.string().uuid(), menuId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: menu, error: menuError } = await supabase
      .from("button_menus")
      .select("id, title, message, options, option_routes, kind, footer, button_text, image_url")
      .eq("id", data.menuId)
      .maybeSingle();
    if (menuError) throw new Error(menuError.message);
    if (!menu) throw new Error("Menu não encontrado.");

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, first_response_at, whatsapp_config_id, contact:contacts(id, phone, wa_jid)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conversation) throw new Error("Conversa não encontrada.");

    const contact = conversation.contact as { phone: string; wa_jid: string | null } | null;
    if (!contact) throw new Error("Contato da conversa não encontrado.");

    const {
      ensureEvolutionDevice,
      loadEvolutionApiKey,
      evolutionSendButton,
      evolutionSendList,
      evolutionSendText,
    } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const config = await ensureEvolutionDevice(conversation.whatsapp_config_id ?? null);
    const canSend =
      !!config?.base_url && !!config?.instance_id && !!(await loadEvolutionApiKey(config.id));

    const options = (menu.options ?? []) as string[];
    const menuText = formatButtonMenuText(menu as ButtonMenu);
    let externalId: string | null = null;
    let deliveryError: string | null = null;
    let delivered = false;

    if (canSend) {
      const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
      const isGroupChat = !!contact.wa_jid?.includes("@g.us");
      const recipientDigits = jidDigits || digitsOnly(contact.phone);
      // /send/button e /send/list exigem somente os dígitos para contatos.
      // Grupos continuam usando o JID completo.
      const number = isGroupChat ? contact.wa_jid! : recipientDigits;
      const target = {
        baseUrl: config!.base_url,
        instanceId: config!.instance_id,
        configId: config!.id,
      };

      try {
        if (menu.kind === "button") {
          externalId = await evolutionSendButton(target, {
            number,
            title: menu.title,
            description: menu.message || menu.title,
            footer: menu.footer?.trim() || "Toque em uma opção para continuar",
            ...(menu.image_url ? { imageUrl: menu.image_url as string } : {}),
            buttons: options.slice(0, 3).map((label, i) => ({
              type: "reply" as const,
              displayText: label.slice(0, 20),
              id: `opt-${i + 1}`,
            })),
          });
        } else if (menu.kind === "list") {
          externalId = await evolutionSendList(target, {
            number,
            title: menu.title,
            description: menu.message || menu.title,
            buttonText: menu.button_text || "Ver menu",
            footerText: menu.footer?.trim() || "Toque em uma opção para continuar",
            sections: [
              {
                title: menu.title,
                rows: options.map((label, i) => ({
                  title: label,
                  description: "",
                  rowId: `opt-${i + 1}`,
                })),
              },
            ],
          });
        } else {
          externalId = await evolutionSendText(target, { number, text: menuText });
        }
        delivered = true;
      } catch (error) {
        deliveryError = (error as Error).message;
      }
    } else {
      deliveryError = "Conecte um dispositivo de WhatsApp para enviar menus.";
    }

    const insert = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound",
      body: menuText,
      external_id: externalId,
    });
    if (insert.error) throw new Error(insert.error.message);

    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    return { sent: delivered, deliveryError };
  });
