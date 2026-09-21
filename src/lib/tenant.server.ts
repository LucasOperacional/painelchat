/**
 * Isolamento por endereço (franquia).
 *
 * Cada projeto (domínio/subdomínio) tem seus próprios dados. As rotinas que usam
 * a chave de serviço (webhooks, monitor, envios) precisam dizer explicitamente de
 * qual franquia é o registro, porque elas não passam pelas regras do banco.
 */

let centralCache: string | null = null;

/** Projeto central (painel principal). */
export async function projetoCentral(): Promise<string | null> {
  if (centralCache) return centralCache;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("is_central", true)
    .limit(1)
    .maybeSingle();
  centralCache = data?.id ?? null;
  return centralCache;
}

/** Franquia do usuário logado. */
export async function projetoDoUsuario(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return projetoCentral();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("project_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.project_id as string | null) ?? (await projetoCentral());
}

/** Franquia dona de um aparelho de WhatsApp. */
export async function projetoDoDispositivo(configId: string | null | undefined): Promise<string | null> {
  if (!configId) return projetoCentral();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_config")
    .select("project_id")
    .eq("id", configId)
    .maybeSingle();
  return (data?.project_id as string | null) ?? (await projetoCentral());
}
