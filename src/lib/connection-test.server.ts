// Teste automático de conexão: assim que um número é pareado, a central
// envia uma mensagem para o número de validação e guarda o resultado.
// Uso exclusivo no servidor.

export const NUMERO_TESTE_CONEXAO = "5562910002123";

type Resultado = { ok: boolean; detalhe: string; executado: boolean };

/** Limpa o resultado do teste para que a próxima conexão seja validada de novo. */
export async function limparTesteConexao(configId: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("whatsapp_config")
      .update({
        connection_test_status: null,
        connection_test_detail: null,
        connection_test_at: null,
      } as never)
      .eq("id", configId);
  } catch {
    /* o teste é apenas uma verificação extra */
  }
}

/**
 * Envia a mensagem de validação uma única vez por conexão.
 * Se o teste já foi feito (ou está em andamento) para esta sessão, não repete.
 */
export async function validarConexaoAposParear(configId: string): Promise<Resultado> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Reserva o teste: só segue quem conseguir marcar "executando".
  const { data: reservado, error: reservaErro } = await supabaseAdmin
    .from("whatsapp_config")
    .update({
      connection_test_status: "executando",
      connection_test_detail: null,
      connection_test_at: new Date().toISOString(),
    } as never)
    .eq("id", configId)
    .is("connection_test_status", null)
    .select("id")
    .maybeSingle();

  if (reservaErro || !reservado) {
    return { ok: false, detalhe: "Teste já realizado nesta conexão.", executado: false };
  }

  let ok = false;
  let detalhe = "";

  try {
    const { loadEvolutionConfig, ensureEvolutionInstance, evolutionSendText } = await import(
      "@/lib/evolution.server"
    );
    const config = await loadEvolutionConfig(configId);
    if (!config || !config.base_url) throw new Error("Aparelho sem configuração de API.");

    const instanceId = await ensureEvolutionInstance(config);
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const nome = config.label || config.instance_name || "Dispositivo";

    await evolutionSendText(
      {
        baseUrl: config.base_url,
        instanceId,
        configId: config.id,
      },
      {
        number: `${NUMERO_TESTE_CONEXAO}@s.whatsapp.net`,
        text: `✅ Teste automático de conexão\nAparelho: ${nome}\nNúmero conectado: ${config.phone || "—"}\nData: ${agora}`,
      },
    );

    ok = true;
    detalhe = `Mensagem de teste enviada para ${NUMERO_TESTE_CONEXAO}.`;
  } catch (error) {
    ok = false;
    detalhe = error instanceof Error ? error.message : "Falha ao enviar a mensagem de teste.";
  }

  try {
    await supabaseAdmin
      .from("whatsapp_config")
      .update({
        connection_test_status: ok ? "ok" : "falha",
        connection_test_detail: detalhe.slice(0, 300),
        connection_test_at: new Date().toISOString(),
      } as never)
      .eq("id", configId);
  } catch {
    /* resultado apenas informativo */
  }

  return { ok, detalhe, executado: true };
}
