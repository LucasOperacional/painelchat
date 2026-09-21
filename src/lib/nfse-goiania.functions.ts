// Emissão de NFS-e Goiânia (SGISS / ABRASF 2.04).
// Todas as chamadas SOAP acontecem no servidor; o navegador só troca JSON.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validarDocumento } from "@/services/nfse/doc";
import type { NfseEmitirInput, NfseProviderConfig, NfseRetorno } from "@/services/nfse/types";

const ENDPOINT_PADRAO = "https://nfse.issnetonline.com.br/abrasf204/goiania/nfse.asmx";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => r.role === "admin")) {
    throw new Error("Apenas administradores podem alterar as configurações da NFS-e.");
  }
}

type ConfigRow = {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_municipal: string;
  regime_tributario: number;
  optante_simples: boolean;
  incentivador_cultural: boolean;
  codigo_municipio: string;
  serie_rps: string;
  proximo_rps: number;
  ambiente: string;
  endpoint_url: string;
  padrao: string;
};

async function carregarConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("nfse_config").select("*").eq("id", true).maybeSingle();
  const row = (data ?? {}) as Partial<ConfigRow>;
  const cnpj = (row.cnpj || process.env["NFSE_CNPJ"] || "").trim();
  const im = (row.inscricao_municipal || process.env["NFSE_INSCRICAO_MUNICIPAL"] || "").trim();
  const endpoint = (row.endpoint_url || process.env["NFSE_GOIANIA_URL"] || ENDPOINT_PADRAO).trim();
  const cfg: NfseProviderConfig = {
    endpointUrl: endpoint,
    codigoMunicipio: row.codigo_municipio || process.env["NFSE_MUNICIPIO"] || "5208707",
    cnpj,
    inscricaoMunicipal: im,
    certPfxBase64: process.env["NFSE_CERT_PFX_BASE64"]?.trim() || null,
    certPassword: process.env["NFSE_CERT_PASSWORD"]?.trim() || null,
  };
  return { row: row as ConfigRow, cfg };
}

async function provider(padrao: string) {
  const { getNfseProvider } = await import("@/services/nfse/registry.server");
  return getNfseProvider(padrao);
}

async function registrarEvento(
  nfseId: string | null,
  tipo: string,
  retorno: NfseRetorno,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("nfse_eventos").insert({
    nfse_id: nfseId,
    tipo,
    request: retorno.xmlEnvio.slice(0, 100_000),
    response: retorno.xmlResposta.slice(0, 100_000),
    status_http: retorno.statusHttp,
  });
}

/** Configuração do prestador + situação da integração. */
export const nfseConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { row, cfg } = await carregarConfig();
    return {
      config: row,
      certificado: !!(cfg.certPfxBase64 && cfg.certPassword),
      cnpj: cfg.cnpj,
      inscricaoMunicipal: cfg.inscricaoMunicipal,
      endpointUrl: cfg.endpointUrl,
    };
  });

const configSchema = z.object({
  razao_social: z.string().max(200).default(""),
  nome_fantasia: z.string().max(200).default(""),
  cnpj: z.string().max(20).default(""),
  inscricao_municipal: z.string().max(30).default(""),
  regime_tributario: z.number().int().min(0).max(6).default(0),
  optante_simples: z.boolean().default(true),
  incentivador_cultural: z.boolean().default(false),
  serie_rps: z.string().max(5).default("1"),
  proximo_rps: z.number().int().min(1).default(1),
  ambiente: z.enum(["producao", "homologacao"]).default("producao"),
  endpoint_url: z.string().url().default(ENDPOINT_PADRAO),
});

export const nfseSalvarConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("nfse_config")
      .upsert({ id: true, ...data, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const nfseTestarConexao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { cfg } = await carregarConfig();
    if (!cfg.cnpj || !cfg.inscricaoMunicipal) {
      return { situacao: "incompleto", detalhe: "Falta informar CNPJ e Inscrição Municipal." };
    }
    if (cfg.certPfxBase64 && cfg.certPassword) {
      try {
        const { inspecionarCertificado } = await import(
          "@/services/nfse/providers/goiania/sign.server"
        );
        const info = inspecionarCertificado(cfg.certPfxBase64, cfg.certPassword);
        if (new Date(info.validoAte).getTime() < Date.now()) {
          return { situacao: "certificado", detalhe: "O certificado digital está vencido." };
        }
      } catch (e) {
        return { situacao: "certificado", detalhe: (e as Error).message };
      }
    } else {
      return {
        situacao: "incompleto",
        detalhe: "Falta enviar o certificado digital A1 (PFX) e a senha.",
      };
    }
    try {
      const res = await fetch(`${cfg.endpointUrl}?wsdl`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        return { situacao: "indisponivel", detalhe: `WebService respondeu ${res.status}.` };
      }
      return { situacao: "conectado", detalhe: "Comunicação com a prefeitura funcionando." };
    } catch (e) {
      return { situacao: "indisponivel", detalhe: (e as Error).message };
    }
  });

const emitirSchema = z.object({
  tomador: z.object({
    cpfCnpj: z.string().min(11),
    nome: z.string().min(2).max(200),
    email: z.string().max(200).default(""),
    telefone: z.string().max(30).default(""),
    cep: z.string().max(12).default(""),
    endereco: z.string().max(200).default(""),
    numero: z.string().max(20).default(""),
    complemento: z.string().max(100).default(""),
    bairro: z.string().max(100).default(""),
    municipio: z.string().max(100).default("Goiânia"),
    codigoMunicipio: z.string().max(10).default("5208707"),
    uf: z.string().max(2).default("GO"),
  }),
  servico: z.object({
    competencia: z.string().min(10).max(10),
    itemListaServico: z.string().min(1).max(10),
    cnae: z.string().max(20).default(""),
    codigoTributacaoMunicipio: z.string().max(30).default(""),
    discriminacao: z.string().min(3).max(2000),
    codigoMunicipioPrestacao: z.string().max(10).default("5208707"),
    valorServicos: z.number().min(0.01),
    descontoIncondicionado: z.number().min(0).default(0),
    deducoes: z.number().min(0).default(0),
    baseCalculo: z.number().min(0).default(0),
    aliquota: z.number().min(0).max(100).default(0),
    issRetido: z.boolean().default(false),
    valorIss: z.number().min(0).default(0),
    pis: z.number().min(0).default(0),
    cofins: z.number().min(0).default(0),
    inss: z.number().min(0).default(0),
    ir: z.number().min(0).default(0),
    csll: z.number().min(0).default(0),
  }),
});

function montarEntrada(
  row: ConfigRow,
  data: z.infer<typeof emitirSchema>,
  rpsNumero: number,
  rpsSerie: string,
  cnpj: string,
  im: string,
): NfseEmitirInput {
  return {
    prestador: {
      razaoSocial: row.razao_social ?? "",
      nomeFantasia: row.nome_fantasia ?? "",
      cnpj,
      inscricaoMunicipal: im,
      regimeTributario: row.regime_tributario ?? 0,
      optanteSimples: row.optante_simples ?? true,
      incentivadorCultural: row.incentivador_cultural ?? false,
      codigoMunicipio: row.codigo_municipio ?? "5208707",
    },
    tomador: data.tomador,
    servico: data.servico,
    rpsNumero,
    rpsSerie,
  };
}

async function salvarRetorno(notaId: string, tipo: string, ret: NfseRetorno, statusOk: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("nfse_notas")
    .update({
      status: ret.ok ? statusOk : "REJEITADA",
      numero_nfse: ret.numeroNfse,
      codigo_verificacao: ret.codigoVerificacao,
      url_nfse: ret.urlNfse,
      xml_envio: ret.xmlEnvio.slice(0, 200_000),
      xml_resposta: ret.xmlResposta,
      erro_codigo: ret.erroCodigo,
      erro_mensagem: ret.erroMensagem,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notaId);
  await registrarEvento(notaId, tipo, ret);
}

/** Emite a NFS-e: reserva o RPS, gera e assina o XML e envia ao WebService. */
export const nfseEmitir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => emitirSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!validarDocumento(data.tomador.cpfCnpj)) {
      throw new Error("O CPF/CNPJ do tomador é inválido.");
    }
    const { row, cfg } = await carregarConfig();
    if (!cfg.cnpj || !cfg.inscricaoMunicipal) {
      throw new Error(
        "Configure o CNPJ e a Inscrição Municipal do prestador em Configurações > NFS-e.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reserva = await supabaseAdmin.rpc("nfse_reservar_rps", { _empresa: undefined as unknown as string });
    if (reserva.error) throw new Error(reserva.error.message);
    const linha = (reserva.data as { numero: number; serie: string }[] | null)?.[0];
    if (!linha) throw new Error("Não foi possível reservar o número do RPS.");

    const inserida = await supabaseAdmin
      .from("nfse_notas")
      .insert({
        user_id: context.userId,
        rps_numero: linha.numero,
        rps_serie: linha.serie,
        tomador_cpf_cnpj: data.tomador.cpfCnpj,
        tomador_nome: data.tomador.nome,
        tomador_email: data.tomador.email,
        competencia: data.servico.competencia,
        codigo_servico: data.servico.itemListaServico,
        cnae: data.servico.cnae,
        descricao: data.servico.discriminacao,
        valor_servico: data.servico.valorServicos,
        base_calculo: data.servico.baseCalculo,
        aliquota: data.servico.aliquota,
        valor_iss: data.servico.valorIss,
        iss_retido: data.servico.issRetido,
        payload: data as never,
        status: "PROCESSANDO",
      })
      .select("id")
      .single();
    if (inserida.error) {
      if (inserida.error.code === "23505") {
        throw new Error("Esse número de RPS já foi utilizado. Consulte o RPS antes de reenviar.");
      }
      throw new Error(inserida.error.message);
    }
    const notaId = (inserida.data as { id: string }).id;

    const prov = await provider(row.padrao ?? "abrasf204");
    const entrada = montarEntrada(row, data, linha.numero, linha.serie, cfg.cnpj, cfg.inscricaoMunicipal);
    const ret = await prov.emitir(entrada, cfg);
    if (ret.ok && ret.numeroNfse && !ret.urlNfse) {
      const url = await prov.consultarUrl(ret.numeroNfse, cfg);
      if (url.urlNfse) ret.urlNfse = url.urlNfse;
    }
    await salvarRetorno(notaId, "emitir", ret, "AUTORIZADA");
    return { ...ret, id: notaId, rpsNumero: linha.numero, rpsSerie: linha.serie };
  });

async function carregarNota(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("nfse_notas").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as Record<string, any>;
}

const idSchema = z.object({ id: z.string().uuid() });

/** Reenvia a mesma nota rejeitada — sempre com o mesmo número de RPS. */
export const nfseReenviar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const nota = await carregarNota(data.id);
    if (nota["status"] === "AUTORIZADA") throw new Error("Essa nota já está autorizada.");
    const { row, cfg } = await carregarConfig();
    const prov = await provider(row.padrao ?? "abrasf204");
    const payload = emitirSchema.parse(nota["payload"]);
    const entrada = montarEntrada(
      row,
      payload,
      nota["rps_numero"],
      nota["rps_serie"],
      cfg.cnpj,
      cfg.inscricaoMunicipal,
    );
    const ret = await prov.emitir(entrada, cfg);
    await salvarRetorno(data.id, "reenviar", ret, "AUTORIZADA");
    return { ...ret, id: data.id };
  });

export const nfseConsultar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const nota = await carregarNota(data.id);
    const { row, cfg } = await carregarConfig();
    const prov = await provider(row.padrao ?? "abrasf204");
    const ret = nota["numero_nfse"]
      ? await prov.consultar(String(nota["numero_nfse"]), cfg)
      : await prov.consultarRps({ numero: nota["rps_numero"], serie: nota["rps_serie"] }, cfg);
    await registrarEvento(data.id, "consultar", ret);
    return ret;
  });

export const nfseConsultarRps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ numero: z.number().int().min(1), serie: z.string().max(5).default("1") }).parse(d),
  )
  .handler(async ({ data }) => {
    const { row, cfg } = await carregarConfig();
    const prov = await provider(row.padrao ?? "abrasf204");
    const ret = await prov.consultarRps({ numero: data.numero, serie: data.serie }, cfg);
    await registrarEvento(null, "consultar-rps", ret);
    return ret;
  });

/** Busca no provedor a URL oficial da NFS-e (visualização/PDF autorizado). */
export const nfseConsultarUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const nota = await carregarNota(data.id);
    if (!nota["numero_nfse"]) throw new Error("A nota ainda não tem número de NFS-e.");
    const { row, cfg } = await carregarConfig();
    const prov = await provider(row.padrao ?? "abrasf204");
    const ret = await prov.consultarUrl(String(nota["numero_nfse"]), cfg);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (ret.urlNfse) {
      await supabaseAdmin.from("nfse_notas").update({ url_nfse: ret.urlNfse }).eq("id", data.id);
    }
    await registrarEvento(data.id, "consultar-url", ret);
    return ret;
  });

export const nfseCancelar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        codigoCancelamento: z.string().max(5).default("1"),
        motivo: z.string().max(255).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const nota = await carregarNota(data.id);
    if (!nota["numero_nfse"]) throw new Error("Só é possível cancelar notas autorizadas.");
    const { row, cfg } = await carregarConfig();
    const prov = await provider(row.padrao ?? "abrasf204");
    const ret = await prov.cancelar(
      {
        numeroNfse: String(nota["numero_nfse"]),
        codigoCancelamento: data.codigoCancelamento,
        motivo: data.motivo,
      },
      cfg,
    );
    if (ret.ok) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("nfse_notas")
        .update({ status: "CANCELADA", updated_at: new Date().toISOString() })
        .eq("id", data.id);
    }
    await registrarEvento(data.id, "cancelar", ret);
    return ret;
  });

export const nfseSubstituir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        codigoCancelamento: z.string().max(5).default("1"),
        motivo: z.string().max(255).default(""),
        nova: emitirSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const nota = await carregarNota(data.id);
    if (!nota["numero_nfse"]) throw new Error("Só é possível substituir notas autorizadas.");
    const { row, cfg } = await carregarConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reserva = await supabaseAdmin.rpc("nfse_reservar_rps", { _empresa: undefined as unknown as string });
    if (reserva.error) throw new Error(reserva.error.message);
    const linha = (reserva.data as { numero: number; serie: string }[] | null)?.[0];
    if (!linha) throw new Error("Não foi possível reservar o número do RPS.");

    const prov = await provider(row.padrao ?? "abrasf204");
    const entrada = montarEntrada(
      row,
      data.nova,
      linha.numero,
      linha.serie,
      cfg.cnpj,
      cfg.inscricaoMunicipal,
    );
    const ret = await prov.substituir(
      {
        numeroNfse: String(nota["numero_nfse"]),
        codigoCancelamento: data.codigoCancelamento,
        motivo: data.motivo,
        nova: entrada,
      },
      cfg,
    );

    if (ret.ok) {
      await supabaseAdmin
        .from("nfse_notas")
        .update({ status: "SUBSTITUIDA", updated_at: new Date().toISOString() })
        .eq("id", data.id);
      await supabaseAdmin.from("nfse_notas").insert({
        user_id: context.userId,
        rps_numero: linha.numero,
        rps_serie: linha.serie,
        numero_nfse: ret.numeroNfse,
        codigo_verificacao: ret.codigoVerificacao,
        url_nfse: ret.urlNfse,
        tomador_cpf_cnpj: data.nova.tomador.cpfCnpj,
        tomador_nome: data.nova.tomador.nome,
        tomador_email: data.nova.tomador.email,
        competencia: data.nova.servico.competencia,
        codigo_servico: data.nova.servico.itemListaServico,
        cnae: data.nova.servico.cnae,
        descricao: data.nova.servico.discriminacao,
        valor_servico: data.nova.servico.valorServicos,
        base_calculo: data.nova.servico.baseCalculo,
        aliquota: data.nova.servico.aliquota,
        valor_iss: data.nova.servico.valorIss,
        iss_retido: data.nova.servico.issRetido,
        payload: data.nova as never,
        status: "AUTORIZADA",
        xml_envio: ret.xmlEnvio.slice(0, 200_000),
        xml_resposta: ret.xmlResposta,
      });
    }
    await registrarEvento(data.id, "substituir", ret);
    return ret;
  });

export type NotaLinha = {
  id: string;
  numero_nfse: string | null;
  codigo_verificacao: string | null;
  rps_numero: number;
  rps_serie: string;
  tomador_nome: string;
  tomador_cpf_cnpj: string;
  tomador_email: string;
  valor_servico: number;
  status: string;
  url_nfse: string | null;
  erro_codigo: string | null;
  erro_mensagem: string | null;
  created_at: string;
};

export const nfseListar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        de: z.string().nullable().default(null),
        ate: z.string().nullable().default(null),
        busca: z.string().max(60).default(""),
        status: z.string().max(20).default(""),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("nfse_notas")
      .select(
        "id, numero_nfse, codigo_verificacao, rps_numero, rps_serie, tomador_nome, tomador_cpf_cnpj, tomador_email, valor_servico, status, url_nfse, erro_codigo, erro_mensagem, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.de) q = q.gte("created_at", data.de);
    if (data.ate) q = q.lte("created_at", data.ate);
    if (data.status) q = q.eq("status", data.status);
    if (data.busca.trim()) {
      const b = data.busca.trim();
      q = q.or(
        `tomador_nome.ilike.%${b}%,tomador_cpf_cnpj.ilike.%${b}%,numero_nfse.ilike.%${b}%,rps_numero.eq.${/^\d+$/.test(b) ? b : 0}`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as NotaLinha[];
  });

/** XML autorizado da nota (para download). */
export const nfseXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data }) => {
    const nota = await carregarNota(data.id);
    return {
      envio: (nota["xml_envio"] as string) ?? "",
      resposta: (nota["xml_resposta"] as string) ?? "",
    };
  });
