import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIVULGAZAP_URL = "https://divulgazap.spanel.space/api/v1/send-message";

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
    throw new Error("Apenas administradores podem usar o DivulgaZap.");
  }
}

async function carregarChave(): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("divulgazap_secrets")
      .select("api_key")
      .eq("provider", "divulgazap")
      .maybeSingle();
    const saved = (data as { api_key?: string } | null)?.api_key?.trim();
    if (saved) return saved;
  } catch {
    // sem acesso ao armazenamento protegido — usa a chave do ambiente
  }
  return process.env["DIVULGAZAP_API_KEY"]?.trim() || null;
}

/** Informa se a chave da API já está cadastrada (nunca devolve o valor). */
export const statusChaveDivulgaZap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const chave = await carregarChave();
    return { configurado: Boolean(chave), preview: chave ? `${chave.slice(0, 6)}…` : null };
  });

/** Salva/atualiza a chave da API do DivulgaZap em armazenamento protegido. */
export const salvarChaveDivulgaZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z.object({ apiKey: z.string().min(10, "Cole a chave completa da API.") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("divulgazap_secrets")
      .upsert(
        { provider: "divulgazap", api_key: data.apiKey.trim(), updated_at: new Date().toISOString() },
        { onConflict: "provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Remove a chave salva. */
export const removerChaveDivulgaZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("divulgazap_secrets")
      .delete()
      .eq("provider", "divulgazap");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enviarDivulgaZap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        number: z
          .string()
          .transform((v) => v.replace(/\D/g, ""))
          .pipe(z.string().min(10, "Informe o número com DDI e DDD.")),
        message: z.string().min(1, "Digite a mensagem."),
        imageUrl: z.string().url().optional().or(z.literal("")),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const apiKey = await carregarChave();
    if (!apiKey) throw new Error("Chave da API DivulgaZap não configurada.");


    const res = await fetch(DIVULGAZAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        number: data.number,
        message: data.message,
        ...(data.imageUrl ? { image_url: data.imageUrl } : {}),
      }),
    });

    const text = await res.text();
    let payload: Plain = null;
    try {
      payload = text ? (JSON.parse(text) as Plain) : null;
    } catch {
      payload = text;
    }

    if (!res.ok) {
      const msg =
        payload && typeof payload === "object" && "message" in payload
          ? String((payload as { message?: unknown }).message)
          : `Erro ${res.status} ao enviar mensagem.`;
      throw new Error(msg);
    }

    return { ok: true, resposta: payload };
  });

/** Lista contatos cadastrados para facilitar o disparo. */
export const listarContatosDivulgaZap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("contacts")
      .select("id, name, phone")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string | null; phone: string }[];
  });
