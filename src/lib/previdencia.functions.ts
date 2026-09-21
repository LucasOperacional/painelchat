import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://apigateway.conectagov.estaleiro.serpro.gov.br/api-beneficios-previdenciarios/v3";
const TOKEN_URL = "https://apigateway.conectagov.estaleiro.serpro.gov.br/oauth2/jwt-token";

export type PrevidenciaTipo = "beneficios" | "pertence-especie" | "pertence-especie-87";

const consultaInput = z.object({
  tipo: z.enum(["beneficios", "pertence-especie", "pertence-especie-87"]),
  cpf: z.string().min(1),
  especie: z.string().optional(),
  situacao: z.string().optional(),
});

export type PrevidenciaResultado = {
  tipo: PrevidenciaTipo;
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

const digits = (value: string | undefined) => (value ?? "").replace(/\D/g, "");

export const statusPrevidencia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    configurado: Boolean(
      process.env["CONECTAGOV_CLIENT_ID"] && process.env["CONECTAGOV_CLIENT_SECRET"],
    ),
  }));

export const consultarPrevidencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => consultaInput.parse(data))
  .handler(async ({ data }): Promise<PrevidenciaResultado> => {
    const vazio = { tipo: data.tipo, total: 0, itens: [] };
    const clientId = process.env["CONECTAGOV_CLIENT_ID"];
    const clientSecret = process.env["CONECTAGOV_CLIENT_SECRET"];
    if (!clientId || !clientSecret) {
      return {
        ...vazio,
        erro: "As credenciais do Conecta gov.br (Benefícios Previdenciários) ainda não foram cadastradas.",
      };
    }

    const cpf = digits(data.cpf);
    if (cpf.length !== 11) return { ...vazio, erro: "Informe um CPF válido com 11 dígitos." };
    const especie = digits(data.especie);
    if (data.tipo === "pertence-especie" && !especie) {
      return { ...vazio, erro: "Informe o código da espécie do benefício." };
    }

    let token: string;
    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenBody = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
      if (!tokenRes.ok || !tokenBody.access_token) {
        return {
          ...vazio,
          erro: "As credenciais do Conecta gov.br foram recusadas na autenticação.",
        };
      }
      token = tokenBody.access_token;
    } catch {
      return { ...vazio, erro: "Não foi possível conectar ao Conecta gov.br." };
    }

    const path =
      data.tipo === "beneficios"
        ? "/beneficios"
        : data.tipo === "pertence-especie"
          ? "/beneficios/pertence-especie"
          : "/beneficios/pertence-especie-87";

    const query = new URLSearchParams({ cpf });
    if (especie && data.tipo !== "pertence-especie-87") query.set("especie", especie);
    const situacao = digits(data.situacao);
    if (situacao && data.tipo !== "pertence-especie-87") query.set("situacao", situacao);

    const res = await fetch(`${BASE}${path}?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-cpf-usuario": cpf,
        accept: "application/json",
      },
    });

    if (res.status === 404) return { ...vazio, erro: "Nenhum benefício encontrado para este CPF." };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ...vazio,
        erro: `O serviço de Benefícios Previdenciários respondeu com erro ${res.status}. ${body.slice(0, 180)}`.trim(),
      };
    }

    const payload = (await res.json().catch(() => null)) as unknown;
    const lista = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { beneficios?: unknown[] } | null)?.beneficios)
        ? ((payload as { beneficios: unknown[] }).beneficios)
        : payload
          ? [payload]
          : [];

    const itens = lista.map((item) => flatten(item as Record<string, unknown>));
    return { tipo: data.tipo, total: itens.length, itens };
  });
