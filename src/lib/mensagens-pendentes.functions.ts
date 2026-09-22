import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    const pendentes = lista
      .filter((e) => {
        const id = texto(e["external_id"]);
        const status = texto(e["status"]);
        if (status === "erro" || status === "processando") return true;
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

    const comMensagem = pendentes.filter(
      (p) => p.evento === "Message" || p.evento === "SendMessage" || p.conteudo,
    );

    return {
      horas,
      totalEventos: lista.length,
      totalPendentes: pendentes.length,
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
      .select("id, token, payload")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!evento) throw new Error("Aviso não encontrado.");

    const base =
      process.env["PUBLIC_SITE_URL"] ??
      "https://project--a3daa33e-35ce-4bc4-9ed0-fa0c79c7a779.lovable.app";
    const url = `${base.replace(/\/$/, "")}/api/public/evolution?token=${encodeURIComponent(
      String((evento as Record<string, unknown>)["token"] ?? ""),
    )}`;

    const resposta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify((evento as Record<string, unknown>)["payload"] ?? {}),
    });
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
