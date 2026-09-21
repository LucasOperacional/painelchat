import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// API Benefícios Previdenciários (gov.br Conecta / SERPRO) — v3
const DEFAULT_BASE =
  "https://apigateway.conectagov.estaleiro.serpro.gov.br/api-beneficios-previdenciarios/v3";
const DEFAULT_TOKEN_URL =
  "https://apigateway.conectagov.estaleiro.serpro.gov.br/oauth2/jwt-token";

export type Beneficio = {
  numeroBeneficio: number | null;
  cpf: string | null;
  nomeTitular: string | null;
  nomeMaeTitular: string | null;
  genero: string | null;
  dataNascimento: string | null;
  dataInicioBeneficio: string | null;
  dataCessacaoBeneficio: string | null;
  codigoSituacaoBeneficio: number | null;
  descricaoSituacaoBeneficio: string | null;
  codigoEspecieBeneficio: number | null;
  descricaoEspecieBeneficio: string | null;
};

function credenciais() {
  const clientId = process.env["CONECTA_CLIENT_ID"];
  const clientSecret = process.env["CONECTA_CLIENT_SECRET"];
  const base = process.env["CONECTA_BENEFICIOS_URL"] || DEFAULT_BASE;
  const tokenUrl = process.env["CONECTA_TOKEN_URL"] || DEFAULT_TOKEN_URL;
  return { clientId, clientSecret, base, tokenUrl };
}

async function obterToken(): Promise<string> {
  const { clientId, clientSecret, tokenUrl } = credenciais();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Credenciais do gov.br Conecta não configuradas. Cadastre o client id e o client secret nas configurações.",
    );
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(
      `Não foi possível autenticar no gov.br Conecta (HTTP ${res.status}). Confira as credenciais.`,
    );
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Resposta de autenticação inválida do gov.br Conecta.");
  return json.access_token;
}

async function chamar(path: string, params: Record<string, string>) {
  const { base } = credenciais();
  const token = await obterToken();
  const url = new URL(`${base.replace(/\/$/, "")}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    let detalhe = "";
    try {
      const erro = (await res.json()) as { erro?: string; mensagem?: string };
      detalhe = erro?.erro || erro?.mensagem || "";
    } catch {
      /* resposta sem corpo json */
    }
    throw new Error(
      detalhe || `A consulta falhou (HTTP ${res.status}). Tente novamente em instantes.`,
    );
  }
  return (await res.json()) as unknown;
}

const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 11, "Informe um CPF com 11 dígitos.");

export const statusBeneficios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { clientId, clientSecret } = credenciais();
    return { configurado: Boolean(clientId && clientSecret) };
  });

export const consultarBeneficios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        cpf: cpfSchema,
        especie: z.string().optional(),
        situacao: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ beneficios: Beneficio[] }> => {
    const params: Record<string, string> = { cpf: data.cpf };
    if (data.especie) params["especie"] = data.especie.replace(/\D/g, "");
    if (data.situacao) params["situacao"] = data.situacao.replace(/\D/g, "");

    const json = (await chamar("/beneficios", params)) as
      | { beneficios?: unknown[] }
      | null;

    const lista = Array.isArray(json?.beneficios) ? json!.beneficios : [];
    return {
      beneficios: lista.map((raw) => {
        const b = raw as Record<string, unknown>;
        const num = (k: string) => (typeof b[k] === "number" ? (b[k] as number) : null);
        const str = (k: string) => (b[k] == null ? null : String(b[k]));
        return {
          numeroBeneficio: num("numeroBeneficio"),
          cpf: str("cpf"),
          nomeTitular: str("nomeTitular"),
          nomeMaeTitular: str("nomeMaeTitular"),
          genero: str("genero"),
          dataNascimento: str("dataNascimento"),
          dataInicioBeneficio: str("dataInicioBeneficio"),
          dataCessacaoBeneficio: str("dataCessacaoBeneficio"),
          codigoSituacaoBeneficio: num("codigoSituacaoBeneficio"),
          descricaoSituacaoBeneficio: str("descricaoSituacaoBeneficio"),
          codigoEspecieBeneficio: num("codigoEspecieBeneficio"),
          descricaoEspecieBeneficio: str("descricaoEspecieBeneficio"),
        };
      }),
    };
  });

export const pertenceEspecie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        cpf: cpfSchema,
        especie: z.string().min(1, "Informe o código da espécie."),
        situacao: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ pertence: boolean }> => {
    const params: Record<string, string> = {
      cpf: data.cpf,
      especie: data.especie.replace(/\D/g, ""),
    };
    if (data.situacao) params["situacao"] = data.situacao.replace(/\D/g, "");
    const json = (await chamar("/beneficios/pertence-especie", params)) as
      | { pertence?: boolean }
      | null;
    return { pertence: Boolean(json?.pertence) };
  });

export const pertenceEspecie87 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ cpf: cpfSchema }).parse(data))
  .handler(async ({ data }): Promise<{ pertence: boolean }> => {
    const json = (await chamar("/beneficios/pertence-especie-87", { cpf: data.cpf })) as
      | { pertence?: boolean }
      | null;
    return { pertence: Boolean(json?.pertence) };
  });
