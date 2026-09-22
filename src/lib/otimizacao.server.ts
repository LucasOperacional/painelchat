import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RelatorioOtimizacaoServidor = {
  executado_em: string;
  tamanho_antes: number;
  tamanho_depois: number;
  liberado: number;
  eventos_removidos: number;
  ciclos_removidos: number;
  achados_removidos: number;
  trafego_removido: number;
  mensagens_removidas: number;
  anexos_removidos: number;
};

/** Limpa registros antigos, remove anexos órfãos e atualiza estatísticas do banco. */
export async function otimizarServidor(): Promise<RelatorioOtimizacaoServidor> {
  const { data, error } = await supabaseAdmin.rpc("otimizar_servidor");
  if (error) throw new Error(error.message);

  const relatorio = (data ?? {}) as Omit<RelatorioOtimizacaoServidor, "anexos_removidos">;
  let anexos = 0;

  const { data: cfg } = await supabaseAdmin
    .from("otimizacao_settings")
    .select("limpar_anexos_orfaos, retencao_logs_dias")
    .eq("id", true)
    .maybeSingle();

  if ((cfg as { limpar_anexos_orfaos?: boolean } | null)?.limpar_anexos_orfaos) {
    anexos = await limparAnexosOrfaos();
  }

  return { ...relatorio, anexos_removidos: anexos };
}

/** Remove do bucket "anexos" arquivos de conversas que já não existem mais. */
async function limparAnexosOrfaos(): Promise<number> {
  try {
    const { data: pastas } = await supabaseAdmin.storage.from("anexos").list("", { limit: 1000 });
    const ids = (pastas ?? [])
      .map((p) => p.name)
      .filter((n) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n),
      );
    if (ids.length === 0) return 0;

    const { data: existentes } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .in("id", ids);
    const vivos = new Set(((existentes ?? []) as { id: string }[]).map((c) => c.id));
    const orfaos = ids.filter((id) => !vivos.has(id));

    let removidos = 0;
    for (const id of orfaos) {
      const { data: arquivos } = await supabaseAdmin.storage
        .from("anexos")
        .list(id, { limit: 1000 });
      const caminhos = (arquivos ?? []).map((a) => `${id}/${a.name}`);
      if (caminhos.length === 0) continue;
      const { error } = await supabaseAdmin.storage.from("anexos").remove(caminhos);
      if (!error) removidos += caminhos.length;
    }
    return removidos;
  } catch (error) {
    console.error("[otimizacao] falha ao limpar anexos órfãos", error);
    return 0;
  }
}
