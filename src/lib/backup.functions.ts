import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnyClient = { from: (t: string) => any };

/** Tabelas de configuração — sempre incluídas no backup. */
const CONFIG_TABLES = [
  "projects",
  "project_domains",
  "departments",
  "queues",
  "queue_agents",
  "profiles",
  "user_roles",
  "whatsapp_config",
  "ai_config",
  "chatbots",
  "chatbot_options",
  "button_menus",
  "broadcast_campaigns",
  "inbound_settings",
] as const;

/** Tabelas de conversas/histórico — opcionais (podem ser grandes). */
const DATA_TABLES = ["contacts", "conversations", "messages", "transfers"] as const;

/** Tabelas com tokens e chaves de API — opcionais. */
const SECRET_TABLES = [
  "whatsapp_secrets",
  "ai_secrets",
  "divulgazap_secrets",
  "nfse_secrets",
  "broadcast_settings",
] as const;

const CONFLICT_KEYS: Record<string, string> = {
  whatsapp_secrets: "config_id",
  ai_secrets: "provider",
  divulgazap_secrets: "provider",
  nfse_secrets: "provider",
  inbound_settings: "id",
  broadcast_settings: "id",
  queue_agents: "id",
};

async function requireAdmin(context: { supabase: AnyClient; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => r.role === "admin")) {
    throw new Error("Apenas administradores podem usar o backup.");
  }
}

/** Gera o backup completo (JSON) com configurações, integrações e histórico. */
export const gerarBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        incluirHistorico: z.boolean().default(true),
        incluirChaves: z.boolean().default(true),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as never as { supabase: AnyClient; userId: string };
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tabelas = [
      ...CONFIG_TABLES,
      ...(data.incluirHistorico ? DATA_TABLES : []),
      ...(data.incluirChaves ? SECRET_TABLES : []),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conteudo: Record<string, any[]> = {};
    const resumo: { tabela: string; registros: number }[] = [];

    for (const tabela of tabelas) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linhas: any[] = [];
      const pagina = 1000;
      for (let inicio = 0; ; inicio += pagina) {
        const { data: rows, error } = await (supabaseAdmin as unknown as AnyClient)
          .from(tabela)
          .select("*")
          .range(inicio, inicio + pagina - 1);
        if (error) throw new Error(`${tabela}: ${error.message}`);
        const lote = (rows ?? []) as unknown[];
        linhas.push(...lote);
        if (lote.length < pagina) break;
      }
      conteudo[tabela] = linhas;
      resumo.push({ tabela, registros: linhas.length });
    }

    return {
      versao: 1,
      geradoEm: new Date().toISOString(),
      incluiHistorico: data.incluirHistorico,
      incluiChaves: data.incluirChaves,
      resumo,
      conteudo,
    };
  });

/** Restaura um backup gerado por esta tela. */
export const restaurarBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        conteudo: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as never as { supabase: AnyClient; userId: string };
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ordem = [...CONFIG_TABLES, ...DATA_TABLES, ...SECRET_TABLES] as readonly string[];
    const resultado: { tabela: string; registros: number; erro?: string }[] = [];

    for (const tabela of ordem) {
      const linhas = data.conteudo[tabela];
      if (!linhas || linhas.length === 0) continue;
      let gravados = 0;
      let erro: string | undefined;
      const pagina = 200;
      for (let i = 0; i < linhas.length; i += pagina) {
        const lote = linhas.slice(i, i + pagina);
        const { error } = await (supabaseAdmin as unknown as AnyClient)
          .from(tabela)
          .upsert(lote, { onConflict: CONFLICT_KEYS[tabela] ?? "id" });
        if (error) {
          erro = error.message;
          break;
        }
        gravados += lote.length;
      }
      resultado.push({ tabela, registros: gravados, ...(erro ? { erro } : {}) });
    }

    return {
      ok: resultado.every((r) => !r.erro),
      resultado,
    };
  });

/** Lê todas as linhas de uma tabela em páginas de 1000. */
async function lerTudo(client: AnyClient, tabela: string, colunas: string, ordem?: string) {
  const linhas: Record<string, unknown>[] = [];
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    let q = client.from(tabela).select(colunas).range(inicio, inicio + pagina - 1);
    if (ordem) q = q.order(ordem, { ascending: true });
    const { data, error } = await q;
    if (error) throw new Error(`${tabela}: ${error.message}`);
    const lote = (data ?? []) as Record<string, unknown>[];
    linhas.push(...lote);
    if (lote.length < pagina) break;
  }
  return linhas;
}

const csvCell = (valor: unknown) => `"${String(valor ?? "").replace(/"/g, '""')}"`;
const csvLinha = (valores: unknown[]) => valores.map(csvCell).join(";");

/** Exporta contatos (pessoas e grupos) em CSV pronto para abrir na planilha. */
export const exportarContatos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as never as { supabase: AnyClient; userId: string };
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as AnyClient;

    const contatos = await lerTudo(
      client,
      "contacts",
      "id, name, phone, wa_jid, notes, created_at",
      "name",
    );

    const linhas = [csvLinha(["Nome", "Telefone", "Tipo", "WhatsApp ID", "Observações", "Criado em"])];
    let grupos = 0;
    for (const c of contatos) {
      const jid = String(c["wa_jid"] ?? "");
      const grupo = jid.endsWith("@g.us");
      if (grupo) grupos += 1;
      linhas.push(
        csvLinha([c["name"], c["phone"], grupo ? "Grupo" : "Pessoa", jid, c["notes"], c["created_at"]]),
      );
    }

    return {
      csv: `\uFEFF${linhas.join("\n")}`,
      total: contatos.length,
      grupos,
      pessoas: contatos.length - grupos,
    };
  });

/** Exporta todas as conversas (inclusive grupos) com o histórico completo de mensagens. */
export const exportarConversas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ incluirGrupos: z.boolean().default(true), somenteGrupos: z.boolean().default(false) })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as never as { supabase: AnyClient; userId: string };
    await requireAdmin(ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = supabaseAdmin as unknown as AnyClient;

    const [contatos, conversas, mensagens, perfis] = await Promise.all([
      lerTudo(client, "contacts", "id, name, phone, wa_jid"),
      lerTudo(client, "conversations", "id, contact_id, status, channel, created_at, closed_at, last_message_at"),
      lerTudo(
        client,
        "messages",
        "id, conversation_id, sender_id, direction, body, created_at",
        "created_at",
      ),
      lerTudo(client, "profiles", "id, full_name"),
    ]);

    const contatoPorId = new Map(contatos.map((c) => [String(c["id"]), c]));
    const nomePorUsuario = new Map(perfis.map((p) => [String(p["id"]), String(p["full_name"] ?? "")]));
    const porConversa = new Map<string, Record<string, unknown>[]>();
    for (const m of mensagens) {
      const chave = String(m["conversation_id"]);
      const lista = porConversa.get(chave) ?? [];
      lista.push(m);
      porConversa.set(chave, lista);
    }

    const saida = [];
    let totalMensagens = 0;
    let totalGrupos = 0;

    for (const conversa of conversas) {
      const contato = contatoPorId.get(String(conversa["contact_id"]));
      const jid = String(contato?.["wa_jid"] ?? "");
      const grupo = jid.endsWith("@g.us");
      if (grupo && !data.incluirGrupos) continue;
      if (!grupo && data.somenteGrupos) continue;
      if (grupo) totalGrupos += 1;

      const msgs = (porConversa.get(String(conversa["id"])) ?? []).map((m) => ({
        data: String(m["created_at"] ?? ""),
        sentido: String(m["direction"] ?? ""),
        autor:
          m["direction"] === "outbound"
            ? nomePorUsuario.get(String(m["sender_id"])) || "Atendente"
            : String(contato?.["name"] ?? contato?.["phone"] ?? "Contato"),
        texto: String(m["body"] ?? ""),
      }));
      totalMensagens += msgs.length;

      saida.push({
        id: String(conversa["id"] ?? ""),
        tipo: grupo ? "grupo" : "individual",
        nome: String(contato?.["name"] ?? contato?.["phone"] ?? "Sem nome"),
        telefone: String(contato?.["phone"] ?? ""),
        whatsappId: jid,
        status: String(conversa["status"] ?? ""),
        canal: String(conversa["channel"] ?? ""),
        criadaEm: String(conversa["created_at"] ?? ""),
        ultimaMensagemEm: String(conversa["last_message_at"] ?? ""),
        encerradaEm: conversa["closed_at"] ? String(conversa["closed_at"]) : null,
        mensagens: msgs,
      });
    }

    return {
      versao: 1,
      geradoEm: new Date().toISOString(),
      totalConversas: saida.length,
      totalGrupos,
      totalMensagens,
      conversas: saida,
    };
  });
