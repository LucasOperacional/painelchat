// Motor de divulgação em grupos: envia pelos canais DivulgaZap ou
// Evolution Go. Uso exclusivo no servidor.

const DIVULGAZAP_URL = "https://divulgazap.spanel.space/api/v1/send-message";

export type BroadcastCampaign = {
  id: string;
  name: string;
  channel: string;
  device_id: string | null;
  targets: string[];
  message: string;
  image_url: string;
  scheduled_at: string | null;
  repeat_minutes: number;
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string;
};

async function loadDivulgaZapKey(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("divulgazap_secrets")
    .select("api_key")
    .eq("provider", "divulgazap")
    .maybeSingle();
  const saved = (data as { api_key?: string } | null)?.api_key?.trim();
  const key = saved || process.env["DIVULGAZAP_API_KEY"]?.trim();
  if (!key) throw new Error("Chave da API DivulgaZap não configurada.");
  return key;
}

async function sendToTarget(
  campaign: BroadcastCampaign,
  target: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (campaign.channel === "divulgazap") {
      const apiKey = await loadDivulgaZapKey();
      const res = await fetch(DIVULGAZAP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          number: target,
          message: campaign.message,
          ...(campaign.image_url ? { image_url: campaign.image_url } : {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, detail: `DivulgaZap HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true, detail: "enviado via DivulgaZap" };
    }

    const { loadEvolutionConfig, evolutionSendText, evolutionSendMedia } = await import(
      "@/lib/evolution.server"
    );
    const device = await loadEvolutionConfig(campaign.device_id);
    if (!device) return { ok: false, detail: "Dispositivo não encontrado." };
    if (!device.base_url || !device.instance_id) {
      return { ok: false, detail: "Dispositivo sem instância na Evolution Go." };
    }

    const evoTarget = {
      baseUrl: device.base_url,
      instanceId: device.instance_id,
      configId: device.id,
    };
    if (campaign.image_url) {
      await evolutionSendMedia(evoTarget, {
        number: target,
        url: campaign.image_url,
        fileName: "imagem.jpg",
        mimeType: "image/jpeg",
        caption: campaign.message,
      });
    } else {
      await evolutionSendText(evoTarget, { number: target, text: campaign.message });
    }
    return { ok: true, detail: "enviado via Evolution Go" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Falha desconhecida." };
  }
}

/** Executa uma campanha agora (agendada ou manual). Retorna o resumo. */
export async function runBroadcastCampaign(campaignId: string): Promise<{
  ok: boolean;
  total: number;
  enviados: number;
  falhas: number;
  erro?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const campaign = (row as BroadcastCampaign | null) ?? null;
  if (!campaign) return { ok: false, total: 0, enviados: 0, falhas: 0, erro: "Campanha não encontrada." };
  if (!campaign.message.trim()) {
    return { ok: false, total: 0, enviados: 0, falhas: 0, erro: "A campanha não tem mensagem." };
  }
  if (campaign.targets.length === 0) {
    return { ok: false, total: 0, enviados: 0, falhas: 0, erro: "Nenhum grupo cadastrado na campanha." };
  }

  let enviados = 0;
  let falhas = 0;
  const runs: { campaign_id: string; target: string; ok: boolean; detail: string }[] = [];

  for (const target of campaign.targets) {
    const result = await sendToTarget(campaign, target.trim());
    if (result.ok) enviados += 1;
    else falhas += 1;
    runs.push({ campaign_id: campaign.id, target, ok: result.ok, detail: result.detail });
    // Intervalo curto entre envios para reduzir risco de bloqueio por spam.
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (runs.length > 0) {
    const { error: runError } = await supabaseAdmin.from("broadcast_runs").insert(runs);
    if (runError) throw new Error(runError.message);
  }

  const now = new Date();
  const next = new Date();
  if (campaign.repeat_minutes > 0) {
    next.setMinutes(next.getMinutes() + campaign.repeat_minutes);
  }
  const { error: updError } = await supabaseAdmin
    .from("broadcast_campaigns")
    .update({
      last_run_at: now.toISOString(),
      last_status:
        falhas === 0
          ? `${enviados}/${campaign.targets.length} enviados`
          : `${enviados} enviados, ${falhas} falhas`,
      next_run_at: campaign.repeat_minutes > 0 ? next.toISOString() : null,
      is_active: campaign.repeat_minutes > 0 ? campaign.is_active : false,
      updated_at: now.toISOString(),
    })
    .eq("id", campaign.id);
  if (updError) throw new Error(updError.message);

  return { ok: falhas === 0, total: campaign.targets.length, enviados, falhas };
}

/** Executa todas as campanhas vencidas (chamado pelo agendador). */
export async function runDueBroadcastCampaigns(): Promise<{ executadas: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .select("id")
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString())
    .limit(20);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string }[]).map((c) => c.id);
  for (const id of ids) {
    try {
      await runBroadcastCampaign(id);
    } catch {
      // erro já fica visível no histórico da campanha
    }
  }
  return { executadas: ids.length };
}

export type BroadcastGroup = { id: string; name: string; participants?: number | null };

/** Extrai a primeira lista útil de qualquer formato de resposta das APIs. */
function extractList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["groups", "chats", "data", "result", "response", "items", "records"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = extractList(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function normalizeGroups(list: unknown[]): BroadcastGroup[] {
  const groups: BroadcastGroup[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    // A Evolution Go devolve chaves em maiúsculas (JID, Name, Participants);
    // outras APIs usam minúsculas. Normalizamos tudo em minúsculas.
    const source = item as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) row[key.toLowerCase()] = value;

    const rawId = String(
      row["jid"] ??
        row["id"] ??
        row["groupid"] ??
        row["group_jid"] ??
        row["remotejid"] ??
        row["chatid"] ??
        row["phone"] ??
        "",
    ).trim();
    if (!rawId) continue;
    const idDigits = rawId.replace(/\D/g, "");
    const flagged = row["isgroup"] === true || row["is_group"] === true;
    const isGroupId = /@g\.us$/i.test(rawId) || (!/@/.test(rawId) && idDigits.length >= 15);
    if (!flagged && !isGroupId) continue;
    if (/@(c\.us|s\.whatsapp\.net|lid)$/i.test(rawId)) continue;
    const id = /@/.test(rawId) ? rawId : `${idDigits}@g.us`;
    const name =
      String(row["name"] ?? row["subject"] ?? row["title"] ?? row["pushname"] ?? "").trim() ||
      id.replace(/@g\.us$/i, "");
    const rawCount =
      row["participantscount"] ?? row["size"] ?? row["memberscount"] ?? row["membercount"] ?? null;
    const participants = Array.isArray(row["participants"])
      ? (row["participants"] as unknown[]).length
      : typeof rawCount === "number"
        ? rawCount
        : null;
    groups.push({ id, name, participants });
  }

  const byId = new Map<string, BroadcastGroup>();
  for (const g of groups) {
    const current = byId.get(g.id);
    if (!current || (!current.participants && g.participants)) byId.set(g.id, g);
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }),
  );
}

/** Busca os grupos disponíveis na API selecionada (dispositivo conectado). */
export async function fetchBroadcastGroups(input: {
  channel: string;
  deviceId: string | null;
}): Promise<BroadcastGroup[]> {
  // O DivulgaZap não expõe endpoint de listagem de grupos, então usamos o
  // dispositivo conectado (o selecionado ou o padrão) apenas para buscar a lista.
  const { loadEvolutionConfig, listEvolutionConfigs } = await import("@/lib/evolution.server");
  const chosenId = input.channel === "device" ? input.deviceId : null;
  let device = await loadEvolutionConfig(chosenId);

  // Sem dispositivo escolhido: prefere um que esteja realmente conectado —
  // dispositivos desconectados recusam a listagem de grupos.
  if (!chosenId) {
    const all = await listEvolutionConfigs();
    const connected = all.find(
      (d) => d.status === "connected" && !!d.base_url && !!d.instance_id,
    );
    if (connected) device = connected;
  }

  if (!device) {
    throw new Error(
      "Nenhum dispositivo de WhatsApp conectado para buscar os grupos. Conecte um dispositivo em Administração › Dispositivos.",
    );
  }

  if (!device.base_url || !device.instance_id) {
    throw new Error("Este dispositivo ainda não tem instância criada na Evolution Go.");
  }

  if (device.status !== "connected") {
    throw new Error(
      `O dispositivo "${device.label || "WhatsApp"}" não está conectado. Conecte-o (leia o QR Code) e tente novamente.`,
    );
  }


  // GET /group/list — grupos do número conectado.
  const { evolutionListGroups, evolutionResolveGroupName } = await import(
    "@/lib/evolution.server"
  );
  const target = {
    baseUrl: device.base_url,
    instanceId: device.instance_id,
    configId: device.id,
  };
  const payload = await evolutionListGroups(target);
  const groups = normalizeGroups(extractList(payload));

  // Grupos sem nome na listagem: consulta individual em /group/info para
  // nunca exibir o número interno do WhatsApp no lugar do nome.
  // Limite para não estourar o limite de requisições da Evolution Go.
  const missing = groups.filter((g) => /^\d+$/.test(g.name)).slice(0, 30);
  const batchSize = 4;

  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const resolved = await Promise.all(
      batch.map(async (g) => ({ id: g.id, name: await evolutionResolveGroupName(target, g.id) })),
    );
    for (const item of resolved) {
      if (!item.name) continue;
      const group = groups.find((g) => g.id === item.id);
      if (group) group.name = item.name;
    }
  }

  return groups
    .filter((g) => !/^\d+$/.test(g.name))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}
