import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { acharConsulta } from "@/lib/consultas-catalogo";
import { validarEntradaConsulta } from "@/lib/consultas-input";

/**
 * Integração com o portal de consultas Recupera Big Tech.
 * Documentação: https://www.recuperabigtechmundial.com/docs
 */
const BASE_PADRAO = "https://www.recuperabigtechmundial.com";

type Contexto = { supabase: { from: (t: string) => any }; userId: string };

async function requireAdmin(context: Contexto) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem alterar esta configuração.");
  }
}

async function carregarCredenciais(): Promise<{ apiKey: string | null; baseUrl: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("consultas_secrets")
      .select("api_key, base_url")
      .eq("provider", "recupera")
      .maybeSingle();
    const linha = data as { api_key?: string; base_url?: string } | null;
    const chave = linha?.api_key?.trim();
    const base = linha?.base_url?.trim();
    if (chave) return { apiKey: chave, baseUrl: base || BASE_PADRAO };
  } catch {
    // sem acesso ao armazenamento protegido — tenta o ambiente
  }
  const doAmbiente = process.env["RECUPERA_API_KEY"]?.trim() || null;
  return { apiKey: doAmbiente, baseUrl: process.env["RECUPERA_BASE_URL"]?.trim() || BASE_PADRAO };
}

/** Diz se a chave já está cadastrada — nunca devolve o valor completo. */
export const statusConsultas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { apiKey, baseUrl } = await carregarCredenciais();
    return {
      configurado: Boolean(apiKey),
      preview: apiKey ? `${apiKey.slice(0, 8)}…` : null,
      baseUrl,
    };
  });

/** Salva a chave da API de consultas. */
export const salvarChaveConsultas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        apiKey: z.string().trim().min(10, "Cole a chave completa da API."),
        baseUrl: z.string().trim().default(BASE_PADRAO),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const base = (data.baseUrl || BASE_PADRAO).replace(/\/$/, "");
    if (!/^https:\/\/[^\s]+\.[^\s]+$/.test(base)) {
      throw new Error("Informe um endereço válido, começando com https://");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("consultas_secrets").upsert(
      {
        provider: "recupera",
        api_key: data.apiKey,
        base_url: base,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a chave salva. */
export const removerChaveConsultas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("consultas_secrets")
      .delete()
      .eq("provider", "recupera");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia o formato público e também os aliases aceitos pelos módulos antigos do fornecedor. */
function corpoDaConsulta(slug: string, tipo: string, entrada: string): Record<string, unknown> {
  const bruto = entrada.trim();
  const base: Record<string, unknown> = { produto: slug, input: bruto };
  const aliases: Record<string, string[]> = {
    CPF: ["cpf", "documento"],
    CNPJ: ["cnpj", "documento"],
    "CPF ou CNPJ": [bruto.length === 11 ? "cpf" : "cnpj", "documento"],
    "Placa do veículo": ["placa"],
    Chassi: ["chassi"],
    Renavam: ["renavam"],
    "Número do motor": ["motor", "numero_motor"],
    "Nome completo": ["nome"],
    "Nome da empresa": ["nome", "nome_empresa"],
    Telefone: ["telefone"],
    "E-mail": ["email"],
    CEP: ["cep"],
    "Data de nascimento": ["data_nascimento", "nascimento"],
    "Número do RG": ["rg"],
    "Número do processo": ["processo", "numero_processo"],
    "Termo / Tribunal": ["termo", "consulta"],
    "ID do laudo": ["id", "laudo_id"],
  };
  for (const nome of aliases[tipo] ?? []) base[nome] = bruto;

  if (tipo === "Número da OAB") {
    const partes = bruto.match(/^([A-Z]{2})(\d{3,8})$|^(\d{3,8})([A-Z]{2})$/);
    const uf = partes?.[1] ?? partes?.[4];
    const numero = partes?.[2] ?? partes?.[3] ?? bruto;
    base["oab"] = bruto;
    base["numero"] = numero;
    if (uf) {
      base["uf"] = uf;
      base["seccional"] = uf;
    }
  }
  return base;
}

function mensagemDeErro(status: number, corpo: string) {
  if (status === 401) return "Chave de consultas ausente, inválida ou revogada.";
  if (status === 403) return "Esta chave não tem permissão para essa categoria, ou a conta está bloqueada.";
  if (status === 402) return "Saldo insuficiente na conta de consultas.";
  if (status === 404) return "Consulta não encontrada ou inativa no catálogo.";
  if (status === 429) return "Limite de consultas por hora atingido. Tente novamente em instantes.";
  if (status === 502 || status === 503 || status === 504)
    return "O fornecedor dessa consulta está fora do ar no momento. Nada foi cobrado — tente novamente mais tarde.";
  let detalhe = corpo.slice(0, 300);
  try {
    const j = JSON.parse(corpo) as Record<string, unknown>;
    detalhe = String(j["error"] ?? j["message"] ?? detalhe);
  } catch {
    /* resposta em texto puro */
  }
  if (/obrigat/i.test(detalhe)) {
    return "O fornecedor não informou quais dados adicionais este módulo exige. Nada foi cobrado; o módulo foi sinalizado para revisão.";
  }
  if (/inv[aá]lid/i.test(detalhe)) {
    return "O dado informado não está no formato esperado por esta consulta (confira CPF, CNPJ, placa ou data). Nada foi cobrado.";
  }
  return detalhe || `Falha na consulta (HTTP ${status}).`;
}

/** Executa uma consulta do catálogo e guarda o resultado no histórico. */
export const executarConsulta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        produto: z.string().trim().min(1, "Escolha a consulta."),
        input: z.string().trim().min(1, "Informe o dado a consultar.").max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const produto = acharConsulta(data.produto);
    if (!produto) throw new Error("Consulta não encontrada no catálogo.");
    const entradaValidada = validarEntradaConsulta(produto.entrada, data.input);
    if (entradaValidada.erro) throw new Error(entradaValidada.erro);

    const { apiKey, baseUrl } = await carregarCredenciais();
    if (!apiKey) {
      throw new Error(
        "A chave de consultas ainda não foi cadastrada. Peça ao administrador para salvá-la em Consultas.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const registrar = async (campos: Record<string, unknown>) => {
      await supabaseAdmin.from("consultas_historico").insert({
        user_id: context.userId,
        produto: produto.slug,
        produto_nome: produto.nome,
        categoria: produto.categoria,
        entrada: entradaValidada.valor,
        ...campos,
      });
    };

    const corpoEnvio = JSON.stringify(
      corpoDaConsulta(produto.slug, produto.entrada, entradaValidada.valor),
    );
    const url = `${baseUrl.replace(/\/$/, "")}/api/v1/consulta`;

    // O fornecedor às vezes demora ou devolve 502/504; tentamos até 3 vezes.
    let resposta: Response | null = null;
    let texto = "";
    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
      try {
        resposta = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: corpoEnvio,
          signal: AbortSignal.timeout(60_000),
        });
        texto = await resposta.text();
      } catch {
        resposta = null;
      }
      const instavel =
        !resposta ||
        resposta.status === 502 ||
        resposta.status === 503 ||
        resposta.status === 504 ||
        (resposta.status >= 500 && /fornecedor/i.test(texto));
      if (!instavel) break;
      if (tentativa < 3) await new Promise((r) => setTimeout(r, 1500 * tentativa));
    }

    if (!resposta) {
      const erro =
        "O portal de consultas não respondeu depois de 3 tentativas. Nada foi cobrado — tente de novo em instantes.";
      await registrar({ status: "erro", erro: "Sem resposta do portal de consultas." });
      return { ok: false as const, erro, produto: produto.nome, entrada: entradaValidada.valor };
    }
    if (!resposta.ok) {
      const erro = mensagemDeErro(resposta.status, texto);
      await registrar({ status: "erro", erro });
      return { ok: false as const, erro, produto: produto.nome, entrada: entradaValidada.valor };
    }

    let resultadoJson: Record<string, unknown> = { texto };
    let resultado = texto;
    try {
      const parsed = JSON.parse(texto) as Record<string, unknown>;
      resultadoJson = parsed;
      resultado = JSON.stringify(parsed, null, 2);
    } catch {
      /* resposta em texto puro */
    }

    await registrar({ status: "ok", custo: produto.preco, resultado: resultadoJson });

    return {
      ok: true as const,
      erro: "",
      produto: produto.nome,
      preco: produto.preco,
      entrada: entradaValidada.valor,
      resultado,
    };
  });

/** Últimas consultas feitas (as suas; administradores veem todas). */
export const historicoConsultas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("consultas_historico")
      .select("id, produto_nome, categoria, entrada, status, custo, erro, resultado, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []) as Record<string, unknown>[];
    return linhas.map((l) => ({
      id: String(l["id"] ?? ""),
      produtoNome: String(l["produto_nome"] ?? ""),
      categoria: String(l["categoria"] ?? ""),
      entrada: String(l["entrada"] ?? ""),
      status: String(l["status"] ?? ""),
      custo: Number(l["custo"] ?? 0),
      erro: String(l["erro"] ?? ""),
      resultado: JSON.stringify(l["resultado"] ?? {}, null, 2),
      criadoEm: String(l["created_at"] ?? ""),
    }));
  });
