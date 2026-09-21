export const DAS_MEI_BUCKET = "das-mei";
export const DAS_MEI_MAX_BYTES = 10 * 1024 * 1024;
export const DAS_MEI_FLUXO_KEY = "das_mei_fluxo_ativo";
export const PGMEI_URL =
  "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao";

export type DasStatus = "pendente" | "pago" | "vencido";

export const DAS_STATUS_LABEL: Record<DasStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  vencido: "Vencido",
};

/** Remove qualquer caminho/caractere perigoso e garante um único ".pdf" no fim. */
export function sanitizePdfName(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "guia.pdf").trim();
  const noExt = base.replace(/\.pdf$/i, "");
  const clean = noExt.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\.+/g, ".").slice(0, 80);
  return `${clean || "guia"}.pdf`;
}

/** Recusa nomes com extensão dupla ou executáveis (ex.: guia.pdf.exe). */
export function hasDangerousName(raw: string): boolean {
  const name = raw.split(/[\\/]/).pop() ?? "";
  if (!/\.pdf$/i.test(name)) return true;
  const parts = name.toLowerCase().split(".");
  // guia.pdf -> ["guia","pdf"]; mais de uma extensão é suspeito
  return parts.length > 2;
}

/** Confere a assinatura interna %PDF nos primeiros bytes. */
export function isPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/** Valida extensão, MIME e assinatura do arquivo escolhido pelo usuário. */
export async function validatePdfFile(file: File): Promise<string | null> {
  if (hasDangerousName(file.name)) {
    return "Só é aceito um arquivo PDF simples (sem extensão dupla).";
  }
  if (file.type && file.type !== "application/pdf") {
    return "O arquivo precisa ser um PDF.";
  }
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > DAS_MEI_MAX_BYTES) return "O PDF passa de 10 MB.";
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (!isPdfSignature(head)) return "Este arquivo não é um PDF válido.";
  return null;
}

export function formatBRL(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function competenciaLabel(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value || "—";
  return `${m[2]}/${m[1]}`;
}
