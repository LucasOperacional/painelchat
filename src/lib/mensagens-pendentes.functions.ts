import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchComPrazo } from "@/lib/http.server";

// Reentrega de evento de webhook: uma tentativa por vez. O evento continua
// marcado como pendente quando falha e volta na próxima rodada, então repetir
// aqui só arriscaria gravar a mesma mensagem duas vezes.
const REENTREGA_TIMEOUT_MS = 30_000;

async function requireAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (
    !((data ?? []) as { role: string }[]).some(
      (r) => r.role === "admin" || r.role === "superadmin",
    )
  ) {
    throw new Error("Apenas administradores podem ver as mensagens pendentes.");
  }
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function texto(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Só avisos de mensagem individual entram na conta. Sincronizações de histórico,
 * confirmações de leitura, presença e afins não geram mensagem no chat e, se
 * reenviados, trariam conversas antigas de volta.
 */
const EVENTOS_DE_MENSAGEM = new Set(["message", "sendmessage", "messages.upsert"]);

function eventoDeMensagem(nome: string, payload: unknown): boolean {
  const limpo = nome.trim().toLowerCase();
  if (EVENTOS_DE_MENSAGEM.has(limpo)) return true;
  if (limpo && limpo !== "[object object]") return false;
  // Avisos antigos guardaram "[object Object]": o tipo real está no conteúdo.
  const raiz = obj(payload);
  const tipo = (texto(raiz["type"]) || texto(raiz["event_type"])).toLowerCase();
  return EVENTOS_DE_MENSAGEM.has(tipo);
}

/** Tenta achar quem enviou e o conteúdo dentro de qualquer formato de aviso. */
function resumirPayload(payload: unknown): {
  de: string;
  conteudo: string;
  tipo: string;
  fromMe: boolean;
} {
  const raiz = obj(payload);
  const data = obj(raiz["data"] ?? raiz["jsonData"] ?? raiz["event"] ?? raiz);
  const info = obj(data["Info"] ?? data["info"]);
  const key = obj(data["key"] ?? info["key"]);
  const msg = obj(data["message"] ?? data["Message"]);

  const de =
    texto(info["Chat"]) ||
    texto(info["SenderAlt"]) ||
    texto(info["Sender"]) ||
    texto(key["remoteJid"]) ||
    texto(data["from"]) ||
    texto(raiz["from"]) ||
    "—";

  const pushName =
    texto(info["PushName"]) || texto(data["pushName"]) || texto(raiz["pushName"]);

  const conversa =
    texto(msg["conversation"]) ||
    texto(obj(msg["extendedTextMessage"])["text"]) ||
    texto(data["text"]) ||
    texto(obj(data["Message"])["conversation"]);

  let tipo = "texto";
  if (obj(msg["imageMessage"])["url"] || obj(data["imageMessage"])["url"]) tipo = "imagem";
  else if (obj(msg["audioMessage"])["url"] || obj(data["audioMessage"])["url"]) tipo = "áudio";
  else if (obj(msg["videoMessage"])["url"]) tipo = "vídeo";
  else if (obj(msg["documentMessage"])["url"]) tipo = "documento";
  else if (obj(msg["stickerMessage"])["url"]) tipo = "figurinha";
  else if (!conversa) tipo = "outro";

  const fromMe = Boolean(
    key["fromMe"] ?? info["IsFromMe"] ?? data["fromMe"] ?? info["fromMe"],
  );

  return {
    de: pushName ? `${pushName} (${de})` : de,
    conteudo: conversa || "",
    tipo,
    fromMe,
  };
}

/**
 * Lista os avisos que a API entregou mas que não geraram mensagem no chat,
 * com data e hora de chegada.
 */
export const mensagensNaoEntregues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ horas: z.number().min(1).max(168).default(24) })
      .partial()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const horas = data?.horas ?? 24;
    const desde = new Date(Date.now() - horas * 3600_000).toISOString();

    const { data: eventos, error } = await supabaseAdmin
      .from("webhook_eventos")
      .select("id, evento, status, erro, external_id, payload, created_at, processado_em")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const lista = (eventos ?? []) as Record<string, unknown>[];
    const ids = Array.from(
      new Set(
        lista
          .map((e) => texto(e["external_id"]))
          .filter((v) => v.length > 0),
      ),
    );

    const salvos = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const fatia = ids.slice(i, i + 300);
      const { data: msgs } = await supabaseAdmin
        .from("messages")
        .select("external_id")
        .in("external_id", fatia);
      for (const m of (msgs ?? []) as { external_id: string | null }[]) {
        if (m.external_id) salvos.add(m.external_id);
      }
    }

    const agora = Date.now();
    let descartados = 0;

    const pendentes = lista
      .filter((e) => {
        const status = texto(e["status"]);
        // Avisos descartados de propósito (canal, grupo desligado, número de
        // controle, evento sem suporte) não são mensagens perdidas.
        if (status === "ignorado") {
          descartados += 1;
          return false;
        }
        const nome = texto(e["evento"]);
        if (!eventoDeMensagem(nome, e["payload"])) return false;
        if (status === "erro") return true;
        if (status === "processando") {
          // ainda pode estar sendo gravado agora
          return agora - new Date(String(e["created_at"])).getTime() > 120_000;
        }
        const id = texto(e["external_id"]);
        if (!id) return false;
        return !salvos.has(id);
      })
      .map((e) => {
        const resumo = resumirPayload(e["payload"]);
        return {
          id: String(e["id"]),
          evento: texto(e["evento"]) || "—",
          status: texto(e["status"]) || "—",
          erro: texto(e["erro"]) || null,
          externalId: texto(e["external_id"]) || null,
          criadoEm: String(e["created_at"] ?? ""),
          processadoEm: (e["processado_em"] as string | null) ?? null,
          ...resumo,
        };
      });

    const comMensagem = pendentes.filter((p) => p.conteudo.length > 0);

    return {
      horas,
      totalEventos: lista.length,
      totalPendentes: pendentes.length,
      totalDescartados: descartados,
      pendentes: pendentes.slice(0, 300),
      pendentesComConteudo: comMensagem.length,
    };
  });

/** Reprocessa um aviso pendente, passando o conteúdo original pelo webhook interno. */
export const reprocessarAviso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: evento, error } = await supabaseAdmin
      .from("webhook_eventos")
      .select("id, token, payload, corpo_bruto, corpo_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!evento) throw new Error("Aviso não encontrado.");

    // Reentrega com o corpo ORIGINAL. O campo `payload` é só o resumo da tela,
    // onde mídia grande aparece encurtada: reenviá-lo gravaria a mensagem sem
    // o arquivo. O corpo fiel fica em `corpo_bruto` ou no armazenamento.
    const registro = evento as Record<string, unknown>;
    let corpoEnvio = texto(registro["corpo_bruto"]);
    if (!corpoEnvio && texto(registro["corpo_path"])) {
      const { lerCorpoGuardado } = await import("@/lib/mensagens-durabilidade.server");
      corpoEnvio = (await lerCorpoGuardado(texto(registro["corpo_path"]))) ?? "";
    }
    if (!corpoEnvio) corpoEnvio = JSON.stringify(registro["payload"] ?? {});

    const base =
      process.env["PUBLIC_SITE_URL"] ??
      "https://project--a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779.lovable.app";
    const url = `${base.replace(/\/$/, "")}/api/public/evolution?token=${encodeURIComponent(
      String((evento as Record<string, unknown>)["token"] ?? ""),
    )}`;

    const resposta = await fetchComPrazo(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: corpoEnvio,
      },
      { label: "a central", timeoutMs: REENTREGA_TIMEOUT_MS },
    );
    const corpo = await resposta.text();

    await supabaseAdmin
      .from("webhook_eventos")
      .update({
        status: resposta.ok ? "ok" : "erro",
        processado_em: new Date().toISOString(),
        erro: resposta.ok ? null : corpo.slice(0, 500),
      })
      .eq("id", data.id);

    return { ok: resposta.ok, detalhe: corpo.slice(0, 300) };
  });

/** Reenvia para o chat todos os avisos pendentes do período escolhido. */
export const reprocessarTodos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ horas: z.number().min(1).max(168).default(24) })
      .partial()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const horas = data?.horas ?? 24;
    const desde = new Date(Date.now() - horas * 3600_000).toISOString();

    const { data: eventos, error } = await supabaseAdmin
      .from("webhook_eventos")
      .select(
        "id, token, evento, status, external_id, payload, corpo_bruto, corpo_path, created_at",
      )
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(2000);
    if (error) throw new Error(error.message);

    const lista = (eventos ?? []) as Record<string, unknown>[];
    const ids = Array.from(
      new Set(lista.map((e) => texto(e["external_id"])).filter((v) => v.length > 0)),
    );

    const salvos = new Set<string>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data: msgs } = await supabaseAdmin
        .from("messages")
        .select("external_id")
        .in("external_id", ids.slice(i, i + 300));
      for (const m of (msgs ?? []) as { external_id: string | null }[]) {
        if (m.external_id) salvos.add(m.external_id);
      }
    }

    const agora = Date.now();
    const pendentes = lista.filter((e) => {
      const status = texto(e["status"]);
      if (status === "ignorado") return false;
      if (!eventoDeMensagem(texto(e["evento"]), e["payload"])) return false;
      if (status === "erro") return true;
      if (status === "processando") {
        return agora - new Date(String(e["created_at"])).getTime() > 120_000;
      }
      const id = texto(e["external_id"]);
      if (!id) return false;
      return !salvos.has(id);
    });

    const base =
      process.env["PUBLIC_SITE_URL"] ??
      "https://project--a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779.lovable.app";

    let enviados = 0;
    let falhas = 0;
    const alvo = pendentes.slice(0, 200);

    for (const evento of alvo) {
      const url = `${base.replace(/\/$/, "")}/api/public/evolution?token=${encodeURIComponent(
        String(evento["token"] ?? ""),
      )}`;
      try {
        // Corpo original primeiro: o `payload` é o resumo da tela e reenviá-lo
        // gravaria a mensagem sem a mídia.
        let corpoEnvio = texto(evento["corpo_bruto"]);
        if (!corpoEnvio && texto(evento["corpo_path"])) {
          const { lerCorpoGuardado } = await import("@/lib/mensagens-durabilidade.server");
          corpoEnvio = (await lerCorpoGuardado(texto(evento["corpo_path"]))) ?? "";
        }
        if (!corpoEnvio) corpoEnvio = JSON.stringify(evento["payload"] ?? {});

        const resposta = await fetchComPrazo(
          url,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: corpoEnvio,
          },
          { label: "a central", timeoutMs: REENTREGA_TIMEOUT_MS },
        );
        const corpo = await resposta.text();
        if (resposta.ok) enviados += 1;
        else falhas += 1;
        await supabaseAdmin
          .from("webhook_eventos")
          .update({
            status: resposta.ok ? "ok" : "erro",
            processado_em: new Date().toISOString(),
            erro: resposta.ok ? null : corpo.slice(0, 500),
          })
          .eq("id", String(evento["id"]));
      } catch (e) {
        falhas += 1;
        await supabaseAdmin
          .from("webhook_eventos")
          .update({
            status: "erro",
            processado_em: new Date().toISOString(),
            erro: String((e as Error).message ?? e).slice(0, 500),
          })
          .eq("id", String(evento["id"]));
      }
    }

    return {
      total: pendentes.length,
      processados: alvo.length,
      enviados,
      falhas,
      restantes: Math.max(0, pendentes.length - alvo.length),
    };
  });

/* ------------------------------------------------------------------ */
/* Mensagens ENVIADAS que não chegaram a sair                          */
/* ------------------------------------------------------------------ */

/**
 * Lista os envios que ficaram pelo caminho. Três situações distintas:
 *
 *  - `falhou`   → a API recusou. Pode reenviar sem risco.
 *  - `incerto`  → a API não respondeu. PODE ter entregue: reenviar duplicaria a
 *                 mensagem no WhatsApp do cliente, então quem decide é o
 *                 atendente, depois de conferir a conversa.
 *  - `enviando` → o servidor caiu no meio do envio e nunca gravou o desfecho.
 *                 Tratado como incerto pelo mesmo motivo.
 */
export const enviosPendentes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ horas: z.number().min(1).max(168).default(24) })
      .partial()
      .parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const horas = data?.horas ?? 24;
    const desde = new Date(Date.now() - horas * 3600_000).toISOString();

    const { data: linhas, error } = await supabaseAdmin
      .from("mensagens_saida")
      .select(
        "id, conversation_id, destino, tipo, status, tentativas, erro, external_id, payload, created_at, processado_em",
      )
      .in("status", ["pendente", "enviando", "falhou", "incerto"])
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const agora = Date.now();
    const lista = ((linhas ?? []) as Record<string, unknown>[])
      // "enviando" recente pode estar saindo agora mesmo: só conta como preso
      // depois de dois minutos.
      .filter((linha) => {
        const status = texto(linha["status"]);
        if (status !== "enviando" && status !== "pendente") return true;
        return agora - new Date(String(linha["created_at"])).getTime() > 120_000;
      })
      .map((linha) => {
        const status = texto(linha["status"]);
        const conteudo = obj(linha["payload"]);
        const preso = status === "enviando" || status === "pendente";
        return {
          id: String(linha["id"]),
          conversationId: texto(linha["conversation_id"]) || null,
          destino: texto(linha["destino"]),
          tipo: texto(linha["tipo"]) || "texto",
          // Um envio preso em "enviando" é, na prática, incerto.
          status: preso ? "incerto" : status,
          tentativas: Number(linha["tentativas"] ?? 0),
          erro: texto(linha["erro"]) || null,
          externalId: texto(linha["external_id"]) || null,
          conteudo: texto(conteudo["texto"]).slice(0, 500),
          criadoEm: String(linha["created_at"] ?? ""),
          processadoEm: (linha["processado_em"] as string | null) ?? null,
          // Só o que a API recusou pode ser reenviado sem risco de duplicar.
          podeReenviar: status === "falhou",
        };
      });

    return {
      horas,
      total: lista.length,
      podemReenviar: lista.filter((l) => l.podeReenviar).length,
      incertos: lista.filter((l) => !l.podeReenviar).length,
      envios: lista,
    };
  });

/**
 * Reenvia um envio que a API recusou. Recusa envios `incerto` de propósito: sem
 * confirmação da API, repetir pode entregar a mesma mensagem duas vezes ao
 * cliente. Use `forcar` só depois de conferir a conversa no WhatsApp.
 */
export const reenviarPendente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), forcar: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: linha, error } = await supabaseAdmin
      .from("mensagens_saida")
      .select("id, conversation_id, config_id, destino, tipo, status, tentativas, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!linha) throw new Error("Envio não encontrado.");

    const registro = linha as Record<string, unknown>;
    const status = texto(registro["status"]);
    if (status === "enviado") {
      return { ok: true, detalhe: "Esta mensagem já foi entregue." };
    }
    if (status !== "falhou" && !data.forcar) {
      throw new Error(
        "A API não confirmou este envio: a mensagem pode ter sido entregue. Confira a conversa no WhatsApp e, se realmente não chegou, use a opção de reenviar mesmo assim.",
      );
    }

    const conteudo = obj(registro["payload"]);
    const texto0 = texto(conteudo["texto"]);
    if (!texto0) {
      throw new Error(
        "Este envio tinha anexo ou figurinha: reenvie pela conversa para o arquivo ir junto.",
      );
    }

    const { loadEvolutionConfig, evolutionSendText } = await import("@/lib/evolution.server");
    const config = await loadEvolutionConfig(texto(registro["config_id"]) || null);
    if (!config?.base_url || !config?.instance_id) {
      throw new Error("O dispositivo deste envio não está configurado.");
    }

    const tentativas = Number(registro["tentativas"] ?? 0) + 1;
    try {
      const externalId = await evolutionSendText(
        { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
        { number: texto(registro["destino"]), text: texto0 },
      );
      await supabaseAdmin
        .from("mensagens_saida")
        .update({
          status: "enviado",
          external_id: externalId,
          tentativas,
          erro: null,
          processado_em: new Date().toISOString(),
        })
        .eq("id", data.id);
      return { ok: true, detalhe: "Mensagem reenviada." };
    } catch (e) {
      const { classificarFalhaDeEnvio } = await import("@/lib/mensagens-durabilidade.server");
      const desfecho = classificarFalhaDeEnvio(e);
      await supabaseAdmin
        .from("mensagens_saida")
        .update({
          status: desfecho.estado,
          tentativas,
          erro: desfecho.erro.slice(0, 500),
          processado_em: new Date().toISOString(),
        })
        .eq("id", data.id);
      return { ok: false, detalhe: desfecho.erro.slice(0, 300) };
    }
  });
