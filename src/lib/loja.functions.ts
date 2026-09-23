import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Endereço público da loja (página que o cliente abre no navegador). */
export const LOJA_URL = "https://nxspluschat.lovable.app/loja";

type Produto = { id: string; nome: string; preco: number; disponiveis: number };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function carregarProdutos(): Promise<Produto[]> {
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

function textoDaLoja(produtos: Produto[], titulo: string) {
  const linhas = [`*${titulo}*`, ""];
  produtos.forEach((p, i) => {
    linhas.push(
      `${i + 1}. ${p.nome} — ${brl(p.preco)}${p.disponiveis ? "" : " (esgotado)"}`,
    );
  });
  linhas.push("", "Responda com o número do produto que você quer comprar.", "", LOJA_URL);
  return linhas.join("\n");
}

type Alvo = { baseUrl: string; instanceId: string; configId: string };

/**
 * Envia a loja de duas formas:
 * - "botoes": cartão com botões nativos do WhatsApp (até 3 produtos);
 * - "lista": menu em lista com todos os produtos (abre em tela cheia).
 * Em qualquer falha do servidor da conexão, cai para o texto com o link da loja.
 */
async function entregarLoja(
  alvo: Alvo,
  input: { number: string; modo: "botoes" | "lista" | "link"; titulo: string; produtos: Produto[] },
): Promise<{ externalId: string | null; formato: string; erro: string | null }> {
  const { evolutionSendButton, evolutionSendList, evolutionSendText } = await import(
    "@/lib/evolution.server"
  );
  const texto = textoDaLoja(input.produtos, input.titulo);
  const descricao = input.produtos
    .map((p) => `• ${p.nome} — ${brl(p.preco)}${p.disponiveis ? "" : " (esgotado)"}`)
    .join("\n");

  let erro: string | null = null;

  if (input.modo === "botoes") {
    try {
      const id = (await evolutionSendButton(alvo, {
        number: input.number,
        title: input.titulo,
        description: `${descricao}\n\nLoja completa: ${LOJA_URL}`,
        footer: "Escolha uma opção abaixo",
        // A Evolution Go não aceita misturar botões de resposta com botões de
        // link, então a loja em botões usa só respostas rápidas e deixa o
        // endereço da loja no texto.
        buttons: input.produtos.slice(0, 3).map((p) => ({
          type: "reply" as const,
          displayText: `${p.nome} ${brl(p.preco)}`.slice(0, 24),
          id: `loja:${p.id}`,
        })),
      })) as string | null;
      return { externalId: id, formato: "botoes", erro: null };
    } catch (e) {
      erro = (e as Error).message;
    }
  }

  if (input.modo === "lista" || erro) {
    try {
      const id = (await evolutionSendList(alvo, {
        number: input.number,
        title: input.titulo,
        description: "Toque em ver produtos e escolha o que deseja comprar.",
        buttonText: "Ver produtos",
        footerText: "Pagamento por Pix — acesso liberado na hora",
        sections: [
          {
            title: "Produtos disponíveis",
            rows: input.produtos.map((p) => ({
              title: p.nome.slice(0, 24),
              description: `${brl(p.preco)}${p.disponiveis ? "" : " — esgotado"}`,
              rowId: `loja:${p.id}`,
            })),
          },
        ],
      })) as string | null;
      return { externalId: id, formato: "lista", erro: null };
    } catch (e) {
      erro = (e as Error).message;
    }
  }

  try {
    const id = (await evolutionSendText(alvo, { number: input.number, text: texto })) as
      | string
      | null;
    return { externalId: id, formato: "texto", erro };
  } catch (e) {
    return { externalId: null, formato: "nenhum", erro: (e as Error).message || erro };
  }
}

/** Produtos da loja para montar a prévia na tela de atendimento. */
export const produtosDaLoja = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ produtos: await carregarProdutos(), url: LOJA_URL }));

const enviarSchema = z.object({
  conversationId: z.string().uuid(),
  modo: z.enum(["botoes", "lista", "link"]).default("lista"),
  titulo: z.string().trim().max(60).default("Nossa loja"),
});

/** Envia a loja na conversa aberta. */
export const enviarLoja = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => enviarSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const produtos = await carregarProdutos();
    if (!produtos.length) throw new Error("Cadastre categorias no estoque antes de enviar a loja.");

    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("id, first_response_at, whatsapp_config_id, contact:contacts(phone, wa_jid)")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conversation) throw new Error("Conversa não encontrada.");
    const contact = conversation.contact as { phone: string; wa_jid: string | null } | null;
    if (!contact) throw new Error("Contato da conversa não encontrado.");

    const { ensureEvolutionDevice } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");
    const config = await (await import("@/lib/evolution.server")).ensureConversationDevice(conversation.id, conversation.whatsapp_config_id ?? null);
    if (!config?.base_url || !config?.instance_id) {
      throw new Error("Conecte um dispositivo de WhatsApp para enviar a loja.");
    }

    const jidDigits = contact.wa_jid ? digitsOnly(contact.wa_jid.split("@")[0] ?? "") : "";
    const isGroup = !!contact.wa_jid?.includes("@g.us");
    const number = isGroup ? contact.wa_jid! : `${jidDigits || digitsOnly(contact.phone)}@s.whatsapp.net`;

    const entrega = await entregarLoja(
      { baseUrl: config.base_url, instanceId: config.instance_id, configId: config.id },
      { number, modo: data.modo, titulo: data.titulo, produtos },
    );

    const insert = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_id: userId,
      direction: "outbound",
      body: textoDaLoja(produtos, data.titulo),
      external_id: entrega.externalId,
    });
    if (insert.error) throw new Error(insert.error.message);

    const patch: { last_message_at: string; first_response_at?: string } = {
      last_message_at: new Date().toISOString(),
    };
    if (!conversation.first_response_at) patch.first_response_at = new Date().toISOString();
    await supabase.from("conversations").update(patch).eq("id", data.conversationId);

    return { formato: entrega.formato, erro: entrega.erro, enviado: !!entrega.externalId };
  });

/**
 * Testa o envio da loja em cada conexão cadastrada e informa qual servidor
 * aceitou os botões nativos, qual aceitou a lista e qual só aceitou texto.
 */
export const testarLojaNasConexoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ numero: z.string().trim().min(8, "Informe o número de teste") }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { evolutionSendButton, evolutionSendList } = await import("@/lib/evolution.server");
    const { digitsOnly } = await import("@/lib/phone");

    const { data: configs } = await supabaseAdmin
      .from("whatsapp_config")
      .select("id, label, provider, base_url, instance_id, status");

    const numero = `${digitsOnly(data.numero)}@s.whatsapp.net`;
    const produtos = (await carregarProdutos()).slice(0, 3);
    const amostra: Produto[] = produtos.length
      ? produtos
      : [{ id: "demo", nome: "Produto de teste", preco: 1, disponiveis: 1 }];

    const resultados: {
      conexao: string;
      provedor: string;
      botoes: boolean;
      lista: boolean;
      erroBotoes: string | null;
      erroLista: string | null;
    }[] = [];

    for (const c of ((configs ?? []) as Record<string, unknown>[]).filter(
      (c) => c["base_url"] && c["instance_id"],
    )) {
      const alvo = {
        baseUrl: String(c["base_url"]),
        instanceId: String(c["instance_id"]),
        configId: String(c["id"]),
      };
      let botoes = false;
      let lista = false;
      let erroBotoes: string | null = null;
      let erroLista: string | null = null;
      try {
        await evolutionSendButton(alvo, {
          number: numero,
          title: "Teste da loja",
          description: amostra.map((p) => `• ${p.nome} — ${brl(p.preco)}`).join("\n"),
          footer: "Teste de botões",
          buttons: [{ type: "reply", displayText: "Quero comprar", id: "loja_teste" }],
        });
        botoes = true;
      } catch (e) {
        erroBotoes = (e as Error).message;
      }
      try {
        await evolutionSendList(alvo, {
          number: numero,
          title: "Teste da loja",
          description: "Menu em lista",
          buttonText: "Ver produtos",
          footerText: "Teste de lista",
          sections: [
            {
              title: "Produtos",
              rows: amostra.map((p) => ({
                title: p.nome.slice(0, 24),
                description: brl(p.preco),
                rowId: `loja:${p.id}`,
              })),
            },
          ],
        });
        lista = true;
      } catch (e) {
        erroLista = (e as Error).message;
      }
      resultados.push({
        conexao: String(c["label"] ?? "Conexão"),
        provedor: String(c["provider"] ?? ""),
        botoes,
        lista,
        erroBotoes,
        erroLista,
      });
    }

    return { resultados };
  });

// ---------------------------------------------------------------------------
// Configurações da loja: cobrança automática quando o cliente responde o número
// ---------------------------------------------------------------------------

const configSchema = z.object({
  autoPix: z.boolean().default(true),
  provider: z.enum(["auto", "misticpay", "efi", "altispay", "manual"]).default("auto"),
  pixKey: z.string().trim().max(140).default(""),
  pixKeyType: z.enum(["phone", "email", "cpf", "cnpj", "random"]).default("random"),
  recebedorNome: z.string().trim().max(60).default(""),
  recebedorCidade: z.string().trim().max(40).default("SAO PAULO"),
  mensagemCobranca: z.string().trim().max(400).default(""),
  botAtivo: z.boolean().default(true),
  botPrimeiroContato: z.boolean().default(true),
  botPalavras: z.string().trim().max(400).default(""),
  botTitulo: z.string().trim().max(60).default("Nossa loja de acessos"),
  botModo: z.enum(["lista", "botoes", "texto"]).default("lista"),
  botSaudacao: z.string().trim().max(400).default(""),
});

export const lojaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { carregarLojaSettings, carregarLojaBotSettings } = await import("@/lib/loja.server");
    const [settings, bot] = await Promise.all([carregarLojaSettings(), carregarLojaBotSettings()]);
    return { ...settings, ...bot };
  });

export const salvarLojaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => configSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Apenas administradores podem alterar a loja.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("loja_settings").upsert({
      id: true,
      auto_pix: data.autoPix,
      provider: data.provider,
      pix_key: data.pixKey,
      pix_key_type: data.pixKeyType,
      recebedor_nome: data.recebedorNome,
      recebedor_cidade: data.recebedorCidade,
      mensagem_cobranca: data.mensagemCobranca,
      bot_ativo: data.botAtivo,
      bot_primeiro_contato: data.botPrimeiroContato,
      bot_palavras: data.botPalavras,
      bot_titulo: data.botTitulo,
      bot_modo: data.botModo,
      bot_saudacao: data.botSaudacao,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
