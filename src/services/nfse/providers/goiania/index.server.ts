// Provedor NFS-e — Goiânia/GO (SGISS / ISSNet, padrão ABRASF 2.04).
// Uso exclusivo no servidor: toda a comunicação SOAP acontece aqui.
import type {
  NfseEmitirInput,
  NfseProvider,
  NfseProviderConfig,
  NfseRetorno,
} from "@/services/nfse/types";
import { sugestaoCorrecao } from "@/services/nfse/types";
import { assinarXml } from "./sign.server";

const NS = "http://www.abrasf.org.br/nfse.xsd";
const SOAP_NS = "http://nfse.abrasf.org.br";

const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const num = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(2);
const soDigitos = (v: string) => (v ?? "").replace(/\D/g, "");

function tag(nome: string, valor: string | number | undefined | null) {
  if (valor === undefined || valor === null || valor === "") return "";
  return `<${nome}>${esc(String(valor))}</${nome}>`;
}

function docTag(doc: string) {
  const d = soDigitos(doc);
  return d.length > 11 ? `<CpfCnpj><Cnpj>${d}</Cnpj></CpfCnpj>` : `<CpfCnpj><Cpf>${d}</Cpf></CpfCnpj>`;
}

/** Monta a DeclaracaoPrestacaoServico do ABRASF 2.04. */
export function montarXmlRps(input: NfseEmitirInput): { xml: string; id: string } {
  const { prestador, tomador, servico } = input;
  const id = `rps${input.rpsNumero}${input.rpsSerie}`;
  const hoje = new Date().toISOString().slice(0, 19);

  const xml =
    `<GerarNfseEnvio xmlns="${NS}">` +
    `<Rps>` +
    `<InfDeclaracaoPrestacaoServico Id="${id}">` +
    `<Rps><IdentificacaoRps>` +
    tag("Numero", input.rpsNumero) +
    tag("Serie", input.rpsSerie) +
    `<Tipo>1</Tipo></IdentificacaoRps>` +
    tag("DataEmissao", hoje) +
    `<Status>1</Status></Rps>` +
    tag("Competencia", servico.competencia) +
    `<Servico>` +
    `<Valores>` +
    tag("ValorServicos", num(servico.valorServicos)) +
    tag("ValorDeducoes", num(servico.deducoes)) +
    tag("ValorPis", num(servico.pis)) +
    tag("ValorCofins", num(servico.cofins)) +
    tag("ValorInss", num(servico.inss)) +
    tag("ValorIr", num(servico.ir)) +
    tag("ValorCsll", num(servico.csll)) +
    tag("DescontoIncondicionado", num(servico.descontoIncondicionado)) +
    tag("Aliquota", (servico.aliquota / 100).toFixed(4)) +
    `</Valores>` +
    `<IssRetido>${servico.issRetido ? 1 : 2}</IssRetido>` +
    tag("ItemListaServico", servico.itemListaServico) +
    tag("CodigoCnae", soDigitos(servico.cnae)) +
    tag("CodigoTributacaoMunicipio", servico.codigoTributacaoMunicipio) +
    tag("Discriminacao", servico.discriminacao) +
    tag("CodigoMunicipio", soDigitos(servico.codigoMunicipioPrestacao)) +
    `<ExigibilidadeISS>1</ExigibilidadeISS>` +
    `</Servico>` +
    `<Prestador><CpfCnpj><Cnpj>${soDigitos(prestador.cnpj)}</Cnpj></CpfCnpj>` +
    tag("InscricaoMunicipal", prestador.inscricaoMunicipal) +
    `</Prestador>` +
    `<Tomador><IdentificacaoTomador>${docTag(tomador.cpfCnpj)}</IdentificacaoTomador>` +
    tag("RazaoSocial", tomador.nome) +
    `<Endereco>` +
    tag("Endereco", tomador.endereco) +
    tag("Numero", tomador.numero) +
    tag("Complemento", tomador.complemento) +
    tag("Bairro", tomador.bairro) +
    tag("CodigoMunicipio", soDigitos(tomador.codigoMunicipio)) +
    tag("Uf", tomador.uf) +
    tag("Cep", soDigitos(tomador.cep)) +
    `</Endereco>` +
    `<Contato>${tag("Telefone", soDigitos(tomador.telefone))}${tag("Email", tomador.email)}</Contato>` +
    `</Tomador>` +
    `<OptanteSimplesNacional>${prestador.optanteSimples ? 1 : 2}</OptanteSimplesNacional>` +
    `<IncentivoFiscal>${prestador.incentivadorCultural ? 1 : 2}</IncentivoFiscal>` +
    `</InfDeclaracaoPrestacaoServico>` +
    `</Rps>` +
    `</GerarNfseEnvio>`;

  return { xml, id };
}

function envelope(operacao: string, xml: string) {
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${operacao} xmlns="${SOAP_NS}">` +
    `<nfseCabecMsg><![CDATA[<cabecalho xmlns="${NS}" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>]]></nfseCabecMsg>` +
    `<nfseDadosMsg><![CDATA[${xml}]]></nfseDadosMsg>` +
    `</${operacao}></soap:Body></soap:Envelope>`
  );
}

function pegar(xml: string, tagName: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tagName}>`));
  return m ? m[1]!.trim() : null;
}

function interpretar(xmlEnvio: string, resposta: string, statusHttp: number): NfseRetorno {
  const codigo = pegar(resposta, "Codigo");
  const mensagem = pegar(resposta, "Mensagem");
  const numeroNfse = pegar(resposta, "Numero");
  const codigoVerificacao = pegar(resposta, "CodigoVerificacao");
  const url = pegar(resposta, "UrlNfse") ?? pegar(resposta, "Url");
  const dataEmissao = pegar(resposta, "DataEmissao");
  const houveErro = !!mensagem && !numeroNfse;

  return {
    ok: statusHttp < 400 && !houveErro,
    numeroNfse,
    codigoVerificacao,
    urlNfse: url,
    dataEmissao,
    erroCodigo: houveErro ? codigo : null,
    erroMensagem: houveErro
      ? mensagem
      : statusHttp >= 400
        ? `O WebService da prefeitura respondeu com erro ${statusHttp}.`
        : null,
    correcao: houveErro ? sugestaoCorrecao(codigo, mensagem) : null,
    xmlEnvio,
    xmlResposta: resposta.slice(0, 200_000),
    statusHttp,
  };
}

async function chamar(
  operacao: string,
  xmlConteudo: string,
  cfg: NfseProviderConfig,
  assinarId?: string,
): Promise<NfseRetorno> {
  let xml = xmlConteudo;
  if (assinarId) {
    if (!cfg.certPfxBase64 || !cfg.certPassword) {
      return {
        ok: false,
        numeroNfse: null,
        codigoVerificacao: null,
        urlNfse: null,
        dataEmissao: null,
        erroCodigo: "E173",
        erroMensagem: "Lote/RPS não assinado: falta o certificado digital A1.",
        correcao: "Cadastre o certificado PFX e a senha nas configurações de NFS-e.",
        xmlEnvio: xml,
        xmlResposta: "",
        statusHttp: 0,
      };
    }
    xml = assinarXml(xml, assinarId, cfg.certPfxBase64, cfg.certPassword);
  }

  const corpo = envelope(operacao, xml);
  let status = 0;
  let texto = "";
  try {
    const res = await fetch(cfg.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `${SOAP_NS}/${operacao}`,
      },
      body: corpo,
      signal: AbortSignal.timeout(60_000),
    });
    status = res.status;
    texto = await res.text();
  } catch (e) {
    return {
      ok: false,
      numeroNfse: null,
      codigoVerificacao: null,
      urlNfse: null,
      dataEmissao: null,
      erroCodigo: "COMUNICACAO",
      erroMensagem: `Falha de comunicação com o WebService da prefeitura: ${(e as Error).message}`,
      correcao: "Tente novamente em alguns minutos; o serviço da prefeitura pode estar fora do ar.",
      xmlEnvio: xml,
      xmlResposta: "",
      statusHttp: 0,
    };
  }

  const interno = texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return interpretar(xml, interno, status);
}

export const goianiaProvider: NfseProvider = {
  nome: "Goiânia/GO — SGISS ABRASF 2.04",

  async emitir(input, cfg) {
    const { xml, id } = montarXmlRps(input);
    return chamar("GerarNfse", xml, cfg, id);
  },

  async consultar(numeroNfse, cfg) {
    const xml =
      `<ConsultarNfseFaixaEnvio xmlns="${NS}"><Prestador>` +
      `<CpfCnpj><Cnpj>${soDigitos(cfg.cnpj)}</Cnpj></CpfCnpj>` +
      tag("InscricaoMunicipal", cfg.inscricaoMunicipal) +
      `</Prestador><Faixa><NumeroNfseInicial>${esc(numeroNfse)}</NumeroNfseInicial>` +
      `<NumeroNfseFinal>${esc(numeroNfse)}</NumeroNfseFinal></Faixa>` +
      `<Pagina>1</Pagina></ConsultarNfseFaixaEnvio>`;
    return chamar("ConsultarNfseFaixa", xml, cfg);
  },

  async consultarRps(rps, cfg) {
    const xml =
      `<ConsultarNfseRpsEnvio xmlns="${NS}"><IdentificacaoRps>` +
      `<Numero>${rps.numero}</Numero><Serie>${esc(rps.serie)}</Serie><Tipo>1</Tipo>` +
      `</IdentificacaoRps><Prestador>` +
      `<CpfCnpj><Cnpj>${soDigitos(cfg.cnpj)}</Cnpj></CpfCnpj>` +
      tag("InscricaoMunicipal", cfg.inscricaoMunicipal) +
      `</Prestador></ConsultarNfseRpsEnvio>`;
    return chamar("ConsultarNfsePorRps", xml, cfg);
  },

  async consultarUrl(numeroNfse, cfg) {
    const xml =
      `<ConsultarUrlNfseEnvio xmlns="${NS}"><Prestador>` +
      `<CpfCnpj><Cnpj>${soDigitos(cfg.cnpj)}</Cnpj></CpfCnpj>` +
      tag("InscricaoMunicipal", cfg.inscricaoMunicipal) +
      `</Prestador><NumeroNfse>${esc(numeroNfse)}</NumeroNfse></ConsultarUrlNfseEnvio>`;
    return chamar("ConsultarUrlNfse", xml, cfg);
  },

  async cancelar(input, cfg) {
    const id = `canc${soDigitos(input.numeroNfse)}`;
    const xml =
      `<CancelarNfseEnvio xmlns="${NS}"><Pedido><InfPedidoCancelamento Id="${id}">` +
      `<IdentificacaoNfse><Numero>${esc(input.numeroNfse)}</Numero>` +
      `<CpfCnpj><Cnpj>${soDigitos(cfg.cnpj)}</Cnpj></CpfCnpj>` +
      tag("InscricaoMunicipal", cfg.inscricaoMunicipal) +
      `<CodigoMunicipio>${soDigitos(cfg.codigoMunicipio)}</CodigoMunicipio></IdentificacaoNfse>` +
      `<CodigoCancelamento>${esc(input.codigoCancelamento)}</CodigoCancelamento>` +
      tag("MotivoCancelamento", input.motivo) +
      `</InfPedidoCancelamento></Pedido></CancelarNfseEnvio>`;
    return chamar("CancelarNfse", xml, cfg, id);
  },

  async substituir(input, cfg) {
    const nova = montarXmlRps(input.nova);
    const id = `subst${soDigitos(input.numeroNfse)}`;
    const xml =
      `<SubstituirNfseEnvio xmlns="${NS}"><SubstituicaoNfse Id="${id}">` +
      `<Pedido><InfPedidoCancelamento Id="${id}c">` +
      `<IdentificacaoNfse><Numero>${esc(input.numeroNfse)}</Numero>` +
      `<CpfCnpj><Cnpj>${soDigitos(cfg.cnpj)}</Cnpj></CpfCnpj>` +
      tag("InscricaoMunicipal", cfg.inscricaoMunicipal) +
      `<CodigoMunicipio>${soDigitos(cfg.codigoMunicipio)}</CodigoMunicipio></IdentificacaoNfse>` +
      `<CodigoCancelamento>${esc(input.codigoCancelamento)}</CodigoCancelamento>` +
      tag("MotivoCancelamento", input.motivo) +
      `</InfPedidoCancelamento></Pedido>` +
      nova.xml.replace(`<GerarNfseEnvio xmlns="${NS}">`, "").replace("</GerarNfseEnvio>", "") +
      `</SubstituicaoNfse></SubstituirNfseEnvio>`;
    return chamar("SubstituirNfse", xml, cfg, id);
  },
};
