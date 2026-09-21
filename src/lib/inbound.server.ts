// Registra mensagens recebidas do WhatsApp (qualquer provedor) na central.
// Uso exclusivo no servidor.

import {
  exactGroupName,
  formatBrPhone,
  groupParticipantLabel,
  isGroupIdLike,
  realPersonName,
  toBrazilPhone,
} from "@/lib/phone";

let ignoreGroupsCache: { value: boolean; at: number } | null = null;

/** Preferência da central: ignorar mensagens recebidas de grupos. */
export async function shouldIgnoreGroups() {
  if (ignoreGroupsCache && Date.now() - ignoreGroupsCache.at < 30_000) {
    return ignoreGroupsCache.value;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("inbound_settings")
    .select("ignore_groups")
    .eq("id", true)
    .maybeSingle();
  const value = !!data?.ignore_groups;
  ignoreGroupsCache = { value, at: Date.now() };
  return value;
}


export async function recordInboundMessage(input: {
  phoneDigits: string;
  name?: string | null;
  body: string;
  externalId?: string | null;
  avatarUrl?: string | null;
  configId?: string | null;
  /** Mensagem vinda de um grupo do WhatsApp: fica separada das conversas. */
  isGroup?: boolean;
  /** JID do chat (ex.: 1203...@g.us) quando é grupo. */
  chatJid?: string | null;
  /** Quem escreveu dentro do grupo. */
  participantName?: string | null;
  /** Número de quem escreveu dentro do grupo (nunca o ID do grupo). */
  participantPhone?: string | null;
  /** Mensagem enviada pelo próprio celular (eco): entra como enviada por nós. */
  fromMe?: boolean;
  /** O número da central foi marcado (@) na mensagem do grupo. */
  mentionsMe?: boolean;
  /** Data original da mensagem (importação do histórico do celular). */
  occurredAt?: string | null;
  /** Importação: grava a mensagem sem saudação, chatbot ou resposta da IA. */
  skipAutomations?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (input.body.trim().toLocaleLowerCase("pt-BR") === "[mensagem não suportada]") {
    return { conversationId: null, contactId: null, ignored: "unsupported-message" as const };
  }
  const now = new Date().toISOString();
  // Mensagem importada do histórico mantém a data em que foi enviada.
  const eventAt = input.occurredAt ?? now;
  const isGroup = !!input.isGroup;
  // Regra: só atende número brasileiro (+55). Estrangeiros são ignorados.
  const brazilPhone = isGroup ? input.phoneDigits : toBrazilPhone(input.phoneDigits);
  if (!brazilPhone) {
    return { conversationId: null, contactId: null, ignored: "phone-not-brazil" as const };
  }
  const phone = brazilPhone;
  const legacyPhone = formatBrPhone(input.phoneDigits);
  const chatJid = input.chatJid?.trim() || `${input.phoneDigits}@${isGroup ? "g.us" : "c.us"}`;

  const { loadEvolutionConfig } = await import("@/lib/evolution.server");
  const config = await loadEvolutionConfig(input.configId ?? null);
  const deviceId = config?.id ?? null;
  // Franquia dona do aparelho: cada endereço tem contatos e conversas próprios.
  const { projetoDoDispositivo } = await import("@/lib/tenant.server");
  const projectId = ((await projetoDoDispositivo(deviceId)) ?? "") as string;

  // Provedores reenviam o mesmo evento: ignora quando a mensagem já foi registrada.
  if (input.externalId) {
    const { data: duplicated } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id")
      .eq("external_id", input.externalId)
      .limit(1)
      .maybeSingle();
    if (duplicated) {
      return { conversationId: duplicated.conversation_id, contactId: null };
    }
  }

  let contactId: string;
  const matcher = isGroup
    ? `wa_jid.eq.${chatJid}`
    : `wa_jid.eq.${chatJid},phone.eq.${phone},phone.eq.${legacyPhone}`;
  const { data: existingContact } = await supabaseAdmin
    .from("contacts")
    .select("id, avatar_url, name")
    .eq("project_id", projectId)
    .or(matcher)
    .limit(1)
    .maybeSingle();

  // Foto e nome do grupo são buscados ao mesmo tempo para a mensagem entrar antes.
  const avatarInformado = input.avatarUrl?.trim() || null;
  const precisaFoto = !avatarInformado && !existingContact?.avatar_url;
  const currentName = (existingContact?.name ?? "").trim();
  const grupoSemNome =
    isGroup && !(currentName && !isGroupIdLike(currentName) && currentName !== phone);
  const precisaNomeGrupo = grupoSemNome && !exactGroupName(input.name);

  const [fotoBuscada, nomeGrupoBuscado] = await Promise.all([
    // Grupos usam o JID completo (…@g.us); contatos, o número.
    precisaFoto
      ? fetchProfilePicture(isGroup ? chatJid : input.phoneDigits, deviceId)
      : Promise.resolve(null),
    precisaNomeGrupo ? fetchGroupName(chatJid, deviceId) : Promise.resolve(null),
  ]);

  const avatarUrl = avatarInformado ?? fotoBuscada;

  // Pessoas: puxa o nome real do WhatsApp (pushName); nunca o número como "nome".
  // Grupos: o nome do grupo vem da Evolution Go, não do participante que escreveu.
  let displayName = isGroup ? "" : (realPersonName(input.name) ?? "");
  if (grupoSemNome) {
    displayName = exactGroupName(input.name) ?? nomeGrupoBuscado ?? "";
    // Regra: grupo sem nome de verdade (só o identificador "1203634114...")
    // não entra na central — nem como contato, nem como conversa.
    if (!displayName) {
      return { conversationId: null, contactId: null, ignored: "group-without-name" as const };
    }
  }

  if (existingContact) {
    contactId = existingContact.id;
    await supabaseAdmin
      .from("contacts")
      .update({
        wa_jid: chatJid,
        phone,
        ...(displayName ? { name: displayName } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })
      .eq("id", contactId);

  } else {
    const created = await supabaseAdmin
      .from("contacts")
      .insert({
        name: displayName || (isGroup ? phone : formatBrPhone(phone)),
        phone,
        wa_jid: chatJid,
        avatar_url: avatarUrl,
        project_id: projectId,
      })
      .select("id")
      .single();
    if (created.error) {
      // Duas mensagens ao mesmo tempo: reaproveita o contato que acabou de ser criado.
      const { data: raced } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("project_id", projectId)
        .or(`wa_jid.eq.${chatJid},phone.eq.${phone},phone.eq.${legacyPhone}`)
        .limit(1)
        .maybeSingle();
      if (!raced) throw new Error(created.error.message);
      contactId = raced.id;
    } else {
      contactId = created.data.id;
    }
  }


  const { data: openConversation } = await supabaseAdmin
    .from("conversations")
    .select("id, whatsapp_config_id, last_message_at")
    .eq("project_id", projectId)
    .eq("contact_id", contactId)
    .in("status", ["open", "waiting"])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Regra: a conversa acompanha sozinha a conexão em que a mensagem chegou.
  // Se o evento não disser o aparelho, mantém a conexão que já estava.
  let stickyDeviceId = deviceId ?? openConversation?.whatsapp_config_id ?? null;
  if (!stickyDeviceId) {
    const { data: lastConversation } = await supabaseAdmin
      .from("conversations")
      .select("whatsapp_config_id")
      .eq("contact_id", contactId)
      .not("whatsapp_config_id", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    stickyDeviceId = lastConversation?.whatsapp_config_id ?? null;
  }


  let conversationId = openConversation?.id ?? null;
  let greeting = "";
  const isNewConversation = !conversationId;

  if (!conversationId) {
    let queueId = config?.default_queue_id ?? null;
    let departmentId: string | null = null;
    if (!queueId) {
      const { data: queue } = await supabaseAdmin
        .from("queues")
        .select("id, department_id, greeting")
        .eq("project_id", projectId)
        .eq("is_active", true)
        .order("priority")
        .limit(1)
        .maybeSingle();
      queueId = queue?.id ?? null;
      departmentId = queue?.department_id ?? null;
      greeting = queue?.greeting ?? "";
    } else {
      const { data: queue } = await supabaseAdmin
        .from("queues")
        .select("department_id, greeting")
        .eq("id", queueId)
        .maybeSingle();
      departmentId = queue?.department_id ?? null;
      greeting = queue?.greeting ?? "";
    }

    const created = await supabaseAdmin
      .from("conversations")
      .insert({
        contact_id: contactId,
        queue_id: queueId,
        department_id: departmentId,
        status: "waiting",
        channel: "whatsapp",
        whatsapp_config_id: stickyDeviceId ?? deviceId,
        last_message_at: eventAt,
        project_id: projectId,
      })
      .select("id")
      .single();
    if (created.error) {
      // Regra: só existe uma conversa ativa por contato.
      const { data: raced } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .in("status", ["open", "waiting"])
        .limit(1)
        .maybeSingle();
      if (!raced) throw new Error(created.error.message);
      conversationId = raced.id;
      greeting = "";
    } else {
      conversationId = created.data.id;
    }
  }


  // Em grupos a mensagem mostra quem escreveu com o número, não o ID do grupo.
  const storedBody =
    isGroup && (input.participantName || input.participantPhone)
      ? `${groupParticipantLabel(input.participantName, input.participantPhone ?? "")}: ${input.body}`
      : input.body;

  // Eco do celular/API: se a mensagem já foi gravada (mesmo external_id),
  // não duplica na conversa.
  if (input.fromMe && input.externalId) {
    const { data: already } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("external_id", input.externalId)
      .limit(1)
      .maybeSingle();
    if (already) return { conversationId, contactId };
  }

  // Regra: a mensagem recebida nunca pode se perder por falha passageira —
  // a gravação é tentada novamente antes de desistir.
  const { withRetry } = await import("@/lib/retry.server");
  await withRetry("gravar mensagem recebida", async () => {
    const inserted = await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      direction: input.fromMe ? "outbound" : "inbound",
      body: storedBody,
      external_id: input.externalId ?? null,
      mentions_me: !!input.mentionsMe,
      created_at: eventAt,
    });
    if (inserted.error) throw new Error(inserted.error.message);
  });

  // A conversa segue sozinha a conexão em que a mensagem chegou.
  const activeDeviceId = stickyDeviceId ?? deviceId;
  const conexaoAnterior = openConversation?.whatsapp_config_id ?? null;
  const trocouConexao = !!activeDeviceId && activeDeviceId !== conexaoAnterior;

  const patchConversa: {
    whatsapp_config_id?: string;
    queue_id?: string;
    department_id?: string | null;
    assigned_to?: string | null;
    status?: "open" | "waiting" | "closed";
  } = {};
  if (activeDeviceId) patchConversa.whatsapp_config_id = activeDeviceId;

  // Mudou de conexão: fila e responsável acompanham, como numa transferência.
  if (trocouConexao && conexaoAnterior && !input.skipAutomations) {
    const { data: conexao } = await supabaseAdmin
      .from("whatsapp_config")
      .select("default_queue_id")
      .eq("id", activeDeviceId!)
      .maybeSingle();
    const filaPadrao = (conexao as { default_queue_id?: string | null } | null)?.default_queue_id;
    if (filaPadrao) {
      const { data: fila } = await supabaseAdmin
        .from("queues")
        .select("department_id")
        .eq("id", filaPadrao)
        .maybeSingle();
      patchConversa.queue_id = filaPadrao;
      patchConversa.department_id =
        (fila as { department_id?: string | null } | null)?.department_id ?? null;
    }

    const { data: atual } = await supabaseAdmin
      .from("conversations")
      .select("assigned_to")
      .eq("id", conversationId)
      .maybeSingle();
    const responsavel = (atual as { assigned_to?: string | null } | null)?.assigned_to ?? null;
    if (responsavel) {
      const { data: vinculos } = await supabaseAdmin
        .from("agent_connections")
        .select("agent_id")
        .eq("whatsapp_config_id", activeDeviceId!);
      const lista = (vinculos ?? []) as { agent_id: string }[];
      if (lista.length > 0 && !lista.some((v) => v.agent_id === responsavel)) {
        patchConversa.assigned_to = null;
        patchConversa.status = "waiting";
      }
    }
  }

  // Histórico antigo nunca joga a conversa para o topo da lista.
  const previousAt = openConversation?.last_message_at ?? null;
  const lastMessageAt = previousAt && previousAt > eventAt ? previousAt : eventAt;
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: lastMessageAt, ...patchConversa })
    .eq("id", conversationId);


  // Importação do histórico: grava e pronto, sem saudação, chatbot ou IA.
  if (input.skipAutomations) return { conversationId, contactId };

  // Mensagem enviada pelo celular: só sincroniza na conversa, sem automações.
  if (input.fromMe) return { conversationId, contactId };

  // Em grupos não roda saudação, chatbot nem resposta automática da IA.
  if (isGroup) return { conversationId, contactId };

  // A mensagem já está gravada. A partir daqui é só automação: qualquer falha
  // de chatbot, IA, loja ou menu é registrada, mas nunca desfaz a gravação.
  try {
  // Regra: conversa com atendente humano (ou encerrada) é dele. Nenhuma
  // automação — menu, loja, chatbot ou IA — mexe na fila, no responsável nem
  // no status depois disso.
  const { data: estadoAtual } = await supabaseAdmin
    .from("conversations")
    .select("assigned_to, status")
    .eq("id", conversationId)
    .maybeSingle();
  const estado = estadoAtual as { assigned_to: string | null; status: string } | null;
  if (estado?.assigned_to || estado?.status === "closed") {
    return { conversationId, contactId };
  }

  // Comprovante de Pix: se há cobrança pendente e o cliente manda a imagem do
  // comprovante, o pagamento é reconhecido e confirmado automaticamente.
  try {
    const { checkPixReceipt } = await import("@/lib/pix-receipt.server");
    const receipt = await checkPixReceipt(conversationId, input.body);
    if (receipt.checked && receipt.confirmed) return { conversationId, contactId };
  } catch (error) {
    console.error("[inbound] comprovante Pix:", (error as Error).message);
  }

  // Loja: o cliente respondeu com o número (ou clicou no botão) de um produto.
  // O Pix é gerado e enviado na hora; ao confirmar o pagamento o login sai sozinho.
  try {
    const { responderEscolhaDaLoja } = await import("@/lib/loja.server");
    const tratou = await responderEscolhaDaLoja({
      conversationId: conversationId!,
      body: input.body,
      phoneDigits: input.phoneDigits,
      configId: activeDeviceId,
    });
    if (tratou) return { conversationId, contactId };
  } catch (error) {
    console.error("[inbound] loja automática:", (error as Error).message);
  }

  // Bot da loja: primeiro contato ou palavra-gatilho -> manda o catálogo
  // numerado para a pessoa, que responde o número e recebe o Pix.
  try {
    const { responderBotDaLoja } = await import("@/lib/loja.server");
    const mandouCatalogo = await responderBotDaLoja({
      conversationId: conversationId!,
      body: input.body,
      phoneDigits: input.phoneDigits,
      configId: activeDeviceId,
      isNewConversation,
    });
    if (mandouCatalogo) return { conversationId, contactId };
  } catch (error) {
    console.error("[inbound] bot da loja:", (error as Error).message);
  }

  // Chatbot de auto atendimento: quando ativo, ele conduz a conversa (menu + IA).
  const { loadActiveChatbot, runChatbot } = await import("@/lib/chatbot.server");
  const activeBot = await loadActiveChatbot();

  // Sem chatbot ativo: entrega direto o menu de botões clicável (não a frase de saudação).
  if (!activeBot && isNewConversation) {
    const { data: menuRow } = await supabaseAdmin
      .from("button_menus")
      .select("title, message, options, footer, button_text")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const menu = menuRow as
      | { title: string; message: string; options: string[]; footer: string; button_text: string }
      | null;

    try {
      if (menu && (menu.options ?? []).length > 0) {
        const sent = await sendWhatsappMenu({
          phoneDigits: input.phoneDigits,
          title: menu.title,
          description: menu.message || "Escolha uma opção abaixo:",
          footer: menu.footer ?? "",
          buttonText: menu.button_text || "Ver menu",
          options: menu.options.map((label, i) => ({ id: String(i + 1), label })),
          configId: activeDeviceId,
        });
        await supabaseAdmin.from("messages").insert({
          conversation_id: conversationId,
          direction: "outbound",
          body: [menu.title, menu.message, menu.options.map((o, i) => `${i + 1} - ${o}`).join("\n")]
            .filter(Boolean)
            .join("\n\n"),
          external_id: sent.externalId,
        });
      } else if (greeting.trim()) {
        const greetingText = greeting.trim();
        const { data: contactConversations } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("contact_id", contactId);
        const conversationIds = (contactConversations ?? []).map((row) => row.id);
        const { data: previousGreeting } = conversationIds.length
          ? await supabaseAdmin
              .from("messages")
              .select("id")
              .in("conversation_id", conversationIds)
              .eq("body", greetingText)
              .limit(1)
              .maybeSingle()
          : { data: null };

        if (!previousGreeting) {
          const sent = await sendWhatsappText({
            phoneDigits: input.phoneDigits,
            text: greetingText,
            configId: activeDeviceId,
          });
          await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            direction: "system",
            body: greetingText,
            external_id: sent.externalId,
          });
        }
      }
    } catch (error) {
      console.error("Falha ao enviar o menu inicial:", (error as Error).message);
    }
  }

  // Cliente respondeu o menu: encaminha a conversa para o destino configurado na opção.
  let routedByMenu = false;
  if (!activeBot && !isNewConversation) {
    routedByMenu = await applyMenuRoute({
      conversationId: conversationId!,
      body: input.body,
      phoneDigits: input.phoneDigits,
      configId: activeDeviceId,
    });
  }
  if (routedByMenu) return { conversationId, contactId };

  const handledByBot = activeBot
    ? await runChatbot({
        conversationId: conversationId!,
        phoneDigits: input.phoneDigits,
        body: input.body,
        configId: activeDeviceId,
        isNewConversation,
      })
    : false;

  if (!handledByBot) {
    await maybeAutoReply({
      conversationId: conversationId!,
      phoneDigits: input.phoneDigits,
      configId: activeDeviceId,
    });
  }
  } catch (error) {
    // A mensagem permanece gravada; apenas a automação falhou.
    console.error("[inbound] automação pós-registro falhou:", (error as Error).message);
  }

  return { conversationId, contactId };
}

type MenuRoute = { action: "none" | "queue" | "department"; targetId: string | null; reply: string };

/**
 * Encaminha a conversa conforme o destino configurado na opção clicada do menu
 * (número digitado, id do botão ou o próprio texto da opção).
 */
async function applyMenuRoute(input: {
  conversationId: string;
  body: string;
  phoneDigits: string;
  configId: string | null;
}): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: menuRow } = await supabaseAdmin
    .from("button_menus")
    .select("options, option_routes")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const menu = menuRow as { options: string[]; option_routes: MenuRoute[] } | null;
  if (!menu || !(menu.options ?? []).length) return false;

  const answer = input.body.trim().toLowerCase();
  if (!answer) return false;
  let index = -1;
  const asNumber = Number(answer.replace(/\D/g, ""));
  if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= menu.options.length && /^\d+$/.test(answer)) {
    index = asNumber - 1;
  } else {
    index = menu.options.findIndex((o) => o.trim().toLowerCase() === answer);
  }
  if (index < 0) return false;

  const route = (menu.option_routes ?? [])[index];
  if (!route || route.action === "none" || !route.targetId) {
    if (!route?.reply) return false;
  }

  if (route?.action === "queue" && route.targetId) {
    await supabaseAdmin
      .from("conversations")
      .update({ queue_id: route.targetId, status: "waiting" })
      .eq("id", input.conversationId)
      // O menu não devolve para a fila uma conversa já assumida.
      .is("assigned_to", null)
      .neq("status", "closed");
  } else if (route?.action === "department" && route.targetId) {
    await supabaseAdmin
      .from("conversations")
      .update({ department_id: route.targetId, status: "waiting" })
      .eq("id", input.conversationId)
      .is("assigned_to", null)
      .neq("status", "closed");
  }

  const reply = route?.reply?.trim();
  if (reply) {
    try {
      const sent = await sendWhatsappText({
        phoneDigits: input.phoneDigits,
        text: reply,
        configId: input.configId,
      });
      await supabaseAdmin.from("messages").insert({
        conversation_id: input.conversationId,
        direction: "outbound",
        body: reply,
        external_id: sent.externalId,
      });
      await supabaseAdmin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", input.conversationId);
    } catch (error) {
      console.error("Falha ao responder a opção do menu:", (error as Error).message);
    }
  }

  return true;
}

/** POST /send/text — envia texto pelo dispositivo Evolution Go da conversa. */
export async function sendWhatsappText(input: {
  phoneDigits: string;
  text: string;
  configId?: string | null;
}): Promise<{ externalId: string | null }> {
  const { loadEvolutionConfig, evolutionSendText } = await import("@/lib/evolution.server");
  const config = await loadEvolutionConfig(input.configId ?? null);
  if (!config) throw new Error("WhatsApp não configurado.");
  if (!config.base_url || !config.instance_id) throw new Error("Evolution Go não configurado.");

  const externalId = await evolutionSendText(
    { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
    { number: input.phoneDigits, text: input.text },
  );
  return { externalId };
}

/**
 * Envia um menu clicável (botões até 3 opções, lista acima disso).
 * Usado pelo chatbot para entregar o menu pronto para clicar.
 */
export async function sendWhatsappMenu(input: {
  phoneDigits: string;
  title: string;
  description: string;
  footer?: string;
  buttonText?: string;
  options: { id: string; label: string }[];
  configId?: string | null;
}): Promise<{ externalId: string | null }> {
  const { loadEvolutionConfig, evolutionSendButton, evolutionSendList } = await import(
    "@/lib/evolution.server"
  );
  const config = await loadEvolutionConfig(input.configId ?? null);
  if (!config) throw new Error("WhatsApp não configurado.");
  if (!config.base_url || !config.instance_id) throw new Error("Evolution Go não configurado.");

  const target = { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id };
  // A Evolution Go aceita JID completo para texto, mas /send/button exige
  // somente os dígitos em conversas individuais. Preserve o JID apenas em grupos.
  const number = input.phoneDigits.includes("@g.us")
    ? input.phoneDigits
    : input.phoneDigits.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (!number) throw new Error("Número do contato inválido para enviar o menu.");

  const footer = input.footer?.trim() || "Toque em uma opção para continuar";

  // Sempre tenta o menu de botões (ou lista, quando há mais de 3 opções).
  try {
    if (input.options.length <= 3) {
      const externalId = await evolutionSendButton(target, {
        number,
        title: input.title,
        description: input.description,
        footer,
        buttons: input.options.map((o) => ({
          type: "reply" as const,
          displayText: o.label.slice(0, 20),
          id: o.id,
        })),
      });
      return { externalId };
    }

    const externalId = await evolutionSendList(target, {
      number,
      title: input.title,
      description: input.description,
      buttonText: input.buttonText || "Ver menu",
      footerText: footer,
      sections: [
        {
          title: "Opções",
          rows: input.options.map((o) => ({ title: o.label, rowId: o.id })),
        },
      ],
    });
    return { externalId };
  } catch (interactiveError) {
    console.error("Falha no menu de botões:", (interactiveError as Error).message);


    const menuText = [
      input.title,
      input.description,
      input.options.map((o) => `*${o.id}* - ${o.label}`).join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n");
    const sent = await sendWhatsappText({
      phoneDigits: input.phoneDigits,
      text: menuText,
      configId: input.configId ?? null,
    });
    return { externalId: sent.externalId };
  }
}


/** Responde automaticamente quando a IA está ativa e a conversa não tem atendente. */
async function maybeAutoReply(input: {
  conversationId: string;
  phoneDigits: string;
  configId?: string | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadAiConfig, aiGenerate } = await import("@/lib/ai.server");

    const config = await loadAiConfig();
    if (!config?.is_enabled || !config.auto_reply) return;

    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("id, assigned_to, status")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!conversation || conversation.assigned_to) return;

    const { data: history } = await supabaseAdmin
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(12);

    const transcript = ((history ?? []) as { direction: string; body: string }[])
      .filter((m) => m.direction === "inbound" || m.direction === "outbound")
      .reverse()
      .map((m) => `${m.direction === "inbound" ? "Cliente" : "Atendente"}: ${m.body}`)
      .join("\n");
    if (!transcript) return;

    const text = await aiGenerate({
      config,
      prompt:
        "Histórico do atendimento:\n\n" +
        transcript +
        "\n\nEscreva apenas a próxima mensagem do atendente, sem títulos nem explicações.",
    });

    const sent = await sendWhatsappText({
      phoneDigits: input.phoneDigits,
      text,
      configId: input.configId ?? null,
    });
    const externalId = sent.externalId;


    await supabaseAdmin.from("messages").insert({
      conversation_id: input.conversationId,
      direction: "outbound",
      body: text,
      external_id: externalId,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", input.conversationId);
  } catch (error) {
    console.error("Falha na resposta automática da IA:", (error as Error).message);
  }
}

/** POST /user/avatar — foto de perfil do cliente no WhatsApp. */
async function fetchProfilePicture(
  phoneDigits: string,
  configId?: string | null,
): Promise<string | null> {
  try {
    const { loadEvolutionConfig, evolutionGetAvatar } = await import("@/lib/evolution.server");
    const config = await loadEvolutionConfig(configId ?? null);
    if (!config?.base_url || !config.instance_id) return null;

    return await evolutionGetAvatar(
      { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
      { number: phoneDigits },
    );
  } catch {
    return null;
  }
}

/** GET /group/list — nome (assunto) do grupo no WhatsApp. */
async function fetchGroupName(
  chatJid: string,
  configId?: string | null,
): Promise<string | null> {
  try {
    const { loadEvolutionConfig, evolutionListGroups } = await import("@/lib/evolution.server");
    const config = await loadEvolutionConfig(configId ?? null);
    if (!config?.base_url || !config.instance_id) return null;

    const groups = await evolutionListGroups({
      baseUrl: config.base_url,
      instanceId: config.instance_id,
      configId: config.id,
    });
    const wanted = chatJid.split("@")[0];
    for (const group of groups) {
      const jid = ["Jid", "id", "remoteJid", "jid"]
        .map((key) => group[key])
        .find((value): value is string => typeof value === "string" && value.includes("@"));
      if (!jid || jid.split("@")[0] !== wanted) continue;
      for (const key of ["Name", "name", "Subject", "subject", "GroupName", "title"]) {
        const exact = exactGroupName(group[key]);
        if (exact) return exact;
      }
    }
    // A listagem não trouxe o assunto: consulta o grupo individualmente.
    const { evolutionResolveGroupName } = await import("@/lib/evolution.server");
    return exactGroupName(await evolutionResolveGroupName(
      { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
      chatJid,
    ));
  } catch {
    return null;
  }
}
