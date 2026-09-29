// Garantia de que nenhuma mensagem se perde — entrada e saída.
//
// O problema que este arquivo resolve:
//
//  ENTRADA. O envelope do webhook já guardava o evento antes de processar, mas
//  a gravação era "complementar": qualquer falha do banco era engolida e o
//  evento seguia sem registro nenhum. Se o processamento também falhasse, a
//  mensagem desaparecia sem deixar rastro. Além disso o corpo era enxuto antes
//  de salvar, trocando áudio/imagem em base64 por um aviso de texto — o
//  reprocessamento devolvia uma mensagem sem o arquivo.
//
//  SAÍDA. Não havia registro nenhum antes de chamar a API. Uma queda entre o
//  clique do atendente e a resposta do WhatsApp perdia o pedido inteiro.
//
// A solução tem três camadas, da mais rápida para a mais durável:
//
//  1. Banco (Supabase) — o registro oficial.
//  2. Armazenamento (bucket `anexos`) — para corpos grandes que não cabem bem
//     numa coluna, preservando a mídia original para reprocessar.
//  3. Memória do processo — reserva de último recurso quando o banco está fora.
//     Some se o servidor reiniciar, mas cobre justamente a falha passageira que
//     antes causava perda silenciosa, e é drenada no próximo ciclo.
//
// Uso exclusivo no servidor.

import { withRetry } from "@/lib/retry.server";

/** Acima disso o corpo vai para o armazenamento em vez da coluna de texto. */
const LIMITE_COLUNA = 200_000;

/** Teto da reserva em memória: protege o servidor de estourar a RAM numa rajada. */
const MAX_RESERVA_MEMORIA = 500;

type ReservaEntrada = {
  token: string;
  url: string;
  evento: string;
  externalId: string | null;
  corpo: string;
  contentType: string;
  recebidoEm: string;
};

/**
 * Eventos guardados em memória porque o banco não aceitou a gravação.
 * São drenados pelo ciclo da Sentinela (`drenarReserva`).
 */
const reservaEntrada: ReservaEntrada[] = [];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* Entrada: diário fiel do que chegou                                  */
/* ------------------------------------------------------------------ */

/**
 * Guarda o corpo grande no armazenamento e devolve o caminho. Mídia em base64
 * precisa sobreviver inteira, senão o reprocessamento entrega uma mensagem sem
 * o arquivo. Devolve `null` quando não foi possível guardar.
 */
async function guardarCorpoGrande(corpo: string, evento: string): Promise<string | null> {
  try {
    const db = await admin();
    const dia = new Date().toISOString().slice(0, 10);
    const path = `webhooks/${dia}/${evento || "evento"}-${crypto.randomUUID()}.json`;
    const upload = await db.storage
      .from("anexos")
      .upload(path, new Blob([corpo], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false,
      });
    if (upload.error) {
      console.error("[durabilidade] corpo grande não foi guardado:", upload.error.message);
      return null;
    }
    return path;
  } catch (error) {
    console.error("[durabilidade] falha ao guardar corpo grande:", (error as Error).message);
    return null;
  }
}

/** Lê de volta um corpo que foi para o armazenamento. */
export async function lerCorpoGuardado(path: string): Promise<string | null> {
  try {
    const db = await admin();
    const { data, error } = await db.storage.from("anexos").download(path);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

export type RegistroEntrada = {
  /** Identificador no diário; `null` quando só foi possível guardar em memória. */
  id: string | null;
  /** `true` quando o evento existe em algum lugar durável (banco ou memória). */
  guardado: boolean;
};

/**
 * Registra o evento recebido ANTES de processar. Nunca lança: se o banco
 * recusar, o evento cai na reserva em memória e ainda pode ser recuperado.
 * Diferente da versão anterior, uma falha aqui deixa rastro em log e na
 * reserva, em vez de passar em silêncio.
 */
export async function registrarEntrada(input: {
  token: string;
  url: string;
  evento: string;
  externalId: string | null;
  corpo: string;
  contentType: string;
}): Promise<RegistroEntrada> {
  const grande = input.corpo.length > LIMITE_COLUNA;
  // O corpo grande vai para o armazenamento; se isso falhar, ele ainda segue
  // na coluna de texto. Guardar demais é melhor que perder a mídia.
  const corpoPath = grande ? await guardarCorpoGrande(input.corpo, input.evento) : null;

  try {
    const db = await admin();
    const id = await withRetry(
      "guardar evento recebido",
      async () => {
        const { data, error } = await db
          .from("webhook_eventos")
          .insert({
            token: input.token,
            url: input.url,
            evento: input.evento,
            external_id: input.externalId,
            status: "processando",
            tentativas: 1,
            // `payload` continua sendo o resumo legível para a tela de
            // pendentes; o corpo fiel fica em `corpo_bruto`/`corpo_path`.
            payload: resumoLegivel(input.corpo) as never,
            corpo_bruto: corpoPath ? null : input.corpo,
            corpo_path: corpoPath,
            content_type: input.contentType,
          } as never)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return (data as { id?: string } | null)?.id ?? null;
      },
      { attempts: 3, delayMs: 300 },
    );
    if (id) return { id, guardado: true };
  } catch (error) {
    console.error(
      `[durabilidade] evento ${input.evento || "?"} não entrou no diário:`,
      (error as Error).message,
    );
  }

  // Banco indisponível: segura em memória para o próximo ciclo tentar de novo.
  guardarNaReserva({
    token: input.token,
    url: input.url,
    evento: input.evento,
    externalId: input.externalId,
    corpo: input.corpo,
    contentType: input.contentType,
    recebidoEm: new Date().toISOString(),
  });
  return { id: null, guardado: reservaEntrada.length > 0 };
}

function guardarNaReserva(item: ReservaEntrada) {
  reservaEntrada.push(item);
  // Numa rajada longa com o banco fora, o mais antigo sai primeiro — ele já
  // teve mais chances de ser reprocessado pelo provedor.
  while (reservaEntrada.length > MAX_RESERVA_MEMORIA) reservaEntrada.shift();
  console.warn(
    `[durabilidade] evento guardado só em memória (${reservaEntrada.length}/${MAX_RESERVA_MEMORIA}). Será gravado quando o banco voltar.`,
  );
}

/** Quantos eventos aguardam na reserva de memória. */
export function tamanhoDaReserva() {
  return reservaEntrada.length;
}

/**
 * Tenta gravar no banco os eventos que ficaram em memória. Chamada pelo ciclo
 * da Sentinela. Devolve quantos foram salvos.
 */
export async function drenarReserva(): Promise<number> {
  if (!reservaEntrada.length) return 0;
  let salvos = 0;
  // Copia e limpa antes de gravar: se a gravação falhar de novo, o item volta
  // para a reserva em `registrarEntrada`, sem duplicar o que já foi salvo.
  const pendentes = reservaEntrada.splice(0, reservaEntrada.length);
  for (const item of pendentes) {
    const resultado = await registrarEntrada(item);
    if (resultado.id) salvos += 1;
  }
  return salvos;
}

/**
 * Versão curta do corpo, só para a tela de pendentes mostrar algo legível.
 * O conteúdo completo nunca depende disto.
 */
function resumoLegivel(corpo: string): unknown {
  try {
    const dados = JSON.parse(corpo) as unknown;
    return enxugarParaTela(dados);
  } catch {
    return { corpo: corpo.slice(0, 2_000) };
  }
}

const LIMITE_TELA = 4_000;

function enxugarParaTela(valor: unknown, profundidade = 0): unknown {
  if (typeof valor === "string") {
    return valor.length > LIMITE_TELA
      ? `[conteúdo grande — o original está guardado para reprocessar: ${valor.length} caracteres]`
      : valor;
  }
  if (profundidade > 8 || valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) {
    return valor.slice(0, 50).map((item) => enxugarParaTela(item, profundidade + 1));
  }
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = enxugarParaTela(item, profundidade + 1);
  }
  return saida;
}

/** Atualiza o desfecho do evento no diário. Nunca lança. */
export async function concluirEntrada(
  id: string,
  httpStatus: number,
  erro: string | null,
  descartadoPor?: string | null,
) {
  try {
    const db = await admin();
    await withRetry(
      "concluir evento recebido",
      async () => {
        const { error } = await db
          .from("webhook_eventos")
          .update({
            status: erro || httpStatus >= 400 ? "erro" : descartadoPor ? "ignorado" : "ok",
            http_status: httpStatus,
            erro: (erro ?? descartadoPor ?? null)?.slice(0, 500) ?? null,
            processado_em: new Date().toISOString(),
          } as never)
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      { attempts: 2, delayMs: 300 },
    );
  } catch (error) {
    // Ficar como "processando" é seguro: o ciclo vai reprocessar. O risco é
    // repetir, não perder — e o processador já é idempotente por external_id.
    console.error(
      `[durabilidade] desfecho do evento ${id} não foi gravado:`,
      (error as Error).message,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Saída: fila das mensagens que a central envia                       */
/* ------------------------------------------------------------------ */

export type PedidoEnvio = {
  conversationId: string;
  configId: string | null;
  senderId: string | null;
  destino: string;
  tipo: string;
  /** Tudo que é preciso para reenviar sem a tela: texto, anexos, citação. */
  payload: Record<string, unknown>;
};

/**
 * Grava a intenção de envio ANTES de chamar a API. É isto que impede a perda:
 * se o servidor cair no meio do envio, o pedido continua registrado e aparece
 * no painel como pendente, em vez de desaparecer.
 * Devolve o id da fila, ou `null` se nem o registro foi possível (o envio
 * segue normalmente — não travamos o atendimento por causa do diário).
 */
export async function registrarSaida(pedido: PedidoEnvio): Promise<string | null> {
  try {
    const db = await admin();
    return await withRetry(
      "registrar mensagem a enviar",
      async () => {
        const { data, error } = await db
          .from("mensagens_saida")
          .insert({
            conversation_id: pedido.conversationId,
            config_id: pedido.configId,
            sender_id: pedido.senderId,
            destino: pedido.destino,
            tipo: pedido.tipo,
            payload: pedido.payload as never,
            status: "enviando",
            tentativas: 1,
          } as never)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        return (data as { id?: string } | null)?.id ?? null;
      },
      { attempts: 3, delayMs: 300 },
    );
  } catch (error) {
    console.error(
      `[durabilidade] pedido de envio da conversa ${pedido.conversationId} não foi registrado:`,
      (error as Error).message,
    );
    return null;
  }
}

export type DesfechoEnvio =
  /** A API confirmou. */
  | { estado: "enviado"; externalId: string | null; messageId?: string | null }
  /** A API recusou de forma clara: vale tentar de novo. */
  | { estado: "falhou"; erro: string }
  /**
   * Não houve resposta (tempo esgotado, conexão cortada). Pode ter sido
   * entregue: a central marca como incerto e NUNCA reenvia sozinha, para não
   * duplicar a mensagem no WhatsApp do cliente. Quem decide é o atendente.
   */
  | { estado: "incerto"; erro: string };

/** Fecha o pedido na fila de saída com o que realmente aconteceu. */
export async function concluirSaida(id: string | null, desfecho: DesfechoEnvio) {
  if (!id) return;
  try {
    const db = await admin();
    await db
      .from("mensagens_saida")
      .update({
        status: desfecho.estado,
        external_id: desfecho.estado === "enviado" ? desfecho.externalId : null,
        message_id: desfecho.estado === "enviado" ? (desfecho.messageId ?? null) : null,
        erro: desfecho.estado === "enviado" ? null : desfecho.erro.slice(0, 500),
        processado_em: new Date().toISOString(),
      } as never)
      .eq("id", id);
  } catch (error) {
    console.error(
      `[durabilidade] desfecho do envio ${id} não foi gravado:`,
      (error as Error).message,
    );
  }
}

/**
 * Decide se a falha deixa o envio "incerto" (pode ter chegado) ou "falhou"
 * (com certeza não saiu). Tempo esgotado e conexão cortada são os casos em que
 * a API pode ter recebido e entregue sem conseguir responder.
 */
export function classificarFalhaDeEnvio(error: unknown): Extract<DesfechoEnvio, { erro: string }> {
  const mensagem = error instanceof Error ? error.message : String(error);
  const nome = (error as Error | undefined)?.name ?? "";
  // "não respondeu" sem exigir o que vem depois: os três clientes escrevem
  // "não respondeu no tempo esperado", e o padrão antigo pedia "não respondeu
  // em". Nenhum tempo esgotado casava, então TODO envio sem resposta era
  // marcado como "falhou" e a tela de pendentes oferecia reenviar uma mensagem
  // que podia já estar no WhatsApp do cliente — duplicando a conversa.
  // "nao respondeu" sem acento cobre log e retorno de servidor sem UTF-8.
  const semResposta =
    nome === "TimeoutError" ||
    nome === "AbortError" ||
    /n[ãa]o respondeu|timeout|tempo esgotado|socket|ECONNRESET|ECONNABORTED|ETIMEDOUT|network|fetch failed/i.test(
      mensagem,
    );
  return semResposta ? { estado: "incerto", erro: mensagem } : { estado: "falhou", erro: mensagem };
}
