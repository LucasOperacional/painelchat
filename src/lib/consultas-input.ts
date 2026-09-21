import { z } from "zod";

export type ConsultaInputConfig = {
  inputMode: "text" | "numeric" | "email";
  maxLength: number;
};

const somenteDigitos = (valor: string) => valor.replace(/\D/g, "");
const espacos = (valor: string) => valor.trim().replace(/\s+/g, " ");

export function configuracaoEntrada(tipo: string): ConsultaInputConfig {
  if (["CPF", "CNPJ", "CPF ou CNPJ", "Telefone", "CEP", "Renavam", "Número do processo", "ID do laudo"].includes(tipo)) {
    return { inputMode: "numeric", maxLength: tipo === "Número do processo" ? 25 : 20 };
  }
  if (tipo === "E-mail") return { inputMode: "email", maxLength: 254 };
  return { inputMode: "text", maxLength: 200 };
}

export function normalizarEntradaConsulta(tipo: string, valor: string): string {
  const limpo = espacos(valor);
  if (["CPF", "CNPJ", "CPF ou CNPJ", "Telefone", "CEP", "Renavam", "Número do processo", "ID do laudo"].includes(tipo)) {
    return somenteDigitos(limpo);
  }
  if (["Placa do veículo", "Chassi", "Número do motor", "Número da OAB", "Número do RG"].includes(tipo)) {
    return limpo.replace(/[\s.-]/g, "").toUpperCase();
  }
  if (tipo === "E-mail") return limpo.toLowerCase();
  if (tipo === "Data de nascimento") {
    const dataBr = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return dataBr ? `${dataBr[3]}-${dataBr[2]}-${dataBr[1]}` : limpo;
  }
  return limpo;
}

function validarData(valor: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const partes = valor.split("-").map(Number);
  const ano = partes[0];
  const mes = partes[1];
  const dia = partes[2];
  if (ano === undefined || mes === undefined || dia === undefined) return false;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function validarEntradaConsulta(tipo: string, valor: string): { valor: string; erro: string | null } {
  const normalizado = normalizarEntradaConsulta(tipo, valor);
  if (!normalizado) return { valor: normalizado, erro: "Informe o dado a consultar." };

  const regras: Record<string, { schema: z.ZodType<string>; erro: string }> = {
    CPF: { schema: z.string().regex(/^\d{11}$/), erro: "Informe um CPF com 11 números." },
    CNPJ: { schema: z.string().regex(/^\d{14}$/), erro: "Informe um CNPJ com 14 números." },
    "CPF ou CNPJ": { schema: z.string().regex(/^(\d{11}|\d{14})$/), erro: "Informe um CPF com 11 números ou CNPJ com 14 números." },
    "Placa do veículo": { schema: z.string().regex(/^[A-Z]{3}(?:\d{4}|\d[A-Z]\d{2})$/), erro: "Informe uma placa antiga ou Mercosul válida, como ABC1234 ou ABC1D23." },
    Chassi: { schema: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/), erro: "Informe os 17 caracteres do chassi." },
    Renavam: { schema: z.string().regex(/^\d{9,11}$/), erro: "Informe o Renavam com 9 a 11 números." },
    Telefone: { schema: z.string().regex(/^\d{10,13}$/), erro: "Informe o telefone com DDD, usando 10 a 13 números." },
    CEP: { schema: z.string().regex(/^\d{8}$/), erro: "Informe um CEP com 8 números." },
    "E-mail": { schema: z.string().email(), erro: "Informe um e-mail válido." },
    "Data de nascimento": { schema: z.string().refine(validarData), erro: "Informe uma data válida no formato DD/MM/AAAA." },
    "Número do processo": { schema: z.string().regex(/^\d{20}$/), erro: "Informe os 20 números do processo judicial." },
    "Nome completo": { schema: z.string().min(3).max(150).regex(/^[\p{L}][\p{L}\s'.-]+$/u), erro: "Informe o nome completo, sem números." },
    "Nome da empresa": { schema: z.string().min(2).max(150), erro: "Informe o nome ou a razão social da empresa." },
    "Número da OAB": { schema: z.string().regex(/^(?:[A-Z]{2}\d{3,8}|\d{3,8}[A-Z]{2})$/), erro: "Informe a OAB com UF e número, como SP123456." },
    "Número do RG": { schema: z.string().min(5).max(20).regex(/^[A-Z0-9]+$/), erro: "Informe somente os números e letras do RG." },
    "ID do laudo": { schema: z.string().regex(/^\d{1,20}$/), erro: "Informe somente o número do laudo." },
  };

  const regra = regras[tipo];
  if (regra && !regra.schema.safeParse(normalizado).success) return { valor: normalizado, erro: regra.erro };
  if (normalizado.length > 200) return { valor: normalizado, erro: "O dado informado é muito longo." };
  return { valor: normalizado, erro: null };
}