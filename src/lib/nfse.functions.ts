import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

async function requireAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem configurar a emissão de notas fiscais.");
  }
}

export type NotaResumo = {
  id: string;
  numero_nfse: string | null;
  status: string;
  valor: number;
  cliente_nome: string | null;
  cliente_documento: string | null;
  servico_descricao: string | null;
  emitida_em: string | null;
  created_at: string;
  pdf_url: string | null;
};

export type ClienteNfse = {
  id: string;
  nome?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

export type ServicoNfse = {
  id: string;
  descricao?: string | null;
  codigo_tributacao_nacional?: string | null;
  aliquota_iss?: number | null;
};

/** Situação da integração + dados da empresa/quota quando o token está válido. */
export const statusNfse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    type Status = {
      configurado: boolean;
      baseUrl: string | null;
      empresa: Record<string, Plain> | null;
      quota: Record<string, Plain> | null;
      erro: string | null;
    };
    const { loadNfseCredentials, nfseRequest } = await import("@/lib/nfse.server");
    const creds = await loadNfseCredentials();
    if (!creds) {
      const off: Status = {
        configurado: false,
        baseUrl: null,
        empresa: null,
        quota: null,
        erro: null,
      };
      return off;
    }

    try {
      const [empresa, quota] = await Promise.all([
        nfseRequest<Record<string, Plain>>("/empresa"),
        nfseRequest<Record<string, Plain>>("/empresa/quota").catch(() => null),
      ]);
      const ok: Status = { configurado: true, baseUrl: creds.baseUrl, empresa, quota, erro: null };
      return ok;
    } catch (e) {
      const bad: Status = {
        configurado: true,
        baseUrl: creds.baseUrl,
        empresa: null,
        quota: null,
        erro: (e as Error).message,
      };
      return bad;
    }
  });


export const salvarTokenNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ token: z.string().min(10), baseUrl: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { saveNfseCredentials } = await import("@/lib/nfse.server");
    await saveNfseCredentials(data.token, data.baseUrl);
    return { ok: true };
  });

export const removerTokenNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { clearNfseCredentials } = await import("@/lib/nfse.server");
    await clearNfseCredentials();
    return { ok: true };
  });

export const listarNotas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const res = await nfseRequest<{ notas?: NotaResumo[] }>("/notas");
    return { notas: res.notas ?? [] };
  });

export const consultarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const res = await nfseRequest<{ nota: Record<string, Plain>; sync_warning?: string }>(
      `/notas/${data.id}`,
    );
    return { nota: res.nota, warning: res.sync_warning ?? null };
  });

const emitirInput = z.object({
  valor: z.number().positive().max(999999999.99),
  descricao: z.string().max(5000).optional(),
  clienteId: z.string().uuid().optional(),
  clienteNome: z.string().max(500).optional(),
  clienteDocumento: z.string().max(20).optional(),
  clienteEmail: z.string().email().optional(),
  clienteTelefone: z.string().max(40).optional(),
  servicoId: z.string().uuid().optional(),
  codigoTributacao: z.string().max(20).optional(),
  aliquotaIss: z.number().min(0).max(100).optional(),
  emitirSemEndereco: z.boolean().optional(),
});

export const emitirNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => emitirInput.parse(data))
  .handler(async ({ data }) => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const body: Record<string, Plain> = { valor: data.valor };
    if (data.descricao?.trim()) body["descricao"] = data.descricao.trim();
    if (data.clienteId) body["cliente_id"] = data.clienteId;
    if (data.clienteNome?.trim()) body["cliente_nome"] = data.clienteNome.trim();
    if (data.clienteDocumento?.trim())
      body["cliente_documento"] = data.clienteDocumento.replace(/\D/g, "");
    if (data.clienteEmail?.trim()) body["cliente_email"] = data.clienteEmail.trim();
    if (data.clienteTelefone?.trim()) body["cliente_telefone"] = data.clienteTelefone.trim();
    if (data.servicoId) body["servico_id"] = data.servicoId;
    if (data.codigoTributacao?.trim())
      body["codigo_tributacao"] = data.codigoTributacao.replace(/\D/g, "");
    if (typeof data.aliquotaIss === "number") body["aliquota_iss"] = data.aliquotaIss;
    if (typeof data.emitirSemEndereco === "boolean")
      body["emitir_sem_endereco"] = data.emitirSemEndereco;

    return await nfseRequest<{
      success?: boolean;
      nota_id?: string;
      numero_nfse?: string | null;
      status?: string;
      pdf_url?: string | null;
      xml_url?: string | null;
    }>("/notas", { method: "POST", body });
  });

export const cancelarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), motivo: z.string().max(500).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const motivo = data.motivo?.trim();
    return await nfseRequest<{ success?: boolean; message?: string }>(
      `/notas/${data.id}/cancelar`,
      { method: "POST", body: motivo ? { codigo: "1", motivo } : {} },
    );
  });

export const atualizarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    return await nfseRequest<Record<string, Plain>>(`/notas/${data.id}/refresh`, {
      method: "POST",
    });
  });

export const listarClientesNfse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const res = await nfseRequest<{ clientes?: ClienteNfse[] } | ClienteNfse[]>("/clientes");
    const clientes = Array.isArray(res) ? res : res.clientes ?? [];
    return { clientes };
  });

export const criarClienteNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        nome: z.string().min(2),
        documento: z.string().min(11),
        email: z.string().optional(),
        telefone: z.string().optional(),
        cep: z.string().optional(),
        logradouro: z.string().optional(),
        numero: z.string().optional(),
        bairro: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const body: Record<string, Plain> = {
      nome: data.nome.trim(),
      documento: data.documento.replace(/\D/g, ""),
    };
    for (const key of ["email", "telefone", "cep", "logradouro", "numero", "bairro", "cidade", "uf"] as const) {
      const value = data[key]?.trim();
      if (value) body[key] = value;
    }
    return await nfseRequest<Record<string, Plain>>("/clientes", { method: "POST", body });
  });

export const listarServicosNfse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const res = await nfseRequest<{ servicos?: ServicoNfse[] } | ServicoNfse[]>("/servicos");
    const servicos = Array.isArray(res) ? res : res.servicos ?? [];
    return { servicos };
  });

export const criarServicoNfse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        descricao: z.string().min(2),
        codigoTributacaoNacional: z.string().optional(),
        codigoTributacaoMunicipal: z.string().optional(),
        aliquotaIss: z.number().min(0).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { nfseRequest } = await import("@/lib/nfse.server");
    const body: Record<string, Plain> = { descricao: data.descricao.trim() };
    if (data.codigoTributacaoNacional?.trim())
      body["codigo_tributacao_nacional"] = data.codigoTributacaoNacional.replace(/\D/g, "");
    if (data.codigoTributacaoMunicipal?.trim())
      body["codigo_tributacao_municipal"] = data.codigoTributacaoMunicipal.trim();
    if (typeof data.aliquotaIss === "number") body["aliquota_iss"] = data.aliquotaIss;
    return await nfseRequest<Record<string, Plain>>("/servicos", { method: "POST", body });
  });
