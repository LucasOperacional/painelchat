// Leitura dos canais (newsletters) do número conectado. Uso só no servidor.

export type CanalApi = {
  id: string;
  nome: string;
  descricao: string;
  inscritos: number | null;
  /** Papel do número conectado no canal: owner, admin ou subscriber. */
  papel: string;
  /** Verdadeiro quando o número conectado pode publicar no canal. */
  podeEnviar: boolean;
};

/** Papel do número conectado, vindo de viewer_metadata.role. */
function papelDoCanal(bag: Record<string, unknown>): string {
  const viewer = bag["viewer_metadata"] ?? bag["viewerMetadata"] ?? bag["ViewerMetadata"];
  if (viewer && typeof viewer === "object" && !Array.isArray(viewer)) {
    const papel = texto(viewer as Record<string, unknown>, "role", "Role", "papel");
    if (papel) return papel.toLowerCase();
  }
  const direto = texto(bag, "role", "Role");
  return direto ? direto.toLowerCase() : "";
}

function podePublicar(papel: string): boolean {
  return papel === "owner" || papel === "admin";
}

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

/**
 * Nome apresentável: precisa de ao menos 2 caracteres e não pode ser um
 * identificador. Respostas de uma letra só ("A", "B"…) são ignoradas e o
 * nome real é buscado no histórico e nos metadados do canal.
 */
function nomeValido(valor: string): boolean {
  const limpo = valor.trim();
  return limpo.length >= 2 && !pareceIdentificador(limpo);
}

/**
 * Formato real da Evolution Go: o canal vem em
 * { id, thread_metadata: { name: { text }, description: { text }, subscribers_count } }.
 */
function metaThread(bag: Record<string, unknown>): Record<string, unknown> | null {
  const meta = bag["thread_metadata"] ?? bag["threadMetadata"] ?? bag["ThreadMetadata"];
  return meta && typeof meta === "object" && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : null;
}

function campoTexto(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const bag = valor as Record<string, unknown>;
    for (const chave of ["text", "Text", "value", "Value"]) {
      const item = bag[chave];
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return "";
}

/** Nome real do canal: direto, aninhado em thread_metadata ou varredura profunda. */
function nomeDoCanal(bag: Record<string, unknown>): string {
  const meta = metaThread(bag);
  const candidatos = [
    campoTexto(meta?.["name"]),
    campoTexto(bag["name"]),
    campoTexto(bag["Name"]),
    campoTexto(bag["subject"]),
    campoTexto(bag["Subject"]),
  ];
  for (const c of candidatos) if (nomeValido(c)) return c;
  const profundo = nomeProfundo(bag);
  return nomeValido(profundo) ? profundo : "";
}

function descricaoDoCanal(bag: Record<string, unknown>): string {
  const meta = metaThread(bag);
  return (
    campoTexto(meta?.["description"]) ||
    campoTexto(bag["description"]) ||
    campoTexto(bag["Description"]) ||
    campoTexto(bag["desc"])
  );
}

function inscritosDoCanal(bag: Record<string, unknown>): number | null {
  const meta = metaThread(bag);
  return (
    numero(meta ?? {}, "subscribers_count", "subscriberCount", "subscribers") ??
    numero(bag, "SubscriberCount", "subscribers", "subscriberCount", "subscribers_count", "followers")
  );
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
      if (nomeValido(limpo)) return limpo;
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
      const bag = (Array.isArray(alvo) ? alvo[0] : alvo) as Record<string, unknown>;
      if (!bag || typeof bag !== "object") continue;
      const nome = nomeDoCanal(bag);
      if (!nome) continue;
      return {
        nome,
        descricao: descricaoDoCanal(bag),
        inscritos: inscritosDoCanal(bag),
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
      if (jid && nomeValido(nome) && !mapa.has(jid)) mapa.set(jid, nome);
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
        if (!id || !/^\d+@/.test(id)) continue;
        const papel = papelDoCanal(bag);
        encontrados.set(id, {
          id,
          nome: nomeDoCanal(bag),
          descricao: descricaoDoCanal(bag),
          inscritos: inscritosDoCanal(bag),
          papel,
          podeEnviar: podePublicar(papel),
        });
      }
    } catch (error) {
      ultimoErro = error instanceof Error ? error.message : "Falha ao consultar os canais.";
    }
  }

  // Quem ficou sem nome recebe o nome real: primeiro do histórico recebido,
  // depois consultando os metadados do canal na API.
  const historico = await nomesConhecidos();
  const pendentes = Array.from(encontrados.values()).filter((c) => !nomeValido(c.nome));
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
    .map((c) => ({ ...c, nome: nomeValido(c.nome) ? c.nome : "Canal sem nome" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const aviso =
    canais.length === 0
      ? ultimoErro ||
        "Esta conexão não informou nenhum canal. Os canais aparecem aqui quando o servidor de WhatsApp permite listá-los; as publicações recebidas continuam sendo mostradas abaixo."
      : "";
  const comOrdem = canais.sort(
    (a, b) => Number(b.podeEnviar) - Number(a.podeEnviar) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  return { canais: comOrdem, aviso };
}

/** Cache curto dos nomes resolvidos, para não consultar a API a cada leitura. */
const cacheNomesCanais = new Map<string, { nome: string; em: number }>();

/**
 * Resolve o nome real de cada canal (jid). Usado para que as publicações
 * recebidas mostrem o nome do canal, mesmo quando o webhook não o enviou.
 */
export async function nomesDosCanais(
  deviceId: string | null,
  jids: string[],
): Promise<Map<string, string>> {
  const resposta = new Map<string, string>();
  const unicos = Array.from(new Set(jids.map((j) => j.trim()).filter(Boolean))).slice(0, 12);
  const pendentes: string[] = [];
  const agora = Date.now();
  for (const jid of unicos) {
    const emCache = cacheNomesCanais.get(jid);
    if (emCache && agora - emCache.em < 10 * 60 * 1000) {
      if (nomeValido(emCache.nome)) resposta.set(jid, emCache.nome);
    } else {
      pendentes.push(jid);
    }
  }
  if (pendentes.length === 0) return resposta;

  let device;
  try {
    device = await resolverDispositivo(deviceId);
  } catch {
    return resposta;
  }
  const historico = await nomesConhecidos();
  for (const jid of pendentes) {
    const doHistorico = historico.get(jid) ?? "";
    const nome = nomeValido(doHistorico)
      ? doHistorico
      : (
          await buscarNomeCanal(
            { base_url: device.base_url, instance_id: device.instance_id, id: device.id },
            jid,
          )
        ).nome;
    cacheNomesCanais.set(jid, { nome, em: Date.now() });
    if (nomeValido(nome)) resposta.set(jid, nome);
  }
  return resposta;
}

/**
 * Publica no canal. Só funciona quando o número conectado é dono (owner) ou
 * administrador (admin) do canal — a lista da API é a fonte da verdade.
 */
export async function publicarNoCanal(input: {
  deviceId: string | null;
  jid: string;
  texto: string;
  midiaUrl?: string;
  midiaTipo?: "imagem" | "video";
}): Promise<{ ok: boolean; detalhe: string }> {
  const device = await resolverDispositivo(input.deviceId);
  const { canais } = await listarCanais(input.deviceId);
  const canal = canais.find((c) => c.id === input.jid);
  if (!canal) throw new Error("Canal não encontrado nesta conexão. Toque em Atualizar e tente de novo.");
  if (!canal.podeEnviar) {
    throw new Error(
      `Você não é administrador do canal "${canal.nome}", por isso não é possível publicar nele.`,
    );
  }

  const target = { baseUrl: device.base_url, instanceId: device.instance_id, configId: device.id };
  const { evolutionSendText, evolutionSendMedia } = await import("@/lib/evolution.server");
  const mensagem = input.texto.trim();
  const midia = (input.midiaUrl ?? "").trim();

  if (midia) {
    const imagem = input.midiaTipo !== "video";
    await evolutionSendMedia(target, {
      number: canal.id,
      url: midia,
      fileName: imagem ? "publicacao.jpg" : "publicacao.mp4",
      mimeType: imagem ? "image/jpeg" : "video/mp4",
      caption: mensagem,
    });
    return { ok: true, detalhe: `Publicado em ${canal.nome}.` };
  }

  if (!mensagem) throw new Error("Escreva a mensagem que será publicada no canal.");
  await evolutionSendText(target, { number: canal.id, text: mensagem });
  return { ok: true, detalhe: `Publicado em ${canal.nome}.` };
}
