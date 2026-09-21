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
    throw new Error("Apenas administradores podem acessar os acessos salvos.");
  }
}

/* ------------------------------ Acessos salvos ----------------------------- */

const acessoInput = z.object({
  id: z.string().uuid().nullable().default(null),
  titulo: z.string().trim().min(1, "Informe o nome do acesso").max(120),
  cliente: z.string().trim().max(120).default(""),
  categoria: z.string().trim().max(60).default("geral"),
  url: z.string().trim().max(300).default(""),
  login: z.string().trim().max(200).default(""),
  senha: z.string().max(300).default(""),
  vencimento: z.string().trim().max(10).nullable().default(null),
  lembreteDias: z.number().int().min(0).max(90).default(5),
  observacoes: z.string().trim().max(1000).default(""),
});

export const listarAcessos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as unknown as Contexto);
    const { data, error } = await context.supabase
      .from("cobranca_acessos")
      .select("*")
      .order("vencimento", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as Record<string, unknown>[];
    return linhas.map((l) => ({
      id: String(l["id"] ?? ""),
      titulo: String(l["titulo"] ?? ""),
      cliente: String(l["cliente"] ?? ""),
      categoria: String(l["categoria"] ?? ""),
      url: String(l["url"] ?? ""),
      login: String(l["login"] ?? ""),
      senha: String(l["senha"] ?? ""),
      vencimento: l["vencimento"] ? String(l["vencimento"]) : "",
      lembreteDias: Number(l["lembrete_dias"] ?? 0),
      observacoes: String(l["observacoes"] ?? ""),
    }));
  });

export const salvarAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => acessoInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const linha = {
      titulo: data.titulo,
      cliente: data.cliente,
      categoria: data.categoria || "geral",
      url: data.url,
      login: data.login,
      senha: data.senha,
      vencimento: data.vencimento || null,
      lembrete_dias: data.lembreteDias,
      observacoes: data.observacoes,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("cobranca_acessos")
        .update(linha)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: criado, error } = await context.supabase
      .from("cobranca_acessos")
      .insert(linha)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: String((criado as { id?: string } | null)?.id ?? "") };
  });

export const removerAcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as Contexto);
    const { error } = await context.supabase
      .from("cobranca_acessos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- Cobranças -------------------------------- */

const cobrancaInput = z.object({
  id: z.string().uuid().nullable().default(null),
  clienteNome: z.string().trim().min(1, "Informe o nome do cliente").max(120),
  telefone: z.string().trim().min(10, "Informe o WhatsApp com DDD").max(20),
  descricao: z.string().trim().max(200).default(""),
  valor: z.number().min(0).default(0),
  vencimento: z.string().trim().min(10).max(10),
  boletoUrl: z.string().trim().max(500).default(""),
  linhaDigitavel: z.string().trim().max(200).default(""),
  mensagem: z.string().trim().max(1500).default(""),
  diasAntes: z.number().int().min(0).max(60).default(3),
  horaEnvio: z.string().trim().max(5).default("09:00"),
  recorrencia: z.enum(["unica", "mensal"]).default("unica"),
  deviceId: z.string().uuid().nullable().default(null),
  ativo: z.boolean().default(true),
});

export const listarCobrancas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cobrancas")
      .select("*")
      .order("vencimento", { ascending: true });
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as Record<string, unknown>[];
    return linhas.map((l) => ({
      id: String(l["id"] ?? ""),
      clienteNome: String(l["cliente_nome"] ?? ""),
      telefone: String(l["telefone"] ?? ""),
      descricao: String(l["descricao"] ?? ""),
      valor: Number(l["valor"] ?? 0),
      vencimento: String(l["vencimento"] ?? ""),
      boletoUrl: String(l["boleto_url"] ?? ""),
      linhaDigitavel: String(l["linha_digitavel"] ?? ""),
      mensagem: String(l["mensagem"] ?? ""),
      diasAntes: Number(l["dias_antes"] ?? 0),
      horaEnvio: String(l["hora_envio"] ?? "09:00"),
      recorrencia: String(l["recorrencia"] ?? "unica"),
      deviceId: l["device_id"] ? String(l["device_id"]) : null,
      ativo: Boolean(l["ativo"]),
      proximoEnvio: l["proximo_envio"] ? String(l["proximo_envio"]) : "",
      ultimoEnvio: l["ultimo_envio"] ? String(l["ultimo_envio"]) : "",
      status: String(l["status"] ?? ""),
    }));
  });

export const salvarCobranca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => cobrancaInput.parse(data))
  .handler(async ({ data, context }) => {
    const { calcularProximoEnvio } = await import("@/lib/cobrancas.server");
    const linha = {
      cliente_nome: data.clienteNome,
      telefone: data.telefone.replace(/\D/g, ""),
      descricao: data.descricao,
      valor: data.valor,
      vencimento: data.vencimento,
      boleto_url: data.boletoUrl,
      linha_digitavel: data.linhaDigitavel,
      mensagem: data.mensagem,
      dias_antes: data.diasAntes,
      hora_envio: data.horaEnvio || "09:00",
      recorrencia: data.recorrencia,
      device_id: data.deviceId,
      ativo: data.ativo,
      proximo_envio: data.ativo
        ? calcularProximoEnvio(data.vencimento, data.diasAntes, data.horaEnvio || "09:00")
        : null,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("cobrancas").update(linha).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: criado, error } = await context.supabase
      .from("cobrancas")
      .insert(linha)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: String((criado as { id?: string } | null)?.id ?? "") };
  });

export const removerCobranca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cobrancas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dispara o envio imediatamente, sem esperar o agendamento. */
export const enviarCobrancaAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { executarCobranca } = await import("@/lib/cobrancas.server");
    const resultado = await executarCobranca(data.id, false);
    if (!resultado.ok) throw new Error(resultado.detalhe);
    return { detalhe: resultado.detalhe };
  });

export const historicoCobrancas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cobranca_envios")
      .select("id, cobranca_id, tipo, ok, detalhe, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as Record<string, unknown>[];
    return linhas.map((l) => ({
      id: String(l["id"] ?? ""),
      cobrancaId: String(l["cobranca_id"] ?? ""),
      tipo: String(l["tipo"] ?? ""),
      ok: Boolean(l["ok"]),
      detalhe: String(l["detalhe"] ?? ""),
      criadoEm: String(l["created_at"] ?? ""),
    }));
  });

/* --------------------- Resumo do contato (painel lateral) -------------------- */

/** Cobranças e acessos ligados a um contato (pelo telefone e pelo nome). */
export const resumoContato = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        telefone: z.string().trim().max(30).default(""),
        nome: z.string().trim().max(120).default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const digitos = data.telefone.replace(/\D/g, "");
    const curto = digitos.length > 8 ? digitos.slice(-8) : digitos;

    let cobrancas: {
      id: string;
      clienteNome: string;
      descricao: string;
      valor: number;
      vencimento: string;
      status: string;
      ativo: boolean;
      proximoEnvio: string;
      boletoUrl: string;
    }[] = [];

    if (curto) {
      const { data: linhas, error } = await context.supabase
        .from("cobrancas")
        .select("id, cliente_nome, descricao, valor, vencimento, status, ativo, proximo_envio, boleto_url, telefone")
        .order("vencimento", { ascending: true });
      if (error) throw new Error(error.message);
      cobrancas = ((linhas ?? []) as Record<string, unknown>[])
        .filter((l) => String(l["telefone"] ?? "").replace(/\D/g, "").endsWith(curto))
        .map((l) => ({
          id: String(l["id"] ?? ""),
          clienteNome: String(l["cliente_nome"] ?? ""),
          descricao: String(l["descricao"] ?? ""),
          valor: Number(l["valor"] ?? 0),
          vencimento: String(l["vencimento"] ?? ""),
          status: String(l["status"] ?? ""),
          ativo: Boolean(l["ativo"]),
          proximoEnvio: l["proximo_envio"] ? String(l["proximo_envio"]) : "",
          boletoUrl: String(l["boleto_url"] ?? ""),
        }));
    }

    let acessos: {
      id: string;
      titulo: string;
      url: string;
      login: string;
      senha: string;
      vencimento: string;
    }[] = [];

    let ehAdmin = true;
    try {
      await requireAdmin(context as unknown as Contexto);
    } catch {
      ehAdmin = false;
    }

    if (ehAdmin) {
      const alvo = data.nome.trim().toLowerCase();
      const { data: linhas, error } = await context.supabase
        .from("cobranca_acessos")
        .select("id, titulo, cliente, url, login, senha, vencimento")
        .order("vencimento", { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      acessos = ((linhas ?? []) as Record<string, unknown>[])
        .filter((l) => {
          const cliente = String(l["cliente"] ?? "").trim().toLowerCase();
          if (!cliente) return false;
          if (alvo && (cliente.includes(alvo) || alvo.includes(cliente))) return true;
          return curto ? cliente.replace(/\D/g, "").endsWith(curto) && /\d/.test(cliente) : false;
        })
        .map((l) => ({
          id: String(l["id"] ?? ""),
          titulo: String(l["titulo"] ?? ""),
          url: String(l["url"] ?? ""),
          login: String(l["login"] ?? ""),
          senha: String(l["senha"] ?? ""),
          vencimento: l["vencimento"] ? String(l["vencimento"]) : "",
        }));
    }

    return { cobrancas, acessos, ehAdmin };
  });
