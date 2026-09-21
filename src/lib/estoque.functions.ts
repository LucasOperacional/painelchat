import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Contexto = { supabase: { from: (t: string) => any }; userId: string };

async function requireAdmin(context: Contexto) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem gerenciar o estoque.");
  }
}

/* -------------------------------- Categorias ------------------------------- */

const categoriaInput = z.object({
  id: z.string().uuid().nullable().default(null),
  nome: z.string().trim().min(1, "Informe o nome da categoria").max(80),
  descricao: z.string().trim().max(400).default(""),
  preco: z.number().min(0).default(0),
  entregaMensagem: z.string().trim().max(1000).default(""),
  ativo: z.boolean().default(true),
});

/** Categorias com a contagem de logins disponíveis e vendidos. */
export const listarEstoque = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Contexto;
    const { data: cats, error } = await ctx.supabase
      .from("estoque_categorias")
      .select("*")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);

    let ehAdmin = true;
    try {
      await requireAdmin(ctx);
    } catch {
      ehAdmin = false;
    }

    let itens: Record<string, unknown>[] = [];
    if (ehAdmin) {
      const { data: rows, error: e2 } = await ctx.supabase
        .from("estoque_itens")
        .select("*")
        .order("created_at", { ascending: true });
      if (e2) throw new Error(e2.message);
      itens = (rows ?? []) as Record<string, unknown>[];
    }

    const categorias = ((cats ?? []) as Record<string, unknown>[]).map((c) => {
      const id = String(c["id"] ?? "");
      const doGrupo = itens.filter((i) => String(i["categoria_id"]) === id);
      return {
        id,
        nome: String(c["nome"] ?? ""),
        descricao: String(c["descricao"] ?? ""),
        preco: Number(c["preco"] ?? 0),
        entregaMensagem: String(c["entrega_mensagem"] ?? ""),
        ativo: Boolean(c["ativo"]),
        disponiveis: doGrupo.filter((i) => i["status"] === "disponivel").length,
        vendidos: doGrupo.filter((i) => i["status"] === "vendido").length,
        total: doGrupo.length,
      };
    });

    return {
      ehAdmin,
      categorias,
      itens: itens.map((i) => ({
        id: String(i["id"] ?? ""),
        categoriaId: String(i["categoria_id"] ?? ""),
        titulo: String(i["titulo"] ?? ""),
        login: String(i["login"] ?? ""),
        senha: String(i["senha"] ?? ""),
        url: String(i["url"] ?? ""),
        extras: String(i["extras"] ?? ""),
        validade: i["validade"] ? String(i["validade"]) : "",
        status: String(i["status"] ?? "disponivel"),
        vendidoEm: i["vendido_em"] ? String(i["vendido_em"]) : "",
      })),
    };
  });

export const salvarCategoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => categoriaInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const linha = {
      nome: data.nome,
      descricao: data.descricao,
      preco: data.preco,
      entrega_mensagem: data.entregaMensagem,
      ativo: data.ativo,
      updated_at: new Date().toISOString(),
    };
    const db = (context as unknown as Contexto).supabase;
    if (data.id) {
      const { error } = await db.from("estoque_categorias").update(linha).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: criado, error } = await db
      .from("estoque_categorias")
      .insert(linha)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: String((criado as { id?: string } | null)?.id ?? "") };
  });

export const removerCategoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const { error } = await (context as unknown as Contexto).supabase
      .from("estoque_categorias")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------- Logins --------------------------------- */

const itemInput = z.object({
  id: z.string().uuid().nullable().default(null),
  categoriaId: z.string().uuid(),
  titulo: z.string().trim().max(120).default(""),
  login: z.string().trim().min(1, "Informe o login").max(200),
  senha: z.string().trim().max(200).default(""),
  url: z.string().trim().max(300).default(""),
  extras: z.string().trim().max(1000).default(""),
  validade: z.string().trim().max(10).nullable().default(null),
  status: z.enum(["disponivel", "reservado", "vendido", "inativo"]).default("disponivel"),
});

export const salvarItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => itemInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const db = (context as unknown as Contexto).supabase;
    const linha = {
      categoria_id: data.categoriaId,
      titulo: data.titulo,
      login: data.login,
      senha: data.senha,
      url: data.url,
      extras: data.extras,
      validade: data.validade || null,
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await db.from("estoque_itens").update(linha).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: criado, error } = await db
      .from("estoque_itens")
      .insert(linha)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: String((criado as { id?: string } | null)?.id ?? "") };
  });

/** Cadastro em massa: uma linha por login, no formato login;senha;observações. */
export const importarLogins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        categoriaId: z.string().uuid(),
        texto: z.string().max(50_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const linhas = data.texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const partes = l.split(/[;|]|\s{2,}|:(?!\/\/)/).map((p) => p.trim());
        return {
          categoria_id: data.categoriaId,
          login: partes[0] ?? "",
          senha: partes[1] ?? "",
          extras: partes.slice(2).join(" ").trim(),
          status: "disponivel",
        };
      })
      .filter((l) => l.login);
    if (!linhas.length) throw new Error("Nenhum login encontrado no texto.");
    const { error } = await (context as unknown as Contexto).supabase
      .from("estoque_itens")
      .insert(linhas);
    if (error) throw new Error(error.message);
    return { criados: linhas.length };
  });

export const removerItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const { error } = await (context as unknown as Contexto).supabase
      .from("estoque_itens")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lista simples das categorias ativas (usada na tela de atendimento). */
export const listarCategoriasAtivas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context as unknown as Contexto).supabase
      .from("estoque_categorias")
      .select("id, nome, preco, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: String(c["id"] ?? ""),
      nome: String(c["nome"] ?? ""),
      preco: Number(c["preco"] ?? 0),
    }));
  });
