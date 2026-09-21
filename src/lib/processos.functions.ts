import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Chave pública da API do DataJud/CNJ (documentada publicamente pelo CNJ).
const PUBLIC_DATAJUD_KEY =
  "APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

const buscaInput = z.object({
  tribunal: z.string().min(2),
  processo: z.string().min(5),
});

export type ProcessoMovimento = {
  nome: string;
  dataHora: string | null;
  complemento: string | null;
};

export type ProcessoResultado = {
  numeroProcesso: string;
  classeProcessual: string | null;
  codigoClasseProcessual: number | null;
  sistemaProcessual: string | null;
  formatoProcesso: string | null;
  tribunal: string | null;
  ultimaAtualizacao: string | null;
  grau: string | null;
  dataAjuizamento: string | null;
  orgaoJulgador: string | null;
  codigoMunicipio: number | null;
  assuntos: Array<{ codigo: number; nome: string }>;
  movimentos: ProcessoMovimento[];
};

export const listarTribunais = createServerFn({ method: "GET" }).handler(async () => {
  const mod = await import("busca-processos-judiciais");
  const tribunais = (mod as unknown as { tribunais: Record<string, string> }).tribunais;
  return Object.entries(tribunais)
    .map(([sigla, nome]) => ({ sigla, nome }))
    .sort((a, b) => a.sigla.localeCompare(b.sigla));
});

export const buscarProcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => buscaInput.parse(data))
  .handler(async ({ data }): Promise<ProcessoResultado> => {
    const apiKey = process.env["DATAJUD_API_KEY"] || PUBLIC_DATAJUD_KEY;
    const mod = await import("busca-processos-judiciais");
    const BuscaProcessos = (mod as unknown as { default: any }).default;

    const numero = data.processo.replace(/\D/g, "");
    if (numero.length !== 20) {
      throw new Error(
        `O número informado tem ${numero.length} dígitos. Informe os 20 dígitos do processo (ex.: 0000000-00.0000.0.00.0000).`,
      );
    }

    const busca = new BuscaProcessos(data.tribunal as never, apiKey);
    const resultado = await busca.getCleanResult(numero);

    if (!resultado || !resultado.numeroProcesso) {
      throw new Error("Nenhum processo encontrado para esse número neste tribunal.");
    }

    const toIso = (value: unknown) => {
      if (!value) return null;
      const d = new Date(value as string);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

    return {
      numeroProcesso: String(resultado.numeroProcesso),
      classeProcessual: resultado.classeProcessual ?? null,
      codigoClasseProcessual: resultado.codigoClasseProcessual ?? null,
      sistemaProcessual: resultado.sistemaProcessual ?? null,
      formatoProcesso: resultado.formatoProcesso ?? null,
      tribunal: resultado.tribunal ?? data.tribunal,
      ultimaAtualizacao: toIso(resultado.ultimaAtualizacao),
      grau: resultado.grau ?? null,
      dataAjuizamento: toIso(resultado.dataAjuizamento),
      orgaoJulgador: resultado.orgaoJulgador ?? null,
      codigoMunicipio: resultado.codigoMunicipio ?? null,
      assuntos: Array.isArray(resultado.assuntos) ? resultado.assuntos : [],
      movimentos: Array.isArray(resultado.movimentos)
        ? resultado.movimentos.map((m: any) => ({
            nome: m?.nome ?? "",
            dataHora: toIso(m?.dataHora),
            complemento: m?.complemento ?? null,
          }))
        : [],
    };
  });
