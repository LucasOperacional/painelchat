// Motor de postagens automáticas em grupos e no Status/Stories do WhatsApp.
// Funciona com as duas integrações (Evolution Go e WuzAPI), porque toda chamada
// passa por evolution.server, que traduz as rotas conforme o provedor do
// dispositivo. Uso exclusivo no servidor.

export type PostagemRow = {
  id: string;
  nome: string;
  device_id: string | null;
  destino: string;
  grupos: string[];
  mensagem: string;
  midia_url: string;
  midia_tipo: string;
  delay_segundos: number;
  frequencia: string;
  intervalo_horas: number;
  dias_semana: number[];
  inicio_em: string | null;
  ativo: boolean;
  status: string;
  proximo_em: string | null;
  ultimo_em: string | null;
  ultimo_status: string;
  total_enviados: number;
  total_falhas: number;
  project_id: string | null;
};

export const STATUS_JID = "status@broadcast";

/** Próxima execução conforme a frequência escolhida. */
export function calcularProximo(
  postagem: Pick<PostagemRow, "frequencia" | "intervalo_horas" | "dias_semana" | "inicio_em">,
  base = new Date(),
): string | null {
  const referencia = new Date(base.getTime());
  const horaBase = postagem.inicio_em ? new Date(postagem.inicio_em) : referencia;

  switch (postagem.frequencia) {
    case "horas": {
      const horas = Math.max(1, postagem.intervalo_horas || 1);
      referencia.setHours(referencia.getHours() + horas);
      return referencia.toISOString();
    }
    case "diaria": {
      const proximo = new Date(referencia.getTime());
      proximo.setDate(proximo.getDate() + 1);
      proximo.setHours(horaBase.getHours(), horaBase.getMinutes(), 0, 0);
      return proximo.toISOString();
    }
    case "semanal": {
      const proximo = new Date(referencia.getTime());
      proximo.setDate(proximo.getDate() + 7);
      proximo.setHours(horaBase.getHours(), horaBase.getMinutes(), 0, 0);
      return proximo.toISOString();
    }
    case "dias_semana": {
      const dias = (postagem.dias_semana ?? []).filter((d) => d >= 0 && d <= 6);
      if (dias.length === 0) return null;
      for (let salto = 1; salto <= 7; salto += 1) {
        const proximo = new Date(referencia.getTime());
        proximo.setDate(proximo.getDate() + salto);
        proximo.setHours(horaBase.getHours(), horaBase.getMinutes(), 0, 0);
        if (dias.includes(proximo.getDay()) && proximo.getTime() > referencia.getTime()) {
          return proximo.toISOString();
        }
      }
      return null;
    }
    default:
      return null; // única vez
  }
}

export function ehRecorrente(frequencia: string) {
  return frequencia !== "unica";
}

type Destino = { jid: string; nome: string; tipo: "grupo" | "status" };

/** Dispositivo usado pela postagem: o escolhido ou o primeiro conectado. */
async function resolverDispositivo(deviceId: string | null) {
  const { loadEvolutionConfig, listEvolutionConfigs } = await import("@/lib/evolution.server");
  let device = await loadEvolutionConfig(deviceId);
  if (!deviceId) {
    const todos = await listEvolutionConfigs();
    const conectado = todos.find(
      (d) => d.status === "connected" && !!d.base_url && !!d.instance_id,
    );
    if (conectado) device = conectado;
  }
  if (!device) {
    throw new Error(
      "Nenhum WhatsApp conectado para publicar. Conecte um aparelho em Administração › Dispositivos.",
    );
  }
  if (!device.base_url || !device.instance_id) {
    throw new Error("Este aparelho ainda não tem instância criada na API de conexão.");
  }
  if (device.status !== "connected") {
    throw new Error(
      `O aparelho "${device.label || "WhatsApp"}" não está conectado. Leia o QR Code e tente novamente.`,
    );
  }
  return device;
}

/** Monta a lista de destinos (grupos e/ou Status) da postagem. */
async function montarDestinos(postagem: PostagemRow, deviceId: string): Promise<Destino[]> {
  const destinos: Destino[] = [];
  const querStatus = postagem.destino === "status" || postagem.destino === "status_grupos";
  const querGrupos =
    postagem.destino === "grupos" ||
    postagem.destino === "todos_grupos" ||
    postagem.destino === "status_grupos";

  if (querStatus) destinos.push({ jid: STATUS_JID, nome: "Status / Stories", tipo: "status" });

  if (querGrupos) {
    if (postagem.destino === "grupos" && postagem.grupos.length > 0) {
      for (const jid of postagem.grupos) {
        const limpo = jid.trim();
        if (limpo) destinos.push({ jid: limpo, nome: limpo, tipo: "grupo" });
      }
    } else {
      const { fetchBroadcastGroups } = await import("@/lib/broadcast.server");
      const grupos = await fetchBroadcastGroups({ channel: "device", deviceId });
      const selecionados =
        postagem.destino === "todos_grupos"
          ? grupos
          : grupos.filter((g) => postagem.grupos.includes(g.id));
      for (const g of selecionados) destinos.push({ jid: g.id, nome: g.name, tipo: "grupo" });
    }
  }

  // Sem duplicar o mesmo destino.
  const unicos = new Map<string, Destino>();
  for (const d of destinos) if (!unicos.has(d.jid)) unicos.set(d.jid, d);
  return Array.from(unicos.values());
}

async function enviarDestino(
  target: { baseUrl: string; instanceId: string; configId: string },
  postagem: PostagemRow,
  destino: Destino,
): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const { evolutionSendText, evolutionSendMedia } = await import("@/lib/evolution.server");
    if (postagem.midia_tipo !== "nenhum" && postagem.midia_url.trim()) {
      const imagem = postagem.midia_tipo === "imagem";
      await evolutionSendMedia(target, {
        number: destino.jid,
        url: postagem.midia_url.trim(),
        fileName: imagem ? "postagem.jpg" : "postagem.mp4",
        mimeType: imagem ? "image/jpeg" : "video/mp4",
        caption: postagem.mensagem,
      });
      return { ok: true, detalhe: imagem ? "imagem publicada" : "vídeo publicado" };
    }
    if (!postagem.mensagem.trim()) return { ok: false, detalhe: "Postagem sem texto nem mídia." };
    await evolutionSendText(target, { number: destino.jid, text: postagem.mensagem });
    return { ok: true, detalhe: "texto publicado" };
  } catch (error) {
    return { ok: false, detalhe: error instanceof Error ? error.message : "Falha desconhecida." };
  }
}

/** Publica uma postagem agora e reprograma a próxima conforme a frequência. */
export async function executarPostagem(postagemId: string): Promise<{
  ok: boolean;
  total: number;
  enviados: number;
  falhas: number;
  erro?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row, error } = await supabaseAdmin
    .from("postagens")
    .select("*")
    .eq("id", postagemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const postagem = (row as PostagemRow | null) ?? null;
  if (!postagem) return { ok: false, total: 0, enviados: 0, falhas: 0, erro: "Postagem não encontrada." };

  const marcarFalha = async (erro: string) => {
    await supabaseAdmin
      .from("postagens")
      .update({
        status: "falha",
        ultimo_status: erro.slice(0, 300),
        ultimo_em: new Date().toISOString(),
        proximo_em: ehRecorrente(postagem.frequencia) ? calcularProximo(postagem) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postagem.id);
    return { ok: false, total: 0, enviados: 0, falhas: 0, erro };
  };

  await supabaseAdmin
    .from("postagens")
    .update({ status: "em_andamento", updated_at: new Date().toISOString() })
    .eq("id", postagem.id);

  let device: Awaited<ReturnType<typeof resolverDispositivo>>;
  try {
    device = await resolverDispositivo(postagem.device_id);
  } catch (e) {
    return marcarFalha(e instanceof Error ? e.message : "Aparelho indisponível.");
  }

  let destinos: Destino[] = [];
  try {
    destinos = await montarDestinos(postagem, device.id);
  } catch (e) {
    return marcarFalha(e instanceof Error ? e.message : "Não foi possível listar os grupos.");
  }
  if (destinos.length === 0) return marcarFalha("Nenhum grupo ou Status selecionado para publicar.");

  const target = {
    baseUrl: device.base_url,
    instanceId: device.instance_id,
    configId: device.id,
  };
  const delayMs = Math.max(1, postagem.delay_segundos || 8) * 1000;

  let enviados = 0;
  let falhas = 0;
  const registros: {
    postagem_id: string;
    destino: string;
    destino_nome: string;
    tipo: string;
    ok: boolean;
    detalhe: string;
    project_id: string | null;
  }[] = [];

  for (let i = 0; i < destinos.length; i += 1) {
    const destino = destinos[i]!;
    const resultado = await enviarDestino(target, postagem, destino);
    if (resultado.ok) enviados += 1;
    else falhas += 1;
    registros.push({
      postagem_id: postagem.id,
      destino: destino.jid,
      destino_nome: destino.nome,
      tipo: destino.tipo,
      ok: resultado.ok,
      detalhe: resultado.detalhe,
      project_id: postagem.project_id,
    });
    // Intervalo entre envios para não ser bloqueado pelo WhatsApp.
    if (i < destinos.length - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (registros.length > 0) {
    await supabaseAdmin.from("postagem_envios").insert(registros);
  }

  const agora = new Date();
  const recorrente = ehRecorrente(postagem.frequencia);
  const proximo = recorrente ? calcularProximo(postagem, agora) : null;
  await supabaseAdmin
    .from("postagens")
    .update({
      ultimo_em: agora.toISOString(),
      ultimo_status:
        falhas === 0
          ? `${enviados}/${destinos.length} publicados`
          : `${enviados} publicados, ${falhas} falhas`,
      status: falhas > 0 && enviados === 0 ? "falha" : recorrente ? "recorrente" : "concluido",
      proximo_em: proximo,
      ativo: recorrente ? postagem.ativo : false,
      total_enviados: (postagem.total_enviados ?? 0) + enviados,
      total_falhas: (postagem.total_falhas ?? 0) + falhas,
      updated_at: agora.toISOString(),
    })
    .eq("id", postagem.id);

  return { ok: falhas === 0, total: destinos.length, enviados, falhas };
}

/** Executa todas as postagens vencidas (chamada pelo agendador). */
export async function executarPostagensPendentes(): Promise<{
  executadas: number;
  detalhes: { id: string; enviados: number; falhas: number }[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("postagens")
    .select("id")
    .eq("ativo", true)
    .not("proximo_em", "is", null)
    .lte("proximo_em", new Date().toISOString())
    .limit(10);
  if (error) throw new Error(error.message);

  const detalhes: { id: string; enviados: number; falhas: number }[] = [];
  for (const item of (data ?? []) as { id: string }[]) {
    try {
      const resultado = await executarPostagem(item.id);
      detalhes.push({ id: item.id, enviados: resultado.enviados, falhas: resultado.falhas });
    } catch {
      detalhes.push({ id: item.id, enviados: 0, falhas: 0 });
    }
  }
  return { executadas: detalhes.length, detalhes };
}

/** Token usado pelo agendador automático. */
export async function carregarPostagensToken(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("postagens_settings")
    .select("cron_token")
    .eq("id", true)
    .maybeSingle();
  return ((data as { cron_token?: string } | null)?.cron_token ?? "").trim();
}
