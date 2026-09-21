import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostagemDto = {
  id: string;
  nome: string;
  deviceId: string | null;
  destino: "grupos" | "todos_grupos" | "status" | "status_grupos";
  grupos: string[];
  mensagem: string;
  midiaUrl: string;
  midiaTipo: "nenhum" | "imagem" | "video";
  delaySegundos: number;
  frequencia: "unica" | "horas" | "diaria" | "dias_semana" | "semanal";
  intervaloHoras: number;
  diasSemana: number[];
  inicioEm: string | null;
  ativo: boolean;
  status: string;
  proximoEm: string | null;
  ultimoEm: string | null;
  ultimoStatus: string;
  totalEnviados: number;
  totalFalhas: number;
};

type Row = {
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
};

function toDto(row: Row): PostagemDto {
  return {
    id: row.id,
    nome: row.nome,
    deviceId: row.device_id,
    destino: row.destino as PostagemDto["destino"],
    grupos: row.grupos ?? [],
    mensagem: row.mensagem,
    midiaUrl: row.midia_url,
    midiaTipo: row.midia_tipo as PostagemDto["midiaTipo"],
    delaySegundos: row.delay_segundos,
    frequencia: row.frequencia as PostagemDto["frequencia"],
    intervaloHoras: row.intervalo_horas,
    diasSemana: row.dias_semana ?? [],
    inicioEm: row.inicio_em,
    ativo: row.ativo,
    status: row.status,
    proximoEm: row.proximo_em,
    ultimoEm: row.ultimo_em,
    ultimoStatus: row.ultimo_status,
    totalEnviados: row.total_enviados ?? 0,
    totalFalhas: row.total_falhas ?? 0,
  };
}

async function requireAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const papeis = ((data ?? []) as { role: string }[]).map((r) => r.role);
  if (!papeis.some((r) => r === "admin" || r === "superadmin")) {
    throw new Error("Apenas administradores podem gerenciar as postagens.");
  }
}

const postagemInput = z.object({
  nome: z.string().min(1, "Dê um nome à postagem."),
  deviceId: z.string().uuid().nullable().default(null),
  destino: z.enum(["grupos", "todos_grupos", "status", "status_grupos"]).default("todos_grupos"),
  grupos: z.array(z.string().min(3)).default([]),
  mensagem: z.string().default(""),
  midiaUrl: z.string().url().or(z.literal("")).default(""),
  midiaTipo: z.enum(["nenhum", "imagem", "video"]).default("nenhum"),
  delaySegundos: z.number().int().min(1).max(600).default(8),
  frequencia: z.enum(["unica", "horas", "diaria", "dias_semana", "semanal"]).default("unica"),
  intervaloHoras: z.number().int().min(1).max(720).default(24),
  diasSemana: z.array(z.number().int().min(0).max(6)).default([]),
  inicioEm: z.string().nullable().default(null),
  ativo: z.boolean().default(true),
});

function toRow(data: z.infer<typeof postagemInput>) {
  const inicio = data.inicioEm ? new Date(data.inicioEm) : null;
  const semMidia = data.midiaTipo === "nenhum" || !data.midiaUrl;
  return {
    nome: data.nome.trim(),
    device_id: data.deviceId,
    destino: data.destino,
    grupos: data.grupos.map((g) => g.trim()).filter(Boolean),
    mensagem: data.mensagem,
    midia_url: semMidia ? "" : data.midiaUrl,
    midia_tipo: semMidia ? "nenhum" : data.midiaTipo,
    delay_segundos: data.delaySegundos,
    frequencia: data.frequencia,
    intervalo_horas: data.intervaloHoras,
    dias_semana: data.diasSemana,
    inicio_em: inicio?.toISOString() ?? null,
    ativo: data.ativo,
    proximo_em: inicio ? inicio.toISOString() : data.ativo ? new Date().toISOString() : null,
    status: data.frequencia === "unica" ? "pendente" : "recorrente",
    updated_at: new Date().toISOString(),
  };
}

export const listPostagens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const projectId = await projetoDoUsuario(context.userId);
    let query = supabaseAdmin.from("postagens").select("*").order("created_at", { ascending: false });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Row[]).map(toDto);
  });

export const savePostagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid().nullable().default(null), postagem: postagemInput }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const row = toRow(data.postagem);
    const query = data.id
      ? supabaseAdmin.from("postagens").update(row).eq("id", data.id).select("id").single()
      : supabaseAdmin
          .from("postagens")
          .insert({ ...row, project_id: await projetoDoUsuario(context.userId) })
          .select("id")
          .single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return { id: (saved as { id: string }).id };
  });

export const togglePostagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let proximoEm: string | null = null;
    if (data.ativo) {
      const { data: row } = await supabaseAdmin
        .from("postagens")
        .select("proximo_em")
        .eq("id", data.id)
        .maybeSingle();
      const proximo = (row as { proximo_em?: string | null } | null)?.proximo_em ?? null;
      if (!proximo) proximoEm = new Date().toISOString();
    }
    const { error } = await supabaseAdmin
      .from("postagens")
      .update({
        ativo: data.ativo,
        updated_at: new Date().toISOString(),
        ...(proximoEm ? { proximo_em: proximoEm } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePostagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("postagens").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Publica agora, sem esperar o agendamento. */
export const runPostagemNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { executarPostagem } = await import("@/lib/postagens.server");
    return executarPostagem(data.id);
  });

/** Histórico de entregas de uma postagem. */
export const listPostagemEnvios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ postagemId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("postagem_envios")
      .select("id, destino, destino_nome, tipo, ok, detalhe, created_at")
      .eq("postagem_id", data.postagemId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as {
      id: string;
      destino: string;
      destino_nome: string;
      tipo: string;
      ok: boolean;
      detalhe: string;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      destino: r.destino,
      destinoNome: r.destino_nome || r.destino,
      tipo: r.tipo,
      ok: r.ok,
      detalhe: r.detalhe,
      createdAt: r.created_at,
    }));
  });

/** Grupos disponíveis nas APIs conectadas (Evolution Go ou WuzAPI). */
export const listPostagemGrupos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ deviceId: z.string().uuid().nullable().default(null) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { fetchBroadcastGroups } = await import("@/lib/broadcast.server");
    return fetchBroadcastGroups({ channel: "device", deviceId: data.deviceId });
  });
