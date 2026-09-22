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
        const nome =
          texto(bag, "Name", "name", "Subject", "subject", "ThreadMetadata") || id.split("@")[0]!;
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

  const canais = Array.from(encontrados.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  const aviso =
    canais.length === 0
      ? ultimoErro ||
        "Esta conexão não informou nenhum canal. Os canais aparecem aqui quando o servidor de WhatsApp permite listá-los; as publicações recebidas continuam sendo mostradas abaixo."
      : "";
  return { canais, aviso };
}
