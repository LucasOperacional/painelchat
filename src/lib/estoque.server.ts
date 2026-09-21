// Entrega automática do estoque de logins quando um pagamento é confirmado.

type ItemEstoque = {
  id: string;
  titulo: string;
  login: string;
  senha: string;
  url: string;
  extras: string;
  validade: string | null;
};

export function montarTextoEntrega(
  item: ItemEstoque,
  categoria: { nome: string; entrega_mensagem: string },
) {
  const linhas = [
    "🔓 *Acesso liberado*",
    "",
    `*${item.titulo || categoria.nome}*`,
    `Login: ${item.login}`,
  ];
  if (item.senha) linhas.push(`Senha: ${item.senha}`);
  if (item.url) linhas.push(`Site: ${item.url}`);
  if (item.validade) {
    const [ano, mes, dia] = item.validade.split("-");
    linhas.push(`Validade: ${dia}/${mes}/${ano}`);
  }
  if (item.extras) linhas.push("", item.extras);
  if (categoria.entrega_mensagem) linhas.push("", categoria.entrega_mensagem);
  return linhas.join("\n");
}

/**
 * Reserva o primeiro login disponível da categoria vinculada à cobrança paga.
 * Usa update condicional (status = 'disponivel') para nunca entregar o mesmo
 * login duas vezes, mesmo com dois pagamentos ao mesmo tempo.
 */
export async function entregarEstoqueDaCobranca(charge: {
  id: string;
  conversation_id: string;
  estoque_categoria_id?: string | null;
}) {
  if (!charge.estoque_categoria_id) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: categoria } = await supabaseAdmin
    .from("estoque_categorias")
    .select("id, nome, entrega_mensagem")
    .eq("id", charge.estoque_categoria_id)
    .maybeSingle();
  if (!categoria) return null;

  const { data: candidatos } = await supabaseAdmin
    .from("estoque_itens")
    .select("id, titulo, login, senha, url, extras, validade")
    .eq("categoria_id", charge.estoque_categoria_id)
    .eq("status", "disponivel")
    .order("created_at", { ascending: true })
    .limit(10);

  for (const candidato of (candidatos ?? []) as ItemEstoque[]) {
    const { data: reservado } = await supabaseAdmin
      .from("estoque_itens")
      .update({
        status: "vendido",
        conversation_id: charge.conversation_id,
        pix_charge_id: charge.id,
        vendido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidato.id)
      .eq("status", "disponivel")
      .select("id")
      .maybeSingle();
    if (!reservado) continue;
    return {
      texto: montarTextoEntrega(candidato, categoria as { nome: string; entrega_mensagem: string }),
      itemId: candidato.id,
      categoria: (categoria as { nome: string }).nome,
    };
  }

  return {
    texto: [
      "⚠️ *Estoque esgotado*",
      "",
      `Seu pagamento de *${(categoria as { nome: string }).nome}* foi confirmado, mas o acesso será enviado manualmente em instantes.`,
    ].join("\n"),
    itemId: null,
    categoria: (categoria as { nome: string }).nome,
  };
}
