// Loja automática: reconhece o número do produto que o cliente responde,
// gera a cobrança Pix na hora e, quando o pagamento é confirmado, o login do
// estoque é entregue sozinho (ver pix-confirm.server.ts).

export type ProdutoLoja = {
  id: string;
  nome: string;
  preco: number;
  disponiveis: number;
};

export type LojaSettings = {
  autoPix: boolean;
  provider: "auto" | "misticpay" | "efi" | "altispay" | "manual";
  pixKey: string;
  pixKeyType: string;
  recebedorNome: string;
  recebedorCidade: string;
  mensagemCobranca: string;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Produtos ativos da loja, sempre na mesma ordem (é ela que numera as opções). */
export async function carregarProdutosLoja(): Promise<ProdutoLoja[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: cats }, { data: itens }] = await Promise.all([
    supabaseAdmin
      .from("estoque_categorias")
      .select("id, nome, preco, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
    supabaseAdmin.from("estoque_itens").select("categoria_id").eq("status", "disponivel"),
  ]);
  const contagem = new Map<string, number>();
  for (const i of (itens ?? []) as { categoria_id: string }[]) {
    contagem.set(i.categoria_id, (contagem.get(i.categoria_id) ?? 0) + 1);
  }
  return ((cats ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c["id"] ?? ""),
    nome: String(c["nome"] ?? ""),
    preco: Number(c["preco"] ?? 0),
    disponiveis: contagem.get(String(c["id"] ?? "")) ?? 0,
  }));
}

export async function carregarLojaSettings(): Promise<LojaSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("loja_settings")
    .select(
      "auto_pix, provider, pix_key, pix_key_type, recebedor_nome, recebedor_cidade, mensagem_cobranca",
    )
    .eq("id", true)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    autoPix: row["auto_pix"] === undefined ? true : !!row["auto_pix"],
    provider: (String(row["provider"] ?? "auto") as LojaSettings["provider"]) || "auto",
    pixKey: String(row["pix_key"] ?? ""),
    pixKeyType: String(row["pix_key_type"] ?? "random"),
    recebedorNome: String(row["recebedor_nome"] ?? ""),
    recebedorCidade: String(row["recebedor_cidade"] ?? "SAO PAULO"),
    mensagemCobranca: String(row["mensagem_cobranca"] ?? ""),
  };
}

/** Marca que aparece no texto da loja e serve para reconhecer a resposta. */
export const MARCA_LOJA = "Responda com o número do produto";

/** Pedido do comprovante: é ele que dispara a entrega automática do login. */
export const AVISO_COMPROVANTE =
  "📎 Depois de pagar, envie aqui a *imagem do comprovante*. A conferência é automática e o seu acesso chega na hora.";

/**
 * Descobre qual produto o cliente escolheu: id do botão/lista (loja:<id>),
 * número da opção ("2", "opção 2") ou o próprio nome do produto.
 */
export function interpretarEscolha(
  body: string,
  produtos: ProdutoLoja[],
): ProdutoLoja | null {
  const texto = (body ?? "").trim();
  if (!texto) return null;

  const porId = texto.match(/loja:([0-9a-fA-F-]{36})/);
  if (porId) return produtos.find((p) => p.id === porId[1]) ?? null;

  const limpo = texto.toLocaleLowerCase("pt-BR");
  const somenteNumero = limpo.replace(/[^0-9]/g, "");
  if (somenteNumero && limpo.replace(/[^a-z]/g, "").length <= 6 && somenteNumero.length <= 2) {
    const indice = Number(somenteNumero) - 1;
    if (indice >= 0 && indice < produtos.length) return produtos[indice]!;
  }

  const porNome = produtos.find((p) => p.nome.trim().toLocaleLowerCase("pt-BR") === limpo);
  return porNome ?? null;
}

type Alvo = { baseUrl: string; instanceId: string; configId: string };

async function enviarCartaoPix(
  alvo: Alvo,
  input: { number: string; titulo: string; descricao: string; copyCode: string; imageUrl: string; texto: string },
) {
  const { evolutionSendButton, evolutionSendMedia, evolutionSendText } = await import(
    "@/lib/evolution.server"
  );
  try {
    const id = (await evolutionSendButton(alvo, {
      number: input.number,
      title: input.titulo,
      description: input.descricao,
      footer: "Toque em Copiar e cole no app do seu banco",
      imageUrl: input.imageUrl,
      buttons: [
        { type: "copy", displayText: "Copiar chave Pix", id: "pix_copiar", copyCode: input.copyCode },
      ],
    })) as string | null;
    return { externalId: id, usouCard: true };
  } catch {
    try {
      const id = (await evolutionSendMedia(alvo, {
        number: input.number,
        url: input.imageUrl,
        fileName: "pix.png",
        mimeType: "image/png",
        caption: input.texto,
      })) as string | null;
      return { externalId: id, usouCard: false };
    } catch {
      const id = (await evolutionSendText(alvo, {
        number: input.number,
        text: input.texto,
      })) as string | null;
      return { externalId: id, usouCard: false };
    }
  }
}

type CobrancaGerada = {
  provider: string;
  transactionId: string;
  copyPaste: string;
  qrCodeUrl: string;
};

/** Gera a cobrança no gateway configurado; sem gateway, usa a chave Pix da loja. */
async function gerarCobranca(
  settings: LojaSettings,
  input: {
    amount: number;
    description: string;
    payerName: string;
    conversationId: string;
    payerDocument?: string;
  },
): Promise<CobrancaGerada> {
  const ordem: LojaSettings["provider"][] =
    settings.provider === "auto"
      ? ["misticpay", "efi", "altispay", "manual"]
      : [settings.provider];

  let ultimoErro: string | null = null;

  for (const provider of ordem) {
    try {
      if (provider === "misticpay") {
        const { loadMisticpayCredentials, misticpayCreateCharge } = await import(
          "@/lib/misticpay.server"
        );
        const creds = await loadMisticpayCredentials();
        if (!creds) continue;
        // CPF opcional: usa o do cliente quando existir, senão o cadastrado na conta.
        const documento = (
          input.payerDocument || creds.defaultPayerDocument || ""
        ).replace(/\D/g, "");
        if (documento.length !== 11) continue;
        const transactionId = `loja-${input.conversationId.slice(0, 8)}-${Date.now()}`;
        const charge = await misticpayCreateCharge({
          amount: input.amount,
          payerName: input.payerName || creds.defaultPayerName || "Cliente",
          payerDocument: documento,
          description: input.description,
          transactionId,
        });
        return {
          provider: "misticpay",
          transactionId: charge.transactionId || transactionId,
          copyPaste: charge.copyPaste,
          qrCodeUrl: charge.qrCodeUrl,
        };
      }

      if (provider === "efi") {
        const { loadEfiCredentials, efiCreateCharge } = await import("@/lib/efi.server");
        const creds = await loadEfiCredentials();
        if (!creds?.pixKey) continue;
        const charge = await efiCreateCharge({
          amount: input.amount,
          description: input.description,
          payerName: input.payerName,
        });
        return {
          provider: "efi",
          transactionId: charge.txid,
          copyPaste: charge.copyPaste,
          qrCodeUrl: charge.qrCodeUrl,
        };
      }

      if (provider === "altispay") {
        const { loadAltispayCredentials, altispayCreateCharge } = await import(
          "@/lib/altispay.server"
        );
        const creds = await loadAltispayCredentials();
        if (!creds) continue;
        const externalReference = `loja-${input.conversationId.slice(0, 8)}-${Date.now()}`;
        const charge = await altispayCreateCharge({
          amount: input.amount,
          description: input.description,
          payerName: input.payerName || creds.defaultPayerName || "Cliente",
          payerDocument: (input.payerDocument ?? "").replace(/\D/g, ""),
          externalReference,
        });
        return {
          provider: "altispay",
          transactionId: charge.id || externalReference,
          copyPaste: charge.copyPaste,
          qrCodeUrl: charge.qrCodeUrl,
        };
      }

      if (provider === "manual") {
        if (!settings.pixKey.trim()) continue;
        const { buildPixPayload } = await import("@/lib/pix.functions");
        const payload = buildPixPayload({
          key: settings.pixKey,
          keyType: settings.pixKeyType,
          name: settings.recebedorNome || "RECEBEDOR",
          city: settings.recebedorCidade || "SAO PAULO",
          amount: input.amount.toFixed(2),
        });
        return {
          provider: "manual",
          transactionId: `loja-manual-${crypto.randomUUID()}`,
          copyPaste: payload,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(payload)}`,
        };
      }
    } catch (error) {
      ultimoErro = (error as Error).message;
    }
  }

  throw new Error(
    ultimoErro ??
      "Nenhuma forma de cobrança configurada. Cadastre um gateway ou a chave Pix da loja.",
  );
}

/**
 * Cliente respondeu a loja com o número (ou clicou no botão) de um produto:
 * gera e envia o Pix automaticamente. Devolve true quando tratou a mensagem.
 */
export async function responderEscolhaDaLoja(input: {
  conversationId: string;
  body: string;
  phoneDigits: string;
  configId: string | null;
}): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const settings = await carregarLojaSettings();
  if (!settings.autoPix) return false;

  const clicouBotao = /loja:[0-9a-fA-F-]{36}/.test(input.body ?? "");

  if (!clicouBotao) {
    // Só interpreta números quando a loja foi enviada há pouco nesta conversa.
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: enviou } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("conversation_id", input.conversationId)
      .in("direction", ["outbound", "system"])
      .ilike("body", `%${MARCA_LOJA}%`)
      .gte("created_at", desde)
      .limit(1)
      .maybeSingle();
    if (!enviou) return false;
  }

  const produtos = await carregarProdutosLoja();
  const produto = interpretarEscolha(input.body, produtos);
  if (!produto) return false;

  // Já existe uma cobrança pendente deste produto nesta conversa: não repete.
  const { data: pendente } = await supabaseAdmin
    .from("pix_charges")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .eq("estoque_categoria_id", produto.id)
    .is("confirmed_at", null)
    .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (pendente) return true;

  const { loadEvolutionConfig } = await import("@/lib/evolution.server");
  const { digitsOnly } = await import("@/lib/phone");
  const config = await loadEvolutionConfig(input.configId ?? null);
  if (!config?.base_url || !config?.instance_id) return false;
  const alvo = {
    baseUrl: config.base_url,
    instanceId: config.instance_id,
    configId: config.id,
  };
  const number = `${digitsOnly(input.phoneDigits)}@s.whatsapp.net`;

  const registrarSaida = async (texto: string, externalId: string | null) => {
    await supabaseAdmin.from("messages").insert({
      conversation_id: input.conversationId,
      direction: "outbound",
      body: texto,
      external_id: externalId,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", input.conversationId);
  };

  if (produto.disponiveis <= 0) {
    const texto = `😕 *${produto.nome}* está esgotado no momento. Assim que repor eu te aviso!`;
    const { evolutionSendText } = await import("@/lib/evolution.server");
    let externalId: string | null = null;
    try {
      externalId = (await evolutionSendText(alvo, { number, text: texto })) as string | null;
    } catch {
      /* segue e registra no histórico */
    }
    await registrarSaida(texto, externalId);
    return true;
  }

  const { data: contatoRow } = await supabaseAdmin
    .from("conversations")
    .select("whatsapp_config_id, contact:contacts(name)")
    .eq("id", input.conversationId)
    .maybeSingle();
  const nomeCliente =
    ((contatoRow?.contact as { name?: string } | null)?.name ?? "").trim() || "Cliente";

  let cobranca: CobrancaGerada;
  try {
    cobranca = await gerarCobranca(settings, {
      amount: Number(produto.preco),
      description: produto.nome,
      payerName: nomeCliente,
      conversationId: input.conversationId,
    });
  } catch (error) {
    console.error("[loja] cobrança automática:", (error as Error).message);
    return false;
  }

  const texto = [
    `*${produto.nome}*`,
    "",
    `Valor: ${brl(Number(produto.preco))}`,
    settings.mensagemCobranca ? `\n${settings.mensagemCobranca}` : "",
    "",
    "Pix copia e cola:",
    `\`\`\`${cobranca.copyPaste}\`\`\``,
    "",
    AVISO_COMPROVANTE,
  ]
    .filter((l) => l !== "")
    .join("\n");

  // A cobrança é registrada ANTES do envio: se o cliente mandar o comprovante
  // em seguida, já existe cobrança pendente para reconhecer o pagamento.
  await supabaseAdmin.from("pix_charges").insert({
    transaction_id: cobranca.transactionId,
    conversation_id: input.conversationId,
    whatsapp_config_id: contatoRow?.whatsapp_config_id ?? config.id,
    amount: Number(produto.preco),
    description: produto.nome,
    status: "pendente",
    provider: cobranca.provider,
    estoque_categoria_id: produto.id,
  });

  const entrega = await enviarCartaoPix(alvo, {
    number,
    titulo: produto.nome,
    descricao: [`Valor: ${brl(Number(produto.preco))}`, settings.mensagemCobranca]
      .filter(Boolean)
      .join("\n"),
    copyCode: cobranca.copyPaste,
    imageUrl: cobranca.qrCodeUrl,
    texto,
  });

  await registrarSaida(
    entrega.usouCard ? texto : `🖼 Imagem: ${cobranca.qrCodeUrl}\n${texto}`,
    entrega.externalId,
  );

  return true;
}

// ---------------------------------------------------------------------------
// Bot da loja: envia o catálogo numerado sozinho para cada pessoa que chama.
// O cliente responde o número, recebe o Pix e o login sai automaticamente.
// ---------------------------------------------------------------------------

export type LojaBotSettings = {
  botAtivo: boolean;
  botPrimeiroContato: boolean;
  botPalavras: string;
  botTitulo: string;
  botModo: "lista" | "botoes" | "texto";
  botSaudacao: string;
};

export async function carregarLojaBotSettings(): Promise<LojaBotSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("loja_settings")
    .select("bot_ativo, bot_primeiro_contato, bot_palavras, bot_titulo, bot_modo, bot_saudacao")
    .eq("id", true)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    botAtivo: row["bot_ativo"] === undefined ? true : !!row["bot_ativo"],
    botPrimeiroContato:
      row["bot_primeiro_contato"] === undefined ? true : !!row["bot_primeiro_contato"],
    botPalavras: String(
      row["bot_palavras"] ?? "loja,comprar,preco,preço,catalogo,catálogo,menu,acesso,login",
    ),
    botTitulo: String(row["bot_titulo"] ?? "Nossa loja de acessos"),
    botModo: (String(row["bot_modo"] ?? "lista") as LojaBotSettings["botModo"]) || "lista",
    botSaudacao: String(row["bot_saudacao"] ?? ""),
  };
}

/** Texto numerado do catálogo — é a numeração que o bot reconhece depois. */
export function textoDoCatalogo(produtos: ProdutoLoja[], titulo: string, saudacao: string) {
  const linhas: string[] = [];
  if (saudacao.trim()) linhas.push(saudacao.trim(), "");
  linhas.push(`*${titulo}*`, "");
  produtos.forEach((p, i) => {
    linhas.push(`${i + 1}. ${p.nome} — ${brl(p.preco)}${p.disponiveis ? "" : " (esgotado)"}`);
  });
  linhas.push("", `${MARCA_LOJA} que você quer comprar.`);
  return linhas.join("\n");
}

function normalizar(texto: string) {
  return (texto ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Verdadeiro quando a mensagem pede a loja (palavra-gatilho configurada). */
export function pediuALoja(body: string, palavras: string) {
  const texto = normalizar(body);
  if (!texto) return false;
  return palavras
    .split(/[,\n;]/)
    .map((p) => normalizar(p).trim())
    .filter((p) => p.length >= 3)
    .some((p) => texto.includes(p));
}

async function enviarCatalogo(
  alvo: Alvo,
  input: { number: string; titulo: string; texto: string; modo: LojaBotSettings["botModo"]; produtos: ProdutoLoja[] },
) {
  const { evolutionSendButton, evolutionSendList, evolutionSendText } = await import(
    "@/lib/evolution.server"
  );
  const descricao = input.produtos
    .map((p, i) => `${i + 1}. ${p.nome} — ${brl(p.preco)}${p.disponiveis ? "" : " (esgotado)"}`)
    .join("\n");

  if (input.modo === "botoes") {
    try {
      const id = (await evolutionSendButton(alvo, {
        number: input.number,
        title: input.titulo,
        description: descricao,
        footer: "Toque em uma opção ou responda o número",
        buttons: input.produtos.slice(0, 3).map((p) => ({
          type: "reply" as const,
          displayText: `${p.nome} ${brl(p.preco)}`.slice(0, 24),
          id: `loja:${p.id}`,
        })),
      })) as string | null;
      return id;
    } catch {
      /* cai para lista/texto */
    }
  }

  if (input.modo === "lista" || input.modo === "botoes") {
    try {
      const id = (await evolutionSendList(alvo, {
        number: input.number,
        title: input.titulo,
        description: "Toque em ver produtos e escolha o acesso que deseja.",
        buttonText: "Ver produtos",
        footerText: "Pagamento por Pix — acesso liberado na hora",
        sections: [
          {
            title: "Produtos disponíveis",
            rows: input.produtos.map((p, i) => ({
              title: `${i + 1}. ${p.nome}`.slice(0, 24),
              description: `${brl(p.preco)}${p.disponiveis ? "" : " — esgotado"}`,
              rowId: `loja:${p.id}`,
            })),
          },
        ],
      })) as string | null;
      return id;
    } catch {
      /* cai para texto */
    }
  }

  try {
    return (await evolutionSendText(alvo, { number: input.number, text: input.texto })) as
      | string
      | null;
  } catch {
    return null;
  }
}

/**
 * Chamado a cada mensagem recebida: quando é o primeiro contato ou o cliente
 * pede a loja, o bot manda o catálogo numerado para essa pessoa. Depois disso o
 * número respondido gera o Pix e a confirmação libera o login sozinho.
 */
export async function responderBotDaLoja(input: {
  conversationId: string;
  body: string;
  phoneDigits: string;
  configId: string | null;
  isNewConversation: boolean;
}): Promise<boolean> {
  const bot = await carregarLojaBotSettings();
  if (!bot.botAtivo) return false;

  const gatilho =
    pediuALoja(input.body, bot.botPalavras) || (bot.botPrimeiroContato && input.isNewConversation);
  if (!gatilho) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Evita repetir o catálogo várias vezes na mesma conversa.
  const { data: jaEnviou } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("conversation_id", input.conversationId)
    .in("direction", ["outbound", "system"])
    .ilike("body", `%${MARCA_LOJA}%`)
    .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (jaEnviou) return false;

  const produtos = await carregarProdutosLoja();
  if (!produtos.length) return false;

  const { loadEvolutionConfig } = await import("@/lib/evolution.server");
  const { digitsOnly } = await import("@/lib/phone");
  const config = await loadEvolutionConfig(input.configId ?? null);
  if (!config?.base_url || !config?.instance_id) return false;

  const texto = textoDoCatalogo(produtos, bot.botTitulo, bot.botSaudacao);
  const externalId = await enviarCatalogo(
    { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
    {
      number: `${digitsOnly(input.phoneDigits)}@s.whatsapp.net`,
      titulo: bot.botTitulo,
      texto,
      modo: bot.botModo,
      produtos,
    },
  );

  await supabaseAdmin.from("messages").insert({
    conversation_id: input.conversationId,
    direction: externalId ? "outbound" : "system",
    body: externalId ? texto : `${texto}\n\n(não enviado: nenhuma conexão respondeu)`,
    external_id: externalId,
  });
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  return true;
}

/**
 * Envia o catálogo numerado da loja para uma conversa específica.
 * Usado pelo chatbot de atendimento (ação "Enviar a loja") e pelo bot da loja.
 */
export async function enviarLojaParaConversa(input: {
  conversationId: string;
  phoneDigits: string;
  configId: string | null;
  titulo?: string;
  saudacao?: string;
  modo?: LojaBotSettings["botModo"];
}): Promise<boolean> {
  const bot = await carregarLojaBotSettings();
  const produtos = await carregarProdutosLoja();
  if (!produtos.length) return false;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadEvolutionConfig } = await import("@/lib/evolution.server");
  const { digitsOnly } = await import("@/lib/phone");
  const config = await loadEvolutionConfig(input.configId ?? null);
  if (!config?.base_url || !config?.instance_id) return false;

  const titulo = (input.titulo ?? bot.botTitulo) || "Nossa loja de acessos";
  const saudacao = input.saudacao ?? bot.botSaudacao;
  const texto = textoDoCatalogo(produtos, titulo, saudacao);

  const externalId = await enviarCatalogo(
    { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
    {
      number: `${digitsOnly(input.phoneDigits)}@s.whatsapp.net`,
      titulo,
      texto,
      modo: input.modo ?? bot.botModo,
      produtos,
    },
  );

  await supabaseAdmin.from("messages").insert({
    conversation_id: input.conversationId,
    direction: externalId ? "outbound" : "system",
    body: externalId ? texto : `${texto}\n\n(não enviado: nenhuma conexão respondeu)`,
    external_id: externalId,
  });
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  return true;
}
