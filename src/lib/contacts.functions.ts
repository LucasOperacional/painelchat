import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  digitsOnly,
  exactGroupName,
  formatBrPhone,
  isGroupIdLike,
  realPersonName,
  toBrazilPhone,
} from "@/lib/phone";

type RawContact = { name: string; phone: string; jid: string | null; avatar: string | null };

/** Nome real vindo da agenda; sem nome, usa o próprio número formatado. */
function normalizeName(value: unknown, fallback: string) {
  return realPersonName(value) ?? formatBrPhone(fallback);
}

function pickPhone(entry: Record<string, unknown>) {
  const candidates = [
    entry["phone"],
    // Evolution Go: GET /user/contacts devolve "Jid".
    entry["Jid"],
    entry["id"],
    entry["remoteJid"],
    entry["jid"],
    entry["wa_id"],
    entry["number"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    // Ignora grupos, transmissões e identificadores internos (@lid).
    if (candidate.includes("@g.us") || candidate.includes("broadcast")) return "";
    if (candidate.includes("@lid")) continue;
    const digits = digitsOnly(candidate.split("@")[0] ?? "");
    // Só número brasileiro de verdade (+55): estrangeiros e IDs internos são ignorados.
    const brazil = toBrazilPhone(digits);
    if (brazil) return brazil;
  }
  return "";
}

function pickJid(entry: Record<string, unknown>) {
  for (const key of ["Jid", "id", "remoteJid", "jid"]) {
    const value = entry[key];
    if (typeof value === "string" && value.includes("@")) return value;
  }
  return null;
}

/** Nome/assunto do grupo devolvido pela Evolution Go (/group/list). */
function pickGroupName(entry: Record<string, unknown>) {
  for (const key of ["Name", "name", "Subject", "subject", "GroupName", "title", "pushName"]) {
    const exact = exactGroupName(entry[key]);
    if (exact) return exact;
  }
  return null;
}

/** Um nome só é "de verdade" quando não é o próprio número/JID do grupo. */
function isPlaceholderName(name: string | null, phone: string, jid: string | null) {
  const value = (name ?? "").trim();
  if (isGroupIdLike(value)) return true;
  if (value === phone) return true;
  if (jid && (value === jid || value === (jid.split("@")[0] ?? ""))) return true;
  return false;
}

function pickAvatar(entry: Record<string, unknown>) {
  for (const key of [
    "imgUrl",
    "profilePicUrl",
    "profilePictureUrl",
    "profileThumbnail",
    "photoUrl",
    "picture",
    "image",
    "avatar",
    "link",
    "url",
  ]) {
    const value = entry[key];
    if (typeof value === "string" && value.startsWith("http")) return value;
  }
  return null;
}

/** Encontra a lista de contatos dentro de qualquer formato de resposta. */
function extractList(payload: unknown, depth = 0): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object" || depth > 4) return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["contacts", "data", "result", "results", "response", "items", "chats"]) {
    const found = extractList(record[key], depth + 1);
    if (found.length > 0) return found;
  }
  for (const value of Object.values(record)) {
    const found = extractList(value, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

function mapContacts(list: unknown): RawContact[] {
  const items = extractList(list);
  const out: RawContact[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const phone = pickPhone(entry);
    if (!phone) continue;
    const name = normalizeName(
      entry["FullName"] ??
        entry["PushName"] ??
        entry["FirstName"] ??
        entry["BusinessName"] ??
        entry["name"] ??
        entry["pushname"] ??
        entry["pushName"] ??
        entry["notify"] ??
        entry["short"],
      phone,
    );
    out.push({ name, phone, jid: pickJid(entry), avatar: pickAvatar(entry) });
  }
  return out;
}


/** Importa a lista de contatos do WhatsApp conectado (Evolution Go). */
export const importWhatsappContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEvolutionConfig, evolutionListContacts } = await import("@/lib/evolution.server");
    const config = await loadEvolutionConfig();
    if (!config?.base_url || !config.instance_id) {
      return { imported: 0, updated: 0, total: 0, warning: "Conecte o WhatsApp antes de importar." };
    }

    let raw: RawContact[] = [];
    try {
      // GET /user/contacts — agenda do número conectado.
      const page = await evolutionListContacts({
        baseUrl: config.base_url,
        instanceId: config.instance_id,
        configId: config.id,
      });
      raw = mapContacts(page);
      if (raw.length === 0) {
        return {
          imported: 0,
          updated: 0,
          total: 0,
          warning:
            "A Evolution Go não retornou contatos. Confirme se o número está conectado e tente novamente.",
        };
      }
    } catch (error) {

      return {
        imported: 0,
        updated: 0,
        total: 0,
        warning: error instanceof Error ? error.message : "Falha ao consultar os contatos.",
      };
    }

    if (raw.length === 0) {
      return { imported: 0, updated: 0, total: 0, warning: "Nenhum contato retornado pela API." };
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, name, avatar_url");
    if (existingError) throw new Error(existingError.message);

    const byPhone = new Map(
      (
        (existing ?? []) as { id: string; phone: string; name: string; avatar_url: string | null }[]
      ).map((c) => [digitsOnly(c.phone), c]),
    );

    // Busca a foto de perfil quando a lista da API não traz a imagem (limite para não travar).

    let imported = 0;
    let updated = 0;

    const inserts: {
      name: string;
      phone: string;
      wa_jid: string | null;
      avatar_url: string | null;
    }[] = [];
    for (const contact of raw) {
      const found = byPhone.get(contact.phone);
      if (!found) {
        if (!inserts.some((i) => i.phone === contact.phone)) {
          inserts.push({
            name: contact.name,
            phone: contact.phone,
            wa_jid: contact.jid,
            avatar_url: contact.avatar,
          });
        }
        continue;
      }
      const needsName = !found.name || found.name === found.phone;
      const needsAvatar = !found.avatar_url && !!contact.avatar;
      if (needsName || needsAvatar) {
        const { error } = await supabaseAdmin
          .from("contacts")
          .update({
            ...(needsName ? { name: contact.name, wa_jid: contact.jid } : {}),
            ...(needsAvatar ? { avatar_url: contact.avatar } : {}),
          })
          .eq("id", found.id);
        if (!error) updated += 1;
      }
    }

    if (inserts.length > 0) {
      const { error } = await supabaseAdmin.from("contacts").insert(inserts);
      if (!error) {
        imported = inserts.length;
      } else {
        // Algum telefone já existia: insere um a um e ignora os repetidos.
        for (const row of inserts) {
          const single = await supabaseAdmin.from("contacts").insert(row);
          if (!single.error) imported += 1;
        }
      }
    }


    return { imported, updated, total: raw.length, warning: "" };
  });

/** Importa a lista de grupos do WhatsApp conectado (Evolution Go). */
export const importWhatsappGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEvolutionConfig, evolutionListGroups, evolutionResolveGroupName } = await import(
      "@/lib/evolution.server"
    );
    const config = await loadEvolutionConfig();
    if (!config?.base_url || !config.instance_id) {
      return { imported: 0, updated: 0, total: 0, warning: "Conecte o WhatsApp antes de importar." };
    }
    const target = {
      baseUrl: config.base_url,
      instanceId: config.instance_id,
      configId: config.id,
    };

    let groups: Record<string, unknown>[] = [];
    try {
      groups = (await evolutionListGroups(target)) as Record<string, unknown>[];
    } catch (error) {
      return {
        imported: 0,
        updated: 0,
        total: 0,
        warning: error instanceof Error ? error.message : "Falha ao consultar os grupos.",
      };
    }

    const parsed: { jid: string; name: string; avatar: string | null }[] = [];
    let semNome = 0;
    for (const item of groups ?? []) {
      if (!item || typeof item !== "object") continue;
      const jid = pickJid(item);
      if (!jid || !jid.endsWith("@g.us")) continue;
      if (parsed.some((g) => g.jid === jid)) continue;
      const name = pickGroupName(item) ?? (await evolutionResolveGroupName(target, jid)) ?? "";
      const realName = exactGroupName(name);
      // Regra: só importa grupo com nome de verdade. Quando só temos o
      // identificador ("120363411439385203"), o grupo fica de fora.
      if (!realName) {
        semNome += 1;
        continue;
      }
      parsed.push({ jid, name: realName, avatar: pickAvatar(item) });
    }

    if (parsed.length === 0) {
      return {
        imported: 0,
        updated: 0,
        total: 0,
        warning: semNome
          ? `Nenhum grupo com nome disponível: ${semNome} grupo(s) vieram só com o identificador e não foram importados.`
          : "A Evolution Go não retornou grupos. Confirme se o número está conectado.",
      };
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("contacts")
      .select("id, name, wa_jid, avatar_url")
      .not("wa_jid", "is", null);
    if (existingError) throw new Error(existingError.message);

    const byJid = new Map(
      (
        (existing ?? []) as { id: string; name: string; wa_jid: string | null; avatar_url: string | null }[]
      ).map((c) => [c.wa_jid ?? "", c]),
    );

    let imported = 0;
    let updated = 0;

    for (const group of parsed) {
      const phone = digitsOnly(group.jid.split("@")[0] ?? "");
      const found = byJid.get(group.jid);
      if (!found) {
        const { error } = await supabaseAdmin.from("contacts").insert({
          name: group.name,
          phone,
          wa_jid: group.jid,
          avatar_url: group.avatar,
        });
        if (!error) imported += 1;
        continue;
      }
      const needsName = isPlaceholderName(found.name, phone, group.jid) && !!group.name;
      const needsAvatar = !found.avatar_url && !!group.avatar;
      if (needsName || needsAvatar) {
        const { error } = await supabaseAdmin
          .from("contacts")
          .update({
            ...(needsName ? { name: group.name } : {}),
            ...(needsAvatar ? { avatar_url: group.avatar } : {}),
          })
          .eq("id", found.id);
        if (!error) updated += 1;
      }
    }

    return {
      imported,
      updated,
      total: parsed.length,
      warning: semNome
        ? `${semNome} grupo(s) foram ignorados porque o WhatsApp não informou o nome real.`
        : "",
    };
  });

/** Busca as fotos de perfil (contatos e grupos) na Evolution Go e salva na central. */
export const syncContactPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadEvolutionConfig, evolutionGetAvatar, evolutionListGroups, evolutionResolveGroupName } = await import(
      "@/lib/evolution.server"
    );
    const config = await loadEvolutionConfig();
    if (!config?.base_url || !config.instance_id) {
      return { updated: 0, total: 0, warning: "Conecte o WhatsApp antes de buscar as fotos." };
    }
    const target = {
      baseUrl: config.base_url,
      instanceId: config.instance_id,
      configId: config.id,
    };

    const { data: rows, error } = await supabaseAdmin
      .from("contacts")
      .select("id, name, phone, wa_jid, avatar_url")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const contacts = (rows ?? []) as {
      id: string;
      name: string;
      phone: string;
      wa_jid: string | null;
      avatar_url: string | null;
    }[];
    const groupContacts = contacts.filter((c) => (c.wa_jid ?? "").endsWith("@g.us"));
    const pending = contacts.filter((c) => !c.avatar_url);
    const groupsMissingName = groupContacts.filter((c) =>
      isPlaceholderName(c.name, c.phone, c.wa_jid),
    );
    if (pending.length === 0 && groupsMissingName.length === 0) {
      return { updated: 0, total: contacts.length, warning: "" };
    }

    // Nomes e fotos dos grupos vêm da listagem oficial (/group/list).
    const groupPhotos = new Map<string, string>();
    const groupNames = new Map<string, string>();
    if (groupContacts.length > 0) {
      try {
        for (const group of await evolutionListGroups(target)) {
          const jid = pickJid(group);
          if (!jid) continue;
          const photo = pickAvatar(group);
          if (photo) groupPhotos.set(jid, photo);
          const groupName = pickGroupName(group);
          if (groupName) groupNames.set(jid, groupName);
        }
      } catch {
        // segue com o fallback individual
      }
    }

    let updated = 0;

    // Grupos ganham o nome real do WhatsApp em vez do número do JID.
    // Quando a listagem não traz o nome, consulta /group/info individualmente.
    const nameBatchSize = 6;
    for (let i = 0; i < groupsMissingName.length; i += nameBatchSize) {
      const batch = groupsMissingName.slice(i, i + nameBatchSize);
      const resolved = await Promise.all(
        batch.map(async (contact) => {
          const jid = contact.wa_jid ?? "";
          const listed = groupNames.get(jid);
          if (listed) return { id: contact.id, name: listed };
          // Sem nome na listagem: pede o assunto exato do grupo (/group/info).
          const fetched = exactGroupName(await evolutionResolveGroupName(target, jid));
          return { id: contact.id, name: fetched };
        }),
      );
      for (const item of resolved) {
        if (!item.name) continue;
        const { error: nameError } = await supabaseAdmin
          .from("contacts")
          .update({ name: item.name })
          .eq("id", item.id);
        if (!nameError) updated += 1;
      }
    }
    // Lotes pequenos: mantém a API responsiva sem estourar o tempo da requisição.
    const batchSize = 6;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (contact) => {
          const jid = contact.wa_jid ?? "";
          const isGroup = jid.endsWith("@g.us");
          if (isGroup && groupPhotos.has(jid)) {
            return { id: contact.id, url: groupPhotos.get(jid)! };
          }
          try {
            const url = await evolutionGetAvatar(target, {
              number: isGroup ? jid : digitsOnly(contact.phone) || jid,
            });
            return { id: contact.id, url };
          } catch {
            return { id: contact.id, url: null };
          }
        }),
      );
      for (const result of results) {
        if (!result.url) continue;
        const { error: updateError } = await supabaseAdmin
          .from("contacts")
          .update({ avatar_url: result.url })
          .eq("id", result.id);
        if (!updateError) updated += 1;
      }
    }

    return {
      updated,
      total: pending.length + groupsMissingName.length,
      warning:
        updated === 0
          ? "A Evolution Go não retornou fotos nem nomes de grupo. Confirme se o WhatsApp está pareado."
          : "",
    };
  });

/** Cria (ou reaproveita) uma conversa aberta com o contato para iniciar o atendimento. */
export const startConversationWithContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { contactId: string; whatsappConfigId?: string | null }) => {
    if (!data?.contactId) throw new Error("Selecione um contato.");
    return { contactId: data.contactId, whatsappConfigId: data.whatsappConfigId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: open, error: openError } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", data.contactId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openError) throw new Error(openError.message);
    if (open) {
      // Respeita a conexão escolhida pelo atendente ao reabrir o atendimento.
      if (data.whatsappConfigId) {
        await supabase
          .from("conversations")
          .update({ whatsapp_config_id: data.whatsappConfigId })
          .eq("id", open.id);
      }
      return { conversationId: open.id, created: false };
    }

    const { data: queue } = await supabase
      .from("queues")
      .select("id, department_id")
      .eq("is_active", true)
      .order("priority")
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        contact_id: data.contactId,
        assigned_to: userId,
        status: "open",
        channel: "whatsapp",
        queue_id: queue?.id ?? null,
        department_id: queue?.department_id ?? null,
        whatsapp_config_id: data.whatsappConfigId,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      // Regra: uma única conversa ativa por contato.
      const { data: raced } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", data.contactId)
        .neq("status", "closed")
        .limit(1)
        .maybeSingle();
      if (!raced) throw new Error(error.message);
      return { conversationId: raced.id, created: false };
    }

    return { conversationId: created.id, created: true };
  });

/** Inicia um atendimento a partir de um número, criando o contato quando necessário. */
export const startNewAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { phone: string; name?: string | null; whatsappConfigId?: string | null }) => {
    const phone = toBrazilPhone(data.phone);
    if (!phone) throw new Error("Informe um número de WhatsApp válido do Brasil (DDD + número).");
    const name = data.name?.trim() || null;
    return { phone, name, whatsappConfigId: data.whatsappConfigId ?? null };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Reaproveita contato existente pelo telefone normalizado.
    const { data: existing, error: findError } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    if (findError) throw new Error(findError.message);

    let contactId = existing?.id;
    if (!contactId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("contacts")
        .insert({
          name: data.name ?? formatBrPhone(data.phone),
          phone: data.phone,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      contactId = inserted.id;
    }

    // 2. Reaproveita conversa aberta do contato.
    const { data: open, error: openError } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .neq("status", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openError) throw new Error(openError.message);

    if (open) {
      if (data.whatsappConfigId) {
        await supabase
          .from("conversations")
          .update({ whatsapp_config_id: data.whatsappConfigId })
          .eq("id", open.id);
      }
      return { conversationId: open.id, created: false, contactId };
    }

    // 3. Cria nova conversa aberta atribuída ao atendente.
    const { data: queue } = await supabase
      .from("queues")
      .select("id, department_id")
      .eq("is_active", true)
      .order("priority")
      .limit(1)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        contact_id: contactId,
        assigned_to: userId,
        status: "open",
        channel: "whatsapp",
        queue_id: queue?.id ?? null,
        department_id: queue?.department_id ?? null,
        whatsapp_config_id: data.whatsappConfigId,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      // Em corrida rara, reaproveita conversa criada por outra sessão.
      const { data: raced } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .neq("status", "closed")
        .limit(1)
        .maybeSingle();
      if (!raced) throw new Error(error.message);
      return { conversationId: raced.id, created: false, contactId };
    }

    return { conversationId: created.id, created: true, contactId };
  });


