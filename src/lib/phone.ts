export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function jidToPhone(jid: string) {
  const raw = jid.split("@")[0] ?? "";
  return digitsOnly(raw.split(":")[0] ?? "");
}

export function formatBrPhone(digits: string) {
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

/** Identifica um JID de grupo do WhatsApp (1203...@g.us). */
export function isGroupJid(jid: string | null | undefined) {
  return !!jid && jid.includes("@g.us");
}

/** Telefone real (10 a 13 dígitos). IDs internos do WhatsApp têm 14+ dígitos. */
export function isRealPhone(value: string | null | undefined) {
  const digits = digitsOnly(value ?? "");
  return digits.length >= 10 && digits.length <= 13;
}

/**
 * Número brasileiro válido: DDI 55 + DDD (11 a 99) + 8 ou 9 dígitos.
 * Aceita "+55 62 91000-2123", "5562910002123" e "62910002123" (sem DDI).
 * Qualquer número de outro país é ignorado pela central.
 */
export function isBrazilPhone(value: string | null | undefined) {
  const digits = toBrazilPhone(value);
  return digits !== null;
}

/** Normaliza para o formato 55DDDNÚMERO; devolve null quando não é do Brasil. */
export function toBrazilPhone(value: string | null | undefined) {
  let digits = digitsOnly(value ?? "");
  if (!digits) return null;
  // Sem DDI: 10 ou 11 dígitos (DDD + número) viram 55…
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (digits.length !== 12 && digits.length !== 13) return null;
  if (!digits.startsWith("55")) return null;
  const ddd = Number(digits.slice(2, 4));
  if (!Number.isFinite(ddd) || ddd < 11 || ddd > 99) return null;
  const subscriber = digits.slice(4);
  if (subscriber.length === 9 && !subscriber.startsWith("9")) return null;
  return digits;
}

/** Nome real da pessoa (nunca o próprio número nem rótulos genéricos). */
export function realPersonName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return null;
  if (/^[\d\s.\-:+()]+$/.test(name)) return null;
  if (/^(sem nome|unknown|null|undefined|contato)$/i.test(name)) return null;
  return name;
}

/** Identificador interno do WhatsApp (@lid) — nunca deve virar contato. */
export function isWhatsappLid(jid: string | null | undefined, phone?: string | null) {
  if (jid && jid.includes("@lid")) return true;
  const digits = digitsOnly(phone ?? jid ?? "");
  return digits.length > 13;
}

/**
 * Rótulo de um participante de grupo: nome + número.
 * Nunca mostra o ID interno do grupo.
 */
export function groupParticipantLabel(name: string | null | undefined, digits: string) {
  const clean = digits.replace(/\D/g, "");
  const phone = clean.length >= 10 ? formatBrPhone(clean) : "";
  const person = (name ?? "").trim();
  if (person && phone) return `${person} (${phone})`;
  return person || phone || "Participante";
}

/**
 * Nome inválido de grupo: é o próprio identificador da Evolution/WhatsApp
 * ("120363294220420735", "120363294220420735@g.us", "1203...-1699999999"),
 * um número de telefone ou um rótulo genérico ("Grupo 420735").
 * Nesses casos o sistema precisa buscar o assunto real do grupo.
 */
export function isGroupIdLike(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (!text) return true;
  const withoutServer = text.split("@")[0] ?? "";
  if (/^[\d\s.\-:+()]+$/.test(withoutServer)) return true;
  if (/^grupo\s*[\d\s.\-:+()]*$/i.test(text)) return true;
  if (/^(group|sem nome|unknown|null|undefined)$/i.test(text)) return true;
  return false;
}

/** Devolve o nome exato do grupo ou null quando o valor é um identificador. */
export function exactGroupName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || isGroupIdLike(name)) return null;
  return name;
}
