import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

export type ConsultaTipo =
  | "ceis"
  | "cnep"
  | "cepim"
  | "fornecedores"
  | "bolsa-familia"
  | "servidores"
  | "licitacoes"
  | "contratos";

const consultaInput = z.object({
  tipo: z.enum([
    "ceis",
    "cnep",
    "cepim",
    "fornecedores",
    "bolsa-familia",
    "servidores",
    "licitacoes",
    "contratos",
  ]),
  documento: z.string().trim().max(40).optional(),
  nome: z.string().trim().max(120).optional(),
  anoMes: z.string().trim().max(6).optional(),
  dataInicial: z.string().trim().max(10).optional(),
  dataFinal: z.string().trim().max(10).optional(),
  pagina: z.number().int().min(1).max(200).default(1),
});

export type ConsultaResultado = {
  tipo: ConsultaTipo;
  pagina: number;
  total: number;
  itens: Array<Record<string, string>>;
  erro?: string;
};

function flatten(item: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(item ?? {})) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      out[label] = JSON.stringify(value);
    } else if (typeof value === "object") {
      Object.assign(out, flatten(value as Record<string, unknown>, label));
    } else {
      out[label] = String(value);
    }
  }
  return out;
}

function digits(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

type Requisicao = { path: string; query: Record<string, string>; erro?: undefined };
type Invalida = { erro: string; path?: undefined; query?: undefined };

function buildRequest(data: z.infer<typeof consultaInput>): Requisicao | Invalida {
  const doc = digits(data.documento);
  const pagina = String(data.pagina);

  switch (data.tipo) {
    case "ceis":
      if (!doc) return { erro: "Informe o CPF ou CNPJ do sancionado." };
      return { path: "/ceis", query: { codigoSancionado: doc, pagina } };
    case "cnep":
      if (!doc) return { erro: "Informe o CPF ou CNPJ do sancionado." };
      return { path: "/cnep", query: { codigoSancionado: doc, pagina } };
    case "cepim":
      if (!doc) return { erro: "Informe o CNPJ da entidade." };
      return { path: "/cepim", query: { cnpjSancionado: doc, pagina } };
    case "fornecedores": {
      if (!doc && !data.nome) return { erro: "Informe o CNPJ ou o nome do fornecedor." };
      const query: Record<string, string> = { pagina };
      if (doc) query["cnpj"] = doc;
      if (data.nome) query["nome"] = data.nome;
      return { path: "/fornecedores", query };
    }
    case "bolsa-familia": {
      if (!doc) return { erro: "Informe o CPF ou o NIS do beneficiário." };
      if (!data.anoMes || !/^\d{6}$/.test(data.anoMes))
        return { erro: "Informe a competência no formato AAAAMM (ex.: 202601)." };
      return {
        path: doc.length === 11 ? "/novo-bolsa-familia-sacado-por-nis" : "/novo-bolsa-familia-sacado-por-nis",
        query: { codigo: doc, anoMesCompetencia: data.anoMes, pagina },
      };
    }
    case "servidores": {
      if (!doc && !data.nome) return { erro: "Informe o CPF ou o nome do servidor." };
      const query: Record<string, string> = { pagina };
      if (doc) query["cpf"] = doc;
      if (data.nome) query["nome"] = data.nome;
      return { path: "/servidores", query };
    }
    case "licitacoes": {
      if (!data.dataInicial || !data.dataFinal)
        return { erro: "Informe o período da consulta (data inicial e final)." };
      const query: Record<string, string> = {
        dataInicial: data.dataInicial,
        dataFinal: data.dataFinal,
        pagina,
      };
      if (doc) query["codigoOrgao"] = doc;
      return { path: "/licitacoes", query };
    }
    case "contratos": {
      if (!data.dataInicial || !data.dataFinal)
        return { erro: "Informe o período da consulta (data inicial e final)." };
      const query: Record<string, string> = {
        dataInicial: data.dataInicial,
        dataFinal: data.dataFinal,
        pagina,
      };
      if (doc) query["codigoOrgao"] = doc;
      return { path: "/contratos", query };
    }
  }
}

export const statusTransparencia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    configurado: Boolean(process.env["PORTAL_TRANSPARENCIA_API_KEY"]),
  }));

export const consultarTransparencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => consultaInput.parse(data))
  .handler(async ({ data }): Promise<ConsultaResultado> => {
    const vazio = { tipo: data.tipo, pagina: data.pagina, total: 0, itens: [] };
    const apiKey = process.env["PORTAL_TRANSPARENCIA_API_KEY"];
    if (!apiKey) {
      return {
        ...vazio,
        erro: "A chave do Portal da Transparência ainda não foi cadastrada nas configurações do sistema.",
      };
    }

    const pedido = buildRequest(data);
    if (pedido.erro) return { ...vazio, erro: pedido.erro };
    const { path, query } = pedido;
    const url = `${BASE}${path}?${new URLSearchParams(query).toString()}`;

    const res = await fetch(url, {
      headers: { "chave-api-dados": apiKey, accept: "application/json" },
    });

    if (res.status === 401 || res.status === 403) {
      return { ...vazio, erro: "A chave cadastrada foi recusada pelo Portal da Transparência." };
    }
    if (res.status === 429) {
      return { ...vazio, erro: "Limite de consultas do Portal da Transparência atingido. Tente novamente em alguns minutos." };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ...vazio,
        erro: `O Portal da Transparência respondeu com erro ${res.status}. ${body.slice(0, 180)}`.trim(),
      };
    }

    const json = (await res.json().catch(() => [])) as unknown;
    const raw = Array.isArray(json)
      ? (json as Array<Record<string, unknown>>)
      : json && typeof json === "object"
        ? [json as Record<string, unknown>]
        : [];
    const itens = raw.map((item) => flatten(item));

    return { tipo: data.tipo, pagina: data.pagina, total: itens.length, itens };
  });
