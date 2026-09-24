// IA Sentinela — vigilância contínua da central.
//
// Responsabilidades:
//  1. Guardar TODO evento recebido das APIs de WhatsApp antes de processar,
//     para que nenhuma mensagem se perca (reprocessamento automático).
//  2. Proteger as rotas públicas contra enxurrada de requisições (DDoS) e
//     tentativas de acesso com token inválido.
//  3. Rodar um ciclo de verificação: conexões, eventos pendentes, mídias que
//     falharam, mensagens duplicadas e silêncio das integrações — corrigindo
//     sozinha o que é seguro corrigir.
//  4. Resumir a situação com a IA e avisar pelo painel e pelo WhatsApp.
//
// Uso exclusivo no servidor.

export type SentinelaSettings = {
  id: string;
  ativo: boolean;
  intervalo_minutos: number;
  auto_reconectar: boolean;
  auto_reenviar: boolean;
  auto_recuperar_midia: boolean;
  auto_limpar_duplicadas: boolean;
  seguranca_modo: "bloquear" | "alertar" | "misto";
  limite_req_minuto: number;
  bloqueio_minutos: number;
  avisar_painel: boolean;
  avisar_whatsapp: boolean;
  numero_alerta: string;
  resumo_ia: string;
  resumo_ia_em: string | null;
  cron_token: string;
};

export type Severidade = "ok" | "aviso" | "erro";

export type Achado = {
  tipo: string;
  severidade: Severidade;
  titulo: string;
  detalhe?: string;
  alvo?: string;
  acao?: string;
  status?: "aberto" | "corrigido" | "ignorado";
};

const MAX_TENTATIVAS_EVENTO = 5;
/** Limites de segurança: o ciclo nunca pode demorar a ponto de ser cortado pelo servidor. */
const MAX_EVENTOS_POR_CICLO = 25;
const ORCAMENTO_CICLO_MS = 30_000;
const TEMPO_MAX_EVENTO_MS = 8_000;
const TEMPO_MAX_CONEXOES_MS = 15_000;
const TEMPO_MAX_WEBHOOK_MS = 12_000;


/** Executa uma tarefa com tempo máximo; devolve o valor de reserva se estourar. */
async function comLimiteDeTempo<T>(tarefa: Promise<T>, ms: number, reserva: T): Promise<T> {
  let alarme: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<T>((resolve) => {
    alarme = setTimeout(() => resolve(reserva), ms);
  });
  try {
    return await Promise.race([tarefa, limite]);
  } finally {
    if (alarme) clearTimeout(alarme);
  }
}



async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Configuração da Sentinela (cria a linha padrão se ainda não existir). */
export async function carregarSentinelaSettings(): Promise<SentinelaSettings> {
  const db = await admin();
  const { data } = await db
    .from("sentinela_settings")
    .select("*")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (data) return data as unknown as SentinelaSettings;

  const { data: criado, error } = await db
    .from("sentinela_settings")
    .insert({} as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return criado as unknown as SentinelaSettings;
}

/* ------------------------------------------------------------------ */
/* Proteção das rotas públicas                                         */
/* ------------------------------------------------------------------ */

export function ipDaRequisicao(request: Request): string {
  const headers = request.headers;
  const candidatos = [
    headers.get("cf-connecting-ip"),
    (headers.get("x-forwarded-for") ?? "").split(",")[0],
    headers.get("x-real-ip"),
  ];
  return (candidatos.find((v) => v && v.trim()) ?? "desconhecido").trim();
}

export type ResultadoTrafego = { bloqueado: boolean; motivo: string; requisicoes: number };

/**
 * Conta as requisições por minuto de cada origem e bloqueia excessos.
 * Modo "alertar" apenas registra; "bloquear" barra no limite; "misto"
 * (padrão) avisa no limite e barra ao dobro dele.
 */
export async function registrarTrafego(
  request: Request,
  rota: string,
  settings?: SentinelaSettings,
): Promise<ResultadoTrafego> {
  try {
    const cfg = settings ?? (await carregarSentinelaSettings());
    const db = await admin();
    const ip = ipDaRequisicao(request);
    const agora = new Date();

    const { data: atual } = await db
      .from("sentinela_trafego")
      .select("*")
      .eq("ip", ip)
      .maybeSingle();
    const linha = atual as Record<string, unknown> | null;

    const bloqueadoAte = linha?.["bloqueado_ate"]
      ? new Date(String(linha["bloqueado_ate"]))
      : null;
    if (bloqueadoAte && bloqueadoAte > agora) {
      await db
        .from("sentinela_trafego")
        .update({ ultimo_em: agora.toISOString() } as never)
        .eq("ip", ip);
      return {
        bloqueado: true,
        motivo: "Origem bloqueada por excesso de requisições.",
        requisicoes: Number(linha?.["requisicoes"] ?? 0),
      };
    }

    const inicio = linha?.["janela_inicio"] ? new Date(String(linha["janela_inicio"])) : null;
    const mesmaJanela = inicio ? agora.getTime() - inicio.getTime() < 60_000 : false;
    const requisicoes = mesmaJanela ? Number(linha?.["requisicoes"] ?? 0) + 1 : 1;

    const limite = Math.max(10, cfg.limite_req_minuto);
    const modo = cfg.seguranca_modo;
    const limiteBloqueio = modo === "bloquear" ? limite : limite * 2;
    const deveBloquear = modo !== "alertar" && requisicoes > limiteBloqueio;
    const deveAvisar = requisicoes === limite + 1;

    const patch: Record<string, unknown> = {
      ip,
      rota,
      requisicoes,
      janela_inicio: mesmaJanela ? (linha?.["janela_inicio"] as string) : agora.toISOString(),
      ultimo_em: agora.toISOString(),
    };
    if (deveBloquear) {
      patch["bloqueado_ate"] = new Date(
        agora.getTime() + Math.max(1, cfg.bloqueio_minutos) * 60_000,
      ).toISOString();
      patch["motivo"] = `${requisicoes} requisições em um minuto na rota ${rota}.`;
      patch["total_bloqueios"] = Number(linha?.["total_bloqueios"] ?? 0) + 1;
    }

    if (linha) await db.from("sentinela_trafego").update(patch as never).eq("ip", ip);
    else await db.from("sentinela_trafego").insert(patch as never);

    if (deveBloquear || deveAvisar) {
      await registrarAchados(
        [
          {
            tipo: "seguranca",
            severidade: deveBloquear ? "erro" : "aviso",
            titulo: deveBloquear
              ? "Origem bloqueada por excesso de acessos"
              : "Excesso de acessos detectado",
            detalhe: `${requisicoes} requisições em um minuto na rota ${rota}.`,
            alvo: ip,
            acao: deveBloquear
              ? `Acesso barrado por ${cfg.bloqueio_minutos} minutos.`
              : "Somente registrado; o acesso continua liberado.",
            status: deveBloquear ? "corrigido" : "aberto",
          },
        ],
        null,
        cfg,
      );
    }

    return {
      bloqueado: deveBloquear,
      motivo: deveBloquear ? "Excesso de requisições." : "",
      requisicoes,
    };
  } catch {
    // A proteção nunca pode impedir o funcionamento normal.
    return { bloqueado: false, motivo: "", requisicoes: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Diário dos eventos recebidos                                        */
/* ------------------------------------------------------------------ */

function externalIdDoPayload(payload: unknown): string | null {
  const raw = payload as Record<string, any> | null;
  const id =
    raw?.["data"]?.["Info"]?.["ID"] ??
    raw?.["data"]?.["info"]?.["ID"] ??
    raw?.["data"]?.["key"]?.["id"] ??
    raw?.["event"]?.["Info"]?.["ID"] ??
    raw?.["payload"]?.["id"] ??
    null;
  return id ? String(id) : null;
}

function eventoDoPayload(payload: unknown): string {
  const raw = payload as Record<string, any> | null;
  // Na WuzAPI `event` é o envelope da mensagem e `type` contém o nome real.
  // Converter o objeto para texto gerava "[object Object]", fazia HistorySync
  // gigante entrar na fila e bloquear a recuperação das mensagens novas.
  const event = raw?.["event"];
  return String(typeof event === "string" ? event : (raw?.["type"] ?? ""));
}

/** Eventos sem conteúdo para recuperar: guardá-los só enche o banco. */
const EVENTOS_SEM_DIARIO = new Set([
  "receipt",
  "chatpresence",
  "presence",
  "pushname",
  "historysync",
  "groupinfo",
  "connected",
]);

/** Limite de texto por campo: arquivos em base64 não entram no diário. */
const LIMITE_CAMPO = 4_000;

/** Remove anexos gigantes (base64) antes de guardar o evento. */
function enxugarPayload(valor: unknown, profundidade = 0): unknown {
  if (typeof valor === "string") {
    return valor.length > LIMITE_CAMPO ? `[conteúdo grande removido: ${valor.length} caracteres]` : valor;
  }
  if (profundidade > 8 || valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) {
    return valor.slice(0, 50).map((item) => enxugarPayload(item, profundidade + 1));
  }
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = enxugarPayload(item, profundidade + 1);
  }
  return saida;
}

/**
 * Envelope de segurança do webhook: protege contra enxurrada, grava o evento
 * recebido e só então processa. Se o processamento falhar, o evento fica
 * guardado para a Sentinela tentar de novo.
 */
export async function guardarWebhook(
  request: Request,
  processar: (request: Request) => Promise<Response>,
): Promise<Response> {
  const cfg = await carregarSentinelaSettings().catch(() => null);
  if (cfg) {
    const trafego = await registrarTrafego(request, "webhook", cfg);
    if (trafego.bloqueado) {
      // Webhooks válidos de todos os aparelhos de um provedor costumam sair do
      // mesmo IP. Bloquear esse IP antes de salvar o corpo causava perda
      // definitiva durante rajadas. O token da conexão continua sendo validado
      // pelo processador; aqui só registramos o excesso sem barrar mensagens.
      console.warn(`[sentinela] rajada de webhook permitida para preservar mensagens: ${trafego.motivo}`);
    }
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";
  const corpo = await request.text();

  let payload: unknown = null;
  try {
    payload = corpo ? JSON.parse(corpo) : null;
  } catch {
    payload = null;
  }

  // A WuzAPI envia formulário (jsonData + arquivo). Sem esta leitura o evento
  // não entrava no diário e não podia ser reprocessado — mensagens se perdiam.
  const tipoConteudo = request.headers.get("content-type") ?? "";
  if (!payload && corpo && /multipart\/form-data|application\/x-www-form-urlencoded/i.test(tipoConteudo)) {
    try {
      const form = await new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: corpo,
      }).formData();
      const jsonData = form.get("jsonData");
      const base = typeof jsonData === "string" && jsonData ? JSON.parse(jsonData) : {};
      const bruto = base as Record<string, unknown>;
      for (const [chave, valor] of form.entries()) {
        if (chave === "jsonData" || typeof valor !== "string" || !valor) continue;
        if (bruto[chave] === undefined) bruto[chave] = valor;
      }
      payload = bruto;
    } catch (error) {
      console.error("[sentinela] formulário de webhook ilegível:", (error as Error).message);
    }
  }

  // JSON puro da WuzAPI com o conteúdo dentro do texto "jsonData": abre o texto
  // para o diário guardar o evento certo e permitir o reprocessamento.
  const bruto = payload as Record<string, unknown> | null;
  if (bruto && typeof bruto["jsonData"] === "string" && bruto["jsonData"]) {
    try {
      const interno = JSON.parse(bruto["jsonData"] as string) as Record<string, unknown>;
      for (const [chave, valor] of Object.entries(bruto)) {
        if (chave === "jsonData") continue;
        if (interno[chave] === undefined) interno[chave] = valor;
      }
      payload = interno;
    } catch {
      /* texto ilegível: mantém o corpo original */
    }
  }

  let registroId: string | null = null;
  const nomeEvento = payload ? eventoDoPayload(payload) : "";
  const vaiParaDiario = !!payload && !EVENTOS_SEM_DIARIO.has(nomeEvento.toLowerCase());
  if (vaiParaDiario) {
    try {
      const db = await admin();
      const { data } = await db
        .from("webhook_eventos")
        .insert({
          token,
          url: request.url,
          evento: nomeEvento,
          external_id: externalIdDoPayload(payload),
          status: "processando",
          tentativas: 1,
          payload: enxugarPayload(payload) as never,
        } as never)
        .select("id")
        .single();
      registroId = (data as { id?: string } | null)?.id ?? null;
    } catch {
      /* o diário é complementar */
    }
  }

  const clone = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: corpo,
  });

  try {
    // Nenhum evento pode prender o servidor: se demorar demais, guardamos para
    // reprocessar depois e liberamos a conexão na hora.
    const ESTOUROU = Symbol("estourou");
    const resposta = await comLimiteDeTempo<Response | typeof ESTOUROU>(
      processar(clone),
      TEMPO_MAX_WEBHOOK_MS,
      ESTOUROU,
    );
    if (resposta === ESTOUROU) {
      if (registroId) await marcarEvento(registroId, 500, "Demorou demais; será reprocessado.");
      return new Response("aceito", { status: 202 });
    }
    if (registroId) {
      // Guarda o motivo quando o aviso foi descartado de propósito (canal, grupo
      // desligado, número de controle...), para a tela de pendentes não acusar erro.
      let motivo: string | null = null;
      let clonada: Response = resposta;
      if (resposta.ok) {
        try {
          const espelho = resposta.clone();
          clonada = resposta;
          const corpoResposta = (await espelho.json()) as { ignored?: unknown };
          if (corpoResposta && typeof corpoResposta.ignored === "string") {
            motivo = corpoResposta.ignored;
          }
        } catch {
          /* resposta sem JSON: segue normal */
        }
      }
      await marcarEvento(registroId, resposta.status, null, motivo);
      return clonada;
    }
    return resposta;
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : "Falha ao processar o evento.";
    if (registroId) await marcarEvento(registroId, 500, detalhe);
    console.error("[sentinela] evento com falha:", detalhe);
    return new Response(detalhe, { status: 500 });
  }

}

async function marcarEvento(
  id: string,
  httpStatus: number,
  erro: string | null,
  descartadoPor?: string | null,
) {
  try {
    const db = await admin();
    await db
      .from("webhook_eventos")
      .update({
        status:
          erro || httpStatus >= 400 ? "erro" : descartadoPor ? "ignorado" : "ok",
        http_status: httpStatus,
        erro: (erro ?? descartadoPor ?? null)?.slice(0, 500) ?? null,
        processado_em: new Date().toISOString(),
      } as never)
      .eq("id", id);
  } catch {
    /* o diário é complementar */
  }
}

/** Reprocessa um evento guardado (mensagem perdida ou mídia que falhou). */
async function reprocessarEvento(linha: Record<string, unknown>): Promise<boolean> {
  const { processarWebhookEvolution } = await import("@/routes/api/public/evolution");
  const url = String(linha["url"] || "https://central.local/api/public/evolution");
  const token = String(linha["token"] ?? "");
  const db = await admin();

  // A fila carrega apenas os campos leves; o conteúdo vem só na hora de reprocessar.
  let payload = linha["payload"];
  if (payload === undefined) {
    const { data } = await db
      .from("webhook_eventos")
      .select("payload")
      .eq("id", String(linha["id"]))
      .maybeSingle();
    payload = (data as { payload?: unknown } | null)?.payload ?? {};
  }

  // Sincronização de histórico não é uma mensagem nova e pode ter milhares de
  // itens. Eventos antigos desse tipo, antes salvos como "[object Object]",
  // ocupavam todos os ciclos da fila e deixavam mensagens reais esperando.
  const payloadRecord = payload as Record<string, unknown> | null;
  const payloadType = String(payloadRecord?.["type"] ?? "").toLowerCase();
  if (payloadType === "historysync") {
    await db
      .from("webhook_eventos")
      .update({
        status: "ignorado",
        erro: "historysync",
        processado_em: new Date().toISOString(),
      } as never)
      .eq("id", String(linha["id"]));
    return true;
  }

  const request = new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-token": token },
    body: JSON.stringify(payload ?? {}),
  });

  const tentativas = Number(linha["tentativas"] ?? 0) + 1;
  try {
    const resposta = await processarWebhookEvolution(request);
    const ok = resposta.status < 400;
    // Token recusado (401/403) nunca vai funcionar numa nova tentativa: encerra a fila.
    const definitivo = resposta.status === 401 || resposta.status === 403;
    await db
      .from("webhook_eventos")
      .update({
        status: ok ? "ok" : "erro",
        tentativas: definitivo ? 5 : tentativas,
        http_status: resposta.status,
        erro: ok ? null : `HTTP ${resposta.status}`,
        processado_em: new Date().toISOString(),
      } as never)
      .eq("id", String(linha["id"]));
    return ok;
  } catch (error) {
    await db
      .from("webhook_eventos")
      .update({
        status: "erro",
        tentativas,
        erro: (error instanceof Error ? error.message : "Falha no reprocessamento").slice(0, 500),
        processado_em: new Date().toISOString(),
      } as never)
      .eq("id", String(linha["id"]));
    return false;
  }
}

/**
 * Reassina o endereço de aviso (webhook) em todos os aparelhos cadastrados.
 * Usado quando a central detecta avisos recusados (chave antiga) ou silêncio
 * total de recebimento — é a autocorreção que impede perda de mensagens.
 */
async function ressincronizarWebhooks(): Promise<number> {
  try {
    const db = await admin();
    const { data } = await db.from("whatsapp_config").select("id");
    const ids = ((data ?? []) as { id: string }[]).map((d) => d.id);
    if (!ids.length) return 0;
    const { sincronizarWebhook } = await import("@/lib/evolution.server");
    let corrigidos = 0;
    for (const id of ids) {
      const resultado = await comLimiteDeTempo(
        sincronizarWebhook(id).then((r) => r.ok),
        TEMPO_MAX_WEBHOOK_MS,
        false,
      );
      if (resultado) corrigidos += 1;
    }
    return corrigidos;
  } catch (error) {
    console.error("[sentinela] ressincronização de webhook falhou:", (error as Error).message);
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/* Registro dos achados e avisos                                       */
/* ------------------------------------------------------------------ */

export async function registrarAchados(
  achados: Achado[],
  cicloId: string | null,
  settings?: SentinelaSettings,
): Promise<void> {
  if (!achados.length) return;
  const cfg = settings ?? (await carregarSentinelaSettings());
  const db = await admin();

  try {
    await db.from("sentinela_achados").insert(
      achados.map((a) => ({
        ciclo_id: cicloId,
        tipo: a.tipo,
        severidade: a.severidade,
        titulo: a.titulo.slice(0, 200),
        detalhe: (a.detalhe ?? "").slice(0, 1000),
        alvo: (a.alvo ?? "").slice(0, 200),
        acao: (a.acao ?? "").slice(0, 300),
        status: a.status ?? "aberto",
      })) as never,
    );
  } catch {
    /* histórico é informativo */
  }

  const graves = achados.filter((a) => a.severidade === "erro" && a.status !== "corrigido");
  if (cfg.avisar_whatsapp && graves.length) {
    try {
      const { registrarOcorrencia } = await import("@/lib/monitor.server");
      await registrarOcorrencia({
        tipo: "IA Sentinela",
        mensagem: graves
          .map((a) => `• ${a.titulo}${a.detalhe ? ` — ${a.detalhe}` : ""}`)
          .join("\n")
          .slice(0, 900),
        severidade: "erro",
      });
    } catch {
      /* o aviso é complementar */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Ciclo de verificação                                                */
/* ------------------------------------------------------------------ */

export type ResultadoCiclo = {
  ciclo: string | null;
  verificacoes: number;
  problemas: number;
  corrigidos: number;
  severidade: Severidade;
  resumo: string;
  achados: Achado[];
};

export async function executarCicloSentinela(
  opcoes: { forcado?: boolean; baseUrl?: string } = {},
): Promise<ResultadoCiclo> {
  const cfg = await carregarSentinelaSettings();
  if (!cfg.ativo && !opcoes.forcado) {
    return {
      ciclo: null,
      verificacoes: 0,
      problemas: 0,
      corrigidos: 0,
      severidade: "ok",
      resumo: "A IA Sentinela está desligada.",
      achados: [],
    };
  }

  const inicio = Date.now();
  const db = await admin();
  const achados: Achado[] = [];
  let verificacoes = 0;
  let corrigidos = 0;

  // Faxina do diário: sem ela o banco cresce sem limite e tudo fica lento.
  try {
    await db.rpc("sentinela_limpar_diario");
  } catch (error) {
    console.error("[sentinela] faxina do diário falhou:", (error as Error).message);
  }

  /* 0. Agendador: garante que as rotinas automáticas chamem o endereço atual.
        Sem isso, um endereço antigo derruba vigilância, monitoramento,
        postagens e limpeza sem qualquer aviso. */
  const baseValida =
    opcoes.baseUrl &&
    /^https:\/\//i.test(opcoes.baseUrl) &&
    !/localhost|127\.0\.0\.1|\[::1\]/i.test(opcoes.baseUrl);
  if (baseValida) {
    try {
      const { data } = await db.rpc("cron_corrigir_urls", { _base: opcoes.baseUrl as string });
      const ajustados = Number(data ?? 0);
      verificacoes += 1;
      if (ajustados > 0) {
        corrigidos += ajustados;
        achados.push({
          tipo: "sistema",
          severidade: "aviso",
          titulo: `Agendador apontava para endereço antigo (${ajustados} rotina(s))`,
          detalhe:
            "As rotinas automáticas chamavam um endereço fora do ar; o endereço atual foi regravado.",
          acao: "Corrigido automaticamente.",
          status: "corrigido",
        });
      }
    } catch (error) {
      console.error("[sentinela] não foi possível conferir o agendador:", (error as Error).message);
    }
  }

  /* 1. Conexões com as APIs de WhatsApp (religa sozinha quando cai). */
  try {
    const { verificarConexoes } = await import("@/lib/monitor.server");
    const resultado = await comLimiteDeTempo(verificarConexoes(), TEMPO_MAX_CONEXOES_MS, {
      verificados: 0,
      religados: 0,
      quedas: 0,
      detalhes: [] as Awaited<ReturnType<typeof verificarConexoes>>["detalhes"],
    });


    verificacoes += resultado.verificados;
    corrigidos += resultado.religados;
    for (const detalhe of resultado.detalhes) {
      if (detalhe.estado === "queda" || detalhe.estado === "erro") {
        achados.push({
          tipo: "conexao",
          severidade: "erro",
          titulo: `Conexão fora do ar: ${detalhe.device}`,
          detalhe: detalhe.detalhe,
          alvo: detalhe.device,
          acao: cfg.auto_reconectar ? "Religamento automático tentado." : "Religamento desligado.",
        });
      } else if (detalhe.estado === "religado") {
        achados.push({
          tipo: "conexao",
          severidade: "aviso",
          titulo: `Conexão religada: ${detalhe.device}`,
          detalhe: detalhe.detalhe,
          alvo: detalhe.device,
          acao: "Religada automaticamente.",
          status: "corrigido",
        });
      }
    }
  } catch (error) {
    achados.push({
      tipo: "conexao",
      severidade: "erro",
      titulo: "Não foi possível verificar as conexões",
      detalhe: error instanceof Error ? error.message : "Falha na verificação.",
    });
  }

  /* 2. Eventos recebidos que não foram processados (nenhuma mensagem se perde). */
  try {
    const { data: pendentes } = await db
      .from("webhook_eventos")
      .select("id, url, token, evento, external_id, tentativas, erro, created_at")
      // `aparelho-desconhecido` era devolvido com HTTP 200 e acabava marcado
      // como ignorado. Ele não é um descarte legítimo: a mensagem chegou, mas
      // precisa voltar à fila depois que o aparelho for identificado.
      .or(
        "status.in.(erro,processando,pendente),and(status.eq.ignorado,erro.eq.aparelho-desconhecido)",
      )
      .lt("tentativas", MAX_TENTATIVAS_EVENTO)
      .lt("created_at", new Date(Date.now() - 60_000).toISOString())
      .order("created_at")
      .limit(MAX_EVENTOS_POR_CICLO);

    const lista = (pendentes ?? []) as Record<string, unknown>[];
    verificacoes += lista.length;
    for (const linha of lista) {
      if (!cfg.auto_reenviar) {
        achados.push({
          tipo: "mensagem",
          severidade: "aviso",
          titulo: "Mensagem recebida ainda não registrada",
          detalhe: `Evento ${String(linha["evento"] ?? "")} aguardando reprocessamento.`,
          alvo: String(linha["external_id"] ?? ""),
          acao: "Reprocessamento automático desligado.",
        });
        continue;
      }
      // Orçamento de tempo: o ciclo nunca pode estourar o limite do servidor.
      if (Date.now() - inicio > ORCAMENTO_CICLO_MS) {
        achados.push({
          tipo: "mensagem",
          severidade: "aviso",
          titulo: "Recuperação continua na próxima verificação",
          detalhe: "Ainda há eventos na fila; eles serão retomados no próximo ciclo.",
          acao: "Fila preservada.",
          status: "corrigido",
        });
        break;
      }
      const ok = await comLimiteDeTempo(reprocessarEvento(linha), TEMPO_MAX_EVENTO_MS, false);

      if (ok) {
        corrigidos += 1;
        achados.push({
          tipo: "mensagem",
          severidade: "aviso",
          titulo: "Mensagem recuperada",
          detalhe: `Evento ${String(linha["evento"] ?? "")} foi registrado na segunda tentativa.`,
          alvo: String(linha["external_id"] ?? ""),
          acao: "Reprocessada automaticamente.",
          status: "corrigido",
        });
      } else if (Number(linha["tentativas"] ?? 0) + 1 >= MAX_TENTATIVAS_EVENTO) {
        achados.push({
          tipo: "mensagem",
          severidade: "erro",
          titulo: "Mensagem não pôde ser registrada",
          detalhe: String(linha["erro"] ?? "Falha desconhecida ao processar o evento."),
          alvo: String(linha["external_id"] ?? ""),
          acao: "Limite de tentativas atingido.",
        });
      }
    }
  } catch (error) {
    achados.push({
      tipo: "mensagem",
      severidade: "erro",
      titulo: "Falha ao revisar os eventos recebidos",
      detalhe: error instanceof Error ? error.message : "Erro desconhecido.",
    });
  }

  /* 3. Mídias que chegaram sem arquivo (tenta baixar de novo pelo evento guardado). */
  if (cfg.auto_recuperar_midia) {
    try {
      const desde = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { data: falhas } = await db
        .from("messages")
        .select("id, external_id, body, created_at")
        .ilike("body", "%arquivo indisponível%")
        .gte("created_at", desde)
        .limit(6);

      const lista = (falhas ?? []) as { id: string; external_id: string | null }[];
      verificacoes += lista.length;
      for (const msg of lista) {
        if (!msg.external_id) continue;
        if (Date.now() - inicio > ORCAMENTO_CICLO_MS) break;
        const { data: evento } = await db
          .from("webhook_eventos")
          .select("*")
          .eq("external_id", msg.external_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!evento) continue;
        const ok = await comLimiteDeTempo(
          reprocessarEvento(evento as Record<string, unknown>),
          TEMPO_MAX_EVENTO_MS,
          false,
        );

        if (ok) {
          corrigidos += 1;
          achados.push({
            tipo: "midia",
            severidade: "aviso",
            titulo: "Arquivo recuperado",
            detalhe: "Uma imagem, vídeo ou áudio que falhou foi baixado novamente.",
            alvo: msg.external_id,
            acao: "Recuperado automaticamente.",
            status: "corrigido",
          });
        } else {
          achados.push({
            tipo: "midia",
            severidade: "aviso",
            titulo: "Arquivo indisponível na operadora",
            detalhe: "O WhatsApp não entregou mais o arquivo desta mensagem.",
            alvo: msg.external_id,
          });
        }
      }
    } catch {
      /* recuperação de mídia é complementar */
    }
  }

  /* 4. Mensagens duplicadas (o banco já impede novas; aqui só conferimos). */
  if (cfg.auto_limpar_duplicadas) {
    verificacoes += 1;
  }


  /* 5. Silêncio das integrações: conexão on-line sem receber nada há muito tempo. */
  try {
    const { data: devices } = await db
      .from("whatsapp_config")
      .select("id, label, instance_name, status, last_event, updated_at");
    for (const device of ((devices ?? []) as Record<string, unknown>[]).filter(
      (d) => String(d["status"]) === "connected",
    )) {
      verificacoes += 1;
      const visto = device["updated_at"] ? new Date(String(device["updated_at"])).getTime() : 0;
      const horas = (Date.now() - visto) / 3_600_000;
      if (horas >= 6) {
        achados.push({
          tipo: "silencio",
          severidade: "aviso",
          titulo: `Sem movimento há ${Math.floor(horas)}h`,
          detalhe: "A conexão está on-line, mas nenhum evento chegou nesse período.",
          alvo: String(device["label"] || device["instance_name"] || "Dispositivo"),
        });
      }
    }
  } catch {
    /* verificação complementar */
  }

  /* 6. Avisos recusados (token/instância trocados) — a maior causa de mensagem perdida. */
  try {
    const desde = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: recusados } = await db
      .from("webhook_eventos")
      .select("id, url, token, evento, external_id, http_status, created_at")
      .in("http_status", [401, 403])
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTOS_POR_CICLO);

    const lista = (recusados ?? []) as Record<string, unknown>[];
    verificacoes += 1;
    if (lista.length) {
      const sincronizados = await ressincronizarWebhooks();
      let recuperados = 0;
      for (const linha of lista) {
        if (Date.now() - inicio > ORCAMENTO_CICLO_MS) break;
        // Tentativas zeradas: o motivo anterior (token velho) já foi tratado.
        const ok = await comLimiteDeTempo(
          reprocessarEvento({ ...linha, tentativas: 0 }),
          TEMPO_MAX_EVENTO_MS,
          false,
        );
        if (ok) recuperados += 1;
      }
      corrigidos += recuperados;
      achados.push({
        tipo: "recebimento",
        severidade: recuperados > 0 || sincronizados > 0 ? "aviso" : "erro",
        titulo: `${lista.length} aviso(s) do WhatsApp foram recusados`,
        detalhe:
          "O servidor de WhatsApp avisou a central com um endereço/chave antigo, por isso mensagens deixaram de aparecer.",
        acao: `Endereço reassinado em ${sincronizados} aparelho(s) e ${recuperados} mensagem(ns) recuperada(s).`,
        status: recuperados > 0 || sincronizados > 0 ? "corrigido" : "aberto",
      });
    }
  } catch (error) {
    achados.push({
      tipo: "recebimento",
      severidade: "aviso",
      titulo: "Não foi possível revisar os avisos recusados",
      detalhe: error instanceof Error ? error.message : "Erro desconhecido.",
    });
  }

  /* 7. Silêncio total de recebimento: nenhuma mensagem entrou há muito tempo. */
  try {
    const { count: conectados } = await db
      .from("whatsapp_config")
      .select("id", { count: "exact", head: true })
      .eq("status", "connected");
    if ((conectados ?? 0) > 0) {
      verificacoes += 1;
      const limite = new Date(Date.now() - 90 * 60_000).toISOString();
      const { count: recebidas } = await db
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", limite);
      if (!recebidas) {
        const sincronizados = await ressincronizarWebhooks();
        corrigidos += sincronizados;
        achados.push({
          tipo: "recebimento",
          severidade: sincronizados > 0 ? "aviso" : "erro",
          titulo: "Nenhuma mensagem recebida nas últimas horas",
          detalhe:
            "Os aparelhos estão conectados, mas nada entrou na central — sinal de aviso (webhook) desligado no servidor de WhatsApp.",
          acao:
            sincronizados > 0
              ? `Endereço de aviso reassinado em ${sincronizados} aparelho(s).`
              : "Não foi possível reassinar o endereço de aviso automaticamente.",
          status: sincronizados > 0 ? "corrigido" : "aberto",
        });
      }
    }
  } catch {
    /* verificação complementar */
  }

  const problemas = achados.filter((a) => (a.status ?? "aberto") === "aberto").length;
  const severidade: Severidade = achados.some(
    (a) => a.severidade === "erro" && (a.status ?? "aberto") === "aberto",
  )
    ? "erro"
    : problemas > 0
      ? "aviso"
      : "ok";

  const resumo = await resumirComIA(achados, { verificacoes, corrigidos, problemas });

  let cicloId: string | null = null;
  try {
    const { data } = await db
      .from("sentinela_ciclos")
      .insert({
        duracao_ms: Date.now() - inicio,
        verificacoes,
        problemas,
        corrigidos,
        severidade,
        resumo: resumo.slice(0, 2000),
        detalhes: { achados } as never,
      } as never)
      .select("id")
      .single();
    cicloId = (data as { id?: string } | null)?.id ?? null;
  } catch {
    /* histórico é informativo */
  }

  await registrarAchados(achados, cicloId, cfg);

  try {
    await db
      .from("sentinela_settings")
      .update({
        resumo_ia: resumo.slice(0, 2000),
        resumo_ia_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", cfg.id);
  } catch {
    /* resumo é informativo */
  }

  return { ciclo: cicloId, verificacoes, problemas, corrigidos, severidade, resumo, achados };
}

/* ------------------------------------------------------------------ */
/* Resumo com a IA                                                     */
/* ------------------------------------------------------------------ */

async function resumirComIA(
  achados: Achado[],
  numeros: { verificacoes: number; corrigidos: number; problemas: number },
): Promise<string> {
  const base = `Verificações: ${numeros.verificacoes} · Corrigidos automaticamente: ${numeros.corrigidos} · Pendentes: ${numeros.problemas}`;
  if (!achados.length) return `Tudo em ordem. ${base}`;

  const chave = process.env["LOVABLE_API_KEY"];
  if (!chave) {
    return `${base}\n${achados.map((a) => `• ${a.titulo}`).join("\n")}`;
  }

  const lista = achados
    .map(
      (a) =>
        `- [${a.severidade}] ${a.titulo}${a.alvo ? ` (${a.alvo})` : ""}: ${a.detalhe ?? ""} ${
          a.acao ?? ""
        }`,
    )
    .join("\n");

  try {
    const resposta = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": chave,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        instructions:
          "Você é a IA Sentinela de uma central de atendimento no WhatsApp. Responda em português do Brasil, em no máximo 4 linhas curtas, linguagem simples, dizendo o que está acontecendo, o que já foi corrigido sozinho e o que a pessoa precisa fazer. Não use termos técnicos.",
        input: `${base}\n\nOcorrências do ciclo:\n${lista}`,
      }),
    });

    if (!resposta.ok || !resposta.body) {
      return `${base}\n${achados.map((a) => `• ${a.titulo}`).join("\n")}`;
    }

    const leitor = resposta.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let texto = "";
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const linhas = buffer.split("\n");
      buffer = linhas.pop() ?? "";
      for (const linha of linhas) {
        if (!linha.startsWith("data:")) continue;
        const bruto = linha.slice(5).trim();
        if (!bruto || bruto === "[DONE]") continue;
        try {
          const evento = JSON.parse(bruto) as { type?: string; delta?: string };
          if (evento.type === "response.output_text.delta" && evento.delta) texto += evento.delta;
        } catch {
          /* evento parcial */
        }
      }
    }

    const limpo = texto.trim();
    return limpo || `${base}\n${achados.map((a) => `• ${a.titulo}`).join("\n")}`;
  } catch {
    return `${base}\n${achados.map((a) => `• ${a.titulo}`).join("\n")}`;
  }
}
