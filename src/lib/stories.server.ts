// Leitura dos canais (newsletters) do número conectado. Uso só no servidor.

export type CanalApi = {
  id: string;
  nome: string;
  descricao: string;
  inscritos: number | null;
};

function texto(bag: Record<string, unknown>, ...chaves: string[]): string {
  for (const chave of chaves) {
    const valor = bag[chave];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
  }
  return "";
}

function numero(bag: Record<string, unknown>, ...chaves: string[]): number | null {
  for (const chave of chaves) {
    const valor = bag[chave];
    if (typeof valor === "number" && Number.isFinite(valor)) return valor;
    if (typeof valor === "string" && /^\d+$/.test(valor)) return Number(valor);
  }
  return null;
}

/** Dispositivo escolhido ou o primeiro realmente conectado. */
async function resolverDispositivo(deviceId: string | null) {
  const { loadEvolutionConfig, listEvolutionConfigs } = await import("@/lib/evolution.server");
  let device = await loadEvolutionConfig(deviceId);
  if (!deviceId) {
    const todos = await listEvolutionConfigs();
    const conectado = todos.find((d) => d.status === "connected" && !!d.base_url && !!d.instance_id);
    if (conectado) device = conectado;
  }
  if (!device || !device.base_url || !device.instance_id) {
    throw new Error(
      "Nenhuma conexão de WhatsApp pronta. Conecte um aparelho em Configurações › Conexão WhatsApp.",
    );
  }
  if (device.status !== "connected") {
    throw new Error(
      `A conexão "${device.label || "WhatsApp"}" está desconectada. Leia o QR Code e tente novamente.`,
    );
  }
  return device;
}

/** Só números: é o identificador interno do canal, não um nome. */
function pareceIdentificador(valor: string): boolean {
  return !valor || /^\d{6,}$/.test(valor.replace(/\D/g, "")) === true;
}

const CHAVES_NOME = [
  "name",
  "subject",
  "title",
  "pushname",
  "verifiedname",
  "fullname",
  "businessname",
  "newslettername",
];

/** Procura um nome legível em qualquer nível da resposta da API. */
function nomeProfundo(valor: unknown, nivel = 0): string {
  if (nivel > 6 || !valor || typeof valor !== "object") return "";
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const achado = nomeProfundo(item, nivel + 1);
      if (achado) return achado;
    }
    return "";
  }
  const bag = valor as Record<string, unknown>;
  for (const [chave, item] of Object.entries(bag)) {
    if (typeof item === "string" && CHAVES_NOME.includes(chave.toLowerCase())) {
      const limpo = item.trim();
      if (limpo && !pareceIdentificador(limpo)) return limpo;
    }
  }
  for (const item of Object.values(bag)) {
    const achado = nomeProfundo(item, nivel + 1);
    if (achado) return achado;
  }
  return "";
}

/** Consulta o nome real de um canal nas rotas de metadados conhecidas. */
async function buscarNomeCanal(
  device: { base_url: string; instance_id: string; id: string },
  jid: string,
): Promise<{ nome: string; descricao: string; inscritos: number | null }> {
  const { evolutionRequest } = await import("@/lib/evolution.server");
  const tentativas: { path: string; method: "GET" | "POST"; body?: unknown }[] = [
    { path: "/newsletter/find", method: "POST", body: { jid, key: jid } },
    { path: `/newsletter/find?jid=${encodeURIComponent(jid)}`, method: "GET" },
    { path: "/newsletter/metadata", method: "POST", body: { jid, key: jid } },
    { path: "/chat/newsletterMetadata", method: "POST", body: { jid } },
    { path: "/chat/findContacts", method: "POST", body: { where: { id: jid } } },
  ];
  for (const t of tentativas) {
    try {
      const res = await evolutionRequest<unknown>({
        baseUrl: device.base_url,
        instanceId: device.instance_id,
        configId: device.id,
        path: t.path,
        method: t.method,
        ...(t.body === undefined ? {} : { body: t.body }),
        timeoutMs: 20_000,
      });
      const alvo = (res as { data?: unknown } | null)?.data ?? res;
      const nome = nomeProfundo(alvo);
      if (!nome) continue;
      const bag = (Array.isArray(alvo) ? alvo[0] : alvo) as Record<string, unknown>;
      return {
        nome,
        descricao: bag && typeof bag === "object" ? texto(bag, "Description", "description", "desc") : "",
        inscritos:
          bag && typeof bag === "object"
            ? numero(bag, "SubscriberCount", "subscribers", "subscriberCount", "followers")
            : null,
      };
    } catch {
      /* rota indisponível nesta integração: tenta a próxima */
    }
  }
  return { nome: "", descricao: "", inscritos: null };
}

/** Nomes já conhecidos pelas publicações recebidas (pushName do canal). */
async function nomesConhecidos(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("stories_recebidos")
      .select("chat_jid, autor_nome")
      .eq("tipo", "canal")
      .order("created_at", { ascending: false })
      .limit(500);
    for (const r of (data ?? []) as { chat_jid: string | null; autor_nome: string | null }[]) {
      const jid = (r.chat_jid ?? "").trim();
      const nome = (r.autor_nome ?? "").trim();
      if (jid && nome && !pareceIdentificador(nome) && !mapa.has(jid)) mapa.set(jid, nome);
    }
  } catch {
    /* sem histórico: segue só com a API */
  }
  return mapa;
}

/** Busca os canais nas rotas conhecidas das duas integrações. */
export async function listarCanais(deviceId: string | null): Promise<{
  canais: CanalApi[];
  aviso: string;
}> {
  const device = await resolverDispositivo(deviceId);
  const { evolutionRequest } = await import("@/lib/evolution.server");

  const rotas = ["/newsletter/list", "/newsletter/myall", "/chat/newsletters"];
  const encontrados = new Map<string, CanalApi>();
  let ultimoErro = "";

  for (const path of rotas) {
    try {
      const res = await evolutionRequest<{ data?: unknown }>({
        baseUrl: device.base_url,
        instanceId: device.instance_id,
        configId: device.id,
        path,
        timeoutMs: 30_000,
      });
      const lista = Array.isArray(res?.data)
        ? (res.data as unknown[])
        : Array.isArray(res)
          ? (res as unknown[])
          : [];
      for (const item of lista) {
        if (!item || typeof item !== "object") continue;
        const bag = item as Record<string, unknown>;
        const id =
          texto(bag, "JID", "jid", "id", "Id", "ID", "remoteJid") ||
          texto(bag, "name", "Name");
        if (!id) continue;
        const bruto = texto(bag, "Name", "name", "Subject", "subject") || nomeProfundo(bag);
        const nome = pareceIdentificador(bruto) ? "" : bruto;
        encontrados.set(id, {
          id,
          nome,
          descricao: texto(bag, "Description", "description", "desc"),
          inscritos: numero(bag, "SubscriberCount", "subscribers", "subscriberCount", "followers"),
        });
      }
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : "Falha ao consultar os canais.";
    }
  }

  // Quem ficou sem nome recebe o nome real: primeiro do histórico recebido,
  // depois consultando os metadados do canal na API.
  const historico = await nomesConhecidos();
  const pendentes = Array.from(encontrados.values()).filter((c) => !c.nome);
  for (const canal of pendentes) {
    const doHistorico = historico.get(canal.id);
    if (doHistorico) {
      encontrados.set(canal.id, { ...canal, nome: doHistorico });
      continue;
    }
    const meta = await buscarNomeCanal(
      { base_url: device.base_url, instance_id: device.instance_id, id: device.id },
      canal.id,
    );
    if (meta.nome) {
      encontrados.set(canal.id, {
        ...canal,
        nome: meta.nome,
        descricao: canal.descricao || meta.descricao,
        inscritos: canal.inscritos ?? meta.inscritos,
      });
    }
  }

  const canais = Array.from(encontrados.values())
    .map((c) => ({ ...c, nome: c.nome || "Canal sem nome" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const aviso =
    canais.length === 0
      ? ultimoErro ||
        "Esta conexão não informou nenhum canal. Os canais aparecem aqui quando o servidor de WhatsApp permite listá-los; as publicações recebidas continuam sendo mostradas abaixo."
      : "";
  return { canais, aviso };
}
