// Motor de cobranças agendadas: envia o aviso de vencimento e o boleto
// pelo WhatsApp. Uso exclusivo no servidor.

export type Cobranca = {
  id: string;
  cliente_nome: string;
  telefone: string;
  descricao: string;
  valor: number;
  vencimento: string;
  boleto_url: string;
  linha_digitavel: string;
  mensagem: string;
  dias_antes: number;
  hora_envio: string;
  recorrencia: string;
  device_id: string | null;
  ativo: boolean;
  proximo_envio: string | null;
  ultimo_envio: string | null;
  status: string;
};

const FUSO_MINUTOS = -180; // America/Sao_Paulo (UTC-3)

/** Calcula quando o próximo aviso deve sair (data de vencimento - dias, no horário escolhido). */
export function calcularProximoEnvio(
  vencimento: string,
  diasAntes: number,
  horaEnvio: string,
): string {
  const [ano, mes, dia] = vencimento.split("-").map((n) => Number(n));
  const [hora, minuto] = (horaEnvio || "09:00").split(":").map((n) => Number(n));
  const base = Date.UTC(ano ?? 2026, (mes ?? 1) - 1, dia ?? 1, hora ?? 9, minuto ?? 0);
  const alvo = base - diasAntes * 24 * 60 * 60 * 1000 - FUSO_MINUTOS * 60 * 1000;
  return new Date(alvo).toISOString();
}

/** Soma um mês à data de vencimento (cobranças mensais). */
export function proximoVencimento(vencimento: string): string {
  const [ano, mes, dia] = vencimento.split("-").map((n) => Number(n));
  const data = new Date(Date.UTC(ano ?? 2026, (mes ?? 1) - 1, dia ?? 1));
  data.setUTCMonth(data.getUTCMonth() + 1);
  return data.toISOString().slice(0, 10);
}

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Monta o texto do aviso, usando a mensagem personalizada quando existir. */
export function montarTexto(cobranca: Cobranca, padrao?: string): string {
  const variaveis: Record<string, string> = {
    "{cliente}": cobranca.cliente_nome,
    "{valor}": moeda(Number(cobranca.valor ?? 0)),
    "{vencimento}": dataBr(cobranca.vencimento),
    "{descricao}": cobranca.descricao,
    "{linha}": cobranca.linha_digitavel,
    "{link}": cobranca.boleto_url,
  };
  let texto = cobranca.mensagem.trim();
  if (!texto) texto = (padrao ?? "").trim();
  if (!texto) {
    texto =
      "Olá {cliente}! Sua cobrança de {descricao} no valor de {valor} vence em {vencimento}.";
  }
  for (const [chave, valor] of Object.entries(variaveis)) {
    texto = texto.split(chave).join(valor);
  }
  if (cobranca.linha_digitavel.trim() && !texto.includes(cobranca.linha_digitavel.trim())) {
    texto += `\n\nLinha digitável:\n${cobranca.linha_digitavel.trim()}`;
  }
  return texto;
}

async function enviar(cobranca: Cobranca): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const { digitsOnly } = await import("@/lib/phone");
    const numero = digitsOnly(cobranca.telefone);
    if (numero.length < 10) return { ok: false, detalhe: "Telefone inválido." };

    const { loadEvolutionConfig, evolutionSendText, evolutionSendMedia } = await import(
      "@/lib/evolution.server"
    );
    const device = await loadEvolutionConfig(cobranca.device_id);
    if (!device || !device.base_url || !device.instance_id) {
      return { ok: false, detalhe: "Nenhum aparelho de WhatsApp conectado." };
    }
    const alvo = {
      baseUrl: device.base_url,
      instanceId: device.instance_id,
      configId: device.id,
      provider: device.provider,
    };
    const destino = `${numero}@s.whatsapp.net`;
    const { loadPaymentText } = await import("@/lib/payment-texts.server");
    const texto = montarTexto(cobranca, await loadPaymentText("cobranca_padrao"));
    const boleto = cobranca.boleto_url.trim();

    if (boleto) {
      const ehImagem = /\.(png|jpe?g|webp)$/i.test(boleto);
      await evolutionSendMedia(alvo, {
        number: destino,
        url: boleto,
        fileName: ehImagem ? "boleto.jpg" : "boleto.pdf",
        mimeType: ehImagem ? "image/jpeg" : "application/pdf",
        caption: texto,
      });
      return { ok: true, detalhe: "Aviso e boleto enviados." };
    }

    await evolutionSendText(alvo, { number: destino, text: texto });
    return { ok: true, detalhe: "Aviso enviado." };
  } catch (error) {
    return { ok: false, detalhe: error instanceof Error ? error.message : "Falha no envio." };
  }
}

/** Envia uma cobrança agora e reprograma o próximo aviso. */
export async function executarCobranca(
  id: string,
  reprogramar: boolean,
): Promise<{ ok: boolean; detalhe: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("cobrancas")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const cobranca = (data as Cobranca | null) ?? null;
  if (!cobranca) return { ok: false, detalhe: "Cobrança não encontrada." };

  const resultado = await enviar(cobranca);

  await supabaseAdmin.from("cobranca_envios").insert({
    cobranca_id: cobranca.id,
    tipo: cobranca.boleto_url.trim() ? "boleto" : "cobranca",
    ok: resultado.ok,
    detalhe: resultado.detalhe,
  });

  const agora = new Date().toISOString();
  const atualizacao: Record<string, unknown> = {
    ultimo_envio: agora,
    status: resultado.ok ? "enviada" : `falha: ${resultado.detalhe.slice(0, 120)}`,
    updated_at: agora,
  };

  if (reprogramar && resultado.ok) {
    if (cobranca.recorrencia === "mensal") {
      const novoVencimento = proximoVencimento(cobranca.vencimento);
      atualizacao["vencimento"] = novoVencimento;
      atualizacao["proximo_envio"] = calcularProximoEnvio(
        novoVencimento,
        cobranca.dias_antes,
        cobranca.hora_envio,
      );
    } else {
      atualizacao["ativo"] = false;
      atualizacao["proximo_envio"] = null;
    }
  }

  const { error: updErro } = await supabaseAdmin
    .from("cobrancas")
    .update(atualizacao as never)
    .eq("id", cobranca.id);
  if (updErro) throw new Error(updErro.message);

  return resultado;
}

/** Executa todas as cobranças vencidas (chamado pelo agendador). */
export async function executarCobrancasPendentes(): Promise<{ executadas: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("cobrancas")
    .select("id")
    .eq("ativo", true)
    .not("proximo_envio", "is", null)
    .lte("proximo_envio", new Date().toISOString())
    .limit(30);
  if (error) throw new Error(error.message);
  const ids = ((data ?? []) as { id: string }[]).map((c) => c.id);
  for (const id of ids) {
    try {
      await executarCobranca(id, true);
    } catch {
      // a falha fica registrada no histórico da cobrança
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { executadas: ids.length };
}
