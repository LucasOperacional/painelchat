// Tipos compartilhados do módulo de NFS-e (seguros para o navegador).
// A interface do provedor permite trocar ABRASF 2.04 pelo padrão nacional
// sem mexer na tela nem no banco.

export type NfseStatus =
  | "RASCUNHO"
  | "PROCESSANDO"
  | "AUTORIZADA"
  | "REJEITADA"
  | "CANCELADA"
  | "SUBSTITUIDA";

export type NfseTomador = {
  cpfCnpj: string;
  nome: string;
  email: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  codigoMunicipio: string;
  uf: string;
};

export type NfseServico = {
  competencia: string;
  itemListaServico: string;
  cnae: string;
  codigoTributacaoMunicipio: string;
  discriminacao: string;
  codigoMunicipioPrestacao: string;
  valorServicos: number;
  descontoIncondicionado: number;
  deducoes: number;
  baseCalculo: number;
  aliquota: number;
  issRetido: boolean;
  valorIss: number;
  pis: number;
  cofins: number;
  inss: number;
  ir: number;
  csll: number;
};

export type NfsePrestador = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoMunicipal: string;
  regimeTributario: number;
  optanteSimples: boolean;
  incentivadorCultural: boolean;
  codigoMunicipio: string;
};

export type NfseEmitirInput = {
  prestador: NfsePrestador;
  tomador: NfseTomador;
  servico: NfseServico;
  rpsNumero: number;
  rpsSerie: string;
};

export type NfseRetorno = {
  ok: boolean;
  numeroNfse: string | null;
  codigoVerificacao: string | null;
  urlNfse: string | null;
  dataEmissao: string | null;
  erroCodigo: string | null;
  erroMensagem: string | null;
  correcao: string | null;
  xmlEnvio: string;
  xmlResposta: string;
  statusHttp: number;
};

export type NfseProviderConfig = {
  endpointUrl: string;
  codigoMunicipio: string;
  cnpj: string;
  inscricaoMunicipal: string;
  certPfxBase64: string | null;
  certPassword: string | null;
};

export interface NfseProvider {
  readonly nome: string;
  emitir(input: NfseEmitirInput, cfg: NfseProviderConfig): Promise<NfseRetorno>;
  consultar(numeroNfse: string, cfg: NfseProviderConfig): Promise<NfseRetorno>;
  consultarRps(
    rps: { numero: number; serie: string },
    cfg: NfseProviderConfig,
  ): Promise<NfseRetorno>;
  consultarUrl(numeroNfse: string, cfg: NfseProviderConfig): Promise<NfseRetorno>;
  cancelar(
    input: { numeroNfse: string; codigoCancelamento: string; motivo: string },
    cfg: NfseProviderConfig,
  ): Promise<NfseRetorno>;
  substituir(
    input: {
      numeroNfse: string;
      codigoCancelamento: string;
      motivo: string;
      nova: NfseEmitirInput;
    },
    cfg: NfseProviderConfig,
  ): Promise<NfseRetorno>;
}

/** Sugestões de correção para os erros mais comuns do SGISS/ISSNet. */
export function sugestaoCorrecao(codigo: string | null, mensagem: string | null): string | null {
  const c = (codigo ?? "").toUpperCase();
  const m = (mensagem ?? "").toLowerCase();
  if (c === "E173" || m.includes("assinat"))
    return "Verifique o certificado digital A1 (arquivo PFX e senha) nas configurações de NFS-e.";
  if (m.includes("inscri")) return "Confira a Inscrição Municipal do prestador nas configurações.";
  if (m.includes("cnpj") || m.includes("cpf"))
    return "Confira o CNPJ do prestador e o CPF/CNPJ do tomador.";
  if (m.includes("rps") && m.includes("existe"))
    return "Esse número de RPS já foi usado. Consulte o RPS antes de emitir de novo.";
  if (m.includes("aliquota") || m.includes("alíquota"))
    return "Revise a alíquota do ISS e o item da lista de serviços (LC 116).";
  if (m.includes("item") || m.includes("servi"))
    return "Revise o código do serviço, o CNAE e o código de tributação municipal.";
  return null;
}
