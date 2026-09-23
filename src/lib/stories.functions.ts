import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StoryItem = {
  id: string;
  tipo: "status" | "canal";
  chatJid: string;
  autorJid: string;
  autorNome: string;
  texto: string;
  midiaUrl: string;
  midiaTipo: string;
  createdAt: string;
  conexao: string;
};

export type CanalItem = {
  id: string;
  nome: string;
  descricao: string;
  inscritos: number | null;
  papel: string;
  podeEnviar: boolean;
};

/** Publica uma mensagem em um canal onde o número conectado é admin/dono. */
export const enviarNoCanal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        deviceId: z.string().uuid().nullable().default(null),
        jid: z.string().min(5),
        texto: z.string().default(""),
        midiaUrl: z.string().default(""),
        midiaTipo: z.enum(["imagem", "video"]).default("imagem"),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { publicarNoCanal } = await import("@/lib/stories.server");
    return publicarNoCanal({
      deviceId: data.deviceId,
      jid: data.jid,
      texto: data.texto,
      midiaUrl: data.midiaUrl,
      midiaTipo: data.midiaTipo,
    });
  });

/** Stories e canais recebidos pelas conexões (gravados pelo webhook). */
export const listStoriesRecebidos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        tipo: z.enum(["status", "canal", "todos"]).default("todos"),
        deviceId: z.string().uuid().nullable().default(null),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const projectId = await projetoDoUsuario(context.userId);

    let query = supabaseAdmin
      .from("stories_recebidos")
      .select("id, tipo, chat_jid, autor_jid, autor_nome, texto, midia_url, midia_tipo, created_at, config_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (projectId) query = query.or(`project_id.eq.${projectId},project_id.is.null`);
    if (data.tipo !== "todos") query = query.eq("tipo", data.tipo);
    if (data.deviceId) query = query.eq("config_id", data.deviceId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set(
        ((rows ?? []) as { config_id: string | null }[])
          .map((r) => r.config_id)
          .filter((v): v is string => !!v),
      ),
    );
    const nomes = new Map<string, string>();
    if (ids.length > 0) {
      const { data: devices } = await supabaseAdmin
        .from("whatsapp_config")
        .select("id, label")
        .in("id", ids);
      for (const d of (devices ?? []) as { id: string; label: string | null }[]) {
        nomes.set(d.id, d.label || "WhatsApp");
      }
    }

    const itens = ((rows ?? []) as unknown as {
      id: string;
      tipo: string;
      chat_jid: string;
      autor_jid: string;
      autor_nome: string;
      texto: string;
      midia_url: string;
      midia_tipo: string;
      created_at: string;
      config_id: string | null;
    }[]).map<StoryItem>((r) => ({
      id: r.id,
      tipo: r.tipo === "canal" ? "canal" : "status",
      chatJid: r.chat_jid,
      autorJid: r.autor_jid,
      autorNome: r.autor_nome,
      texto: r.texto,
      midiaUrl: r.midia_url,
      midiaTipo: r.midia_tipo,
      createdAt: r.created_at,
      conexao: (r.config_id && nomes.get(r.config_id)) || "WhatsApp",
    }));

    // Publicações de canal sem nome: resolve o nome real na conexão,
    // ignora valores de uma letra só e grava o nome encontrado no histórico.
    const semNome = Array.from(
      new Set(
        itens
          .filter((i) => i.tipo === "canal" && i.autorNome.trim().length < 2)
          .map((i) => i.chatJid),
      ),
    );
    if (semNome.length > 0) {
      try {
        const { nomesDosCanais } = await import("@/lib/stories.server");
        const resolvidos = await nomesDosCanais(data.deviceId, semNome);
        for (const item of itens) {
          const nome = resolvidos.get(item.chatJid);
          if (nome && item.autorNome.trim().length < 2) item.autorNome = nome;
        }
        for (const [jid, nome] of resolvidos) {
          void supabaseAdmin
            .from("stories_recebidos")
            .update({ autor_nome: nome })
            .eq("tipo", "canal")
            .eq("chat_jid", jid)
            .or("autor_nome.is.null,autor_nome.eq.")
            .then(() => undefined, () => undefined);
        }
      } catch {
        /* mantém como está; a próxima leitura tenta de novo */
      }
    }

    return itens;
  });

/** Canais (newsletters) que o número conectado acompanha, lidos direto na API. */
export const listCanaisConectados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ deviceId: z.string().uuid().nullable().default(null) }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { listarCanais } = await import("@/lib/stories.server");
    return listarCanais(data.deviceId);
  });

/** Stories publicados pela própria central (histórico das postagens). */
export const listStoriesPublicados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("postagem_envios")
      .select("id, destino, destino_nome, tipo, ok, detalhe, created_at")
      .eq("tipo", "status")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as {
      id: string;
      destino_nome: string;
      ok: boolean;
      detalhe: string;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      destino: r.destino_nome || "Status / Stories",
      ok: r.ok,
      detalhe: r.detalhe,
      createdAt: r.created_at,
    }));
  });
