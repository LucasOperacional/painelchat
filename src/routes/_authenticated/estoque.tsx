import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Eye, EyeOff, ExternalLink, Loader2, Plus, Store, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  importarLogins,
  listarEstoque,
  removerCategoria,
  removerItem,
  salvarCategoria,
  salvarItem,
} from "@/lib/estoque.functions";
import {
  LOJA_URL,
  lojaConfig,
  salvarLojaConfig,
  testarLojaNasConexoes,
} from "@/lib/loja.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TITULO = "Estoque de logins — entrega automática após o pagamento";
const DESCRICAO =
  "Cadastre categorias e logins em estoque e libere o acesso sozinho assim que o Pix for confirmado.";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EstoquePage,
});

const categoriaVazia = {
  id: null as string | null,
  nome: "",
  descricao: "",
  preco: "",
  entregaMensagem: "",
  ativo: true,
};

const itemVazio = {
  id: null as string | null,
  categoriaId: "",
  titulo: "",
  login: "",
  senha: "",
  url: "",
  extras: "",
  validade: "",
  status: "disponivel" as "disponivel" | "reservado" | "vendido" | "inativo",
};

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function EstoquePage() {
  const queryClient = useQueryClient();
  const listarFn = useServerFn(listarEstoque);
  const estoque = useQuery({ queryKey: ["estoque"], queryFn: () => listarFn({}) });

  const [categoriaAberta, setCategoriaAberta] = useState<string | null>(null);
  const [formCategoria, setFormCategoria] = useState(categoriaVazia);
  const [dialogCategoria, setDialogCategoria] = useState(false);
  const [formItem, setFormItem] = useState(itemVazio);
  const [dialogItem, setDialogItem] = useState(false);
  const [dialogImport, setDialogImport] = useState(false);
  const [importTexto, setImportTexto] = useState("");
  const [importCategoria, setImportCategoria] = useState("");
  const [mostrarSenhas, setMostrarSenhas] = useState(false);
  const [dialogTeste, setDialogTeste] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState("");
  const testarFn = useServerFn(testarLojaNasConexoes);
  const mutTeste = useMutation({
    mutationFn: () => testarFn({ data: { numero: numeroTeste } }),
    onError: (e: Error) => toast.error("Não foi possível testar", { description: e.message }),
  });

  // Cobrança automática: quando o cliente responde o número do produto da loja.
  const configFn = useServerFn(lojaConfig);
  const config = useQuery({ queryKey: ["loja-config"], queryFn: () => configFn({}) });
  const [formLoja, setFormLoja] = useState<{
    autoPix: boolean;
    provider: "auto" | "misticpay" | "efi" | "altispay" | "manual";
    pixKey: string;
    pixKeyType: "phone" | "email" | "cpf" | "cnpj" | "random";
    recebedorNome: string;
    recebedorCidade: string;
    mensagemCobranca: string;
    botAtivo: boolean;
    botPrimeiroContato: boolean;
    botPalavras: string;
    botTitulo: string;
    botModo: "lista" | "botoes" | "texto";
    botSaudacao: string;
  } | null>(null);
  const loja = formLoja ??
    (config.data as unknown as typeof formLoja) ?? {
      autoPix: true,
      provider: "auto" as const,
      pixKey: "",
      pixKeyType: "random" as const,
      recebedorNome: "",
      recebedorCidade: "SAO PAULO",
      mensagemCobranca: "",
      botAtivo: true,
      botPrimeiroContato: true,
      botPalavras: "loja,comprar,preco,preço,catalogo,catálogo,menu,acesso,login",
      botTitulo: "Nossa loja de acessos",
      botModo: "lista" as const,
      botSaudacao: "",
    };
  const salvarLojaFn = useServerFn(salvarLojaConfig);
  const mutLoja = useMutation({
    mutationFn: () => salvarLojaFn({ data: loja }),
    onSuccess: () => {
      toast.success("Configurações da loja salvas");
      queryClient.invalidateQueries({ queryKey: ["loja-config"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const categorias = estoque.data?.categorias ?? [];
  const itens = estoque.data?.itens ?? [];
  const ehAdmin = estoque.data?.ehAdmin ?? false;

  const selecionada = categoriaAberta ?? categorias[0]?.id ?? "";
  const itensDaCategoria = useMemo(
    () => itens.filter((i) => i.categoriaId === selecionada),
    [itens, selecionada],
  );

  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["estoque"] });

  const salvarCategoriaFn = useServerFn(salvarCategoria);
  const mutCategoria = useMutation({
    mutationFn: () =>
      salvarCategoriaFn({
        data: {
          id: formCategoria.id,
          nome: formCategoria.nome,
          descricao: formCategoria.descricao,
          preco: Number(formCategoria.preco.replace(/\./g, "").replace(",", ".") || 0),
          entregaMensagem: formCategoria.entregaMensagem,
          ativo: formCategoria.ativo,
        },
      }),
    onSuccess: async () => {
      setDialogCategoria(false);
      setFormCategoria(categoriaVazia);
      await recarregar();
      toast.success("Categoria salva");
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const removerCategoriaFn = useServerFn(removerCategoria);
  const mutRemoverCategoria = useMutation({
    mutationFn: (id: string) => removerCategoriaFn({ data: { id } }),
    onSuccess: async () => {
      await recarregar();
      toast.success("Categoria removida");
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const salvarItemFn = useServerFn(salvarItem);
  const mutItem = useMutation({
    mutationFn: () =>
      salvarItemFn({
        data: {
          id: formItem.id,
          categoriaId: formItem.categoriaId || selecionada,
          titulo: formItem.titulo,
          login: formItem.login,
          senha: formItem.senha,
          url: formItem.url,
          extras: formItem.extras,
          validade: formItem.validade || null,
          status: formItem.status,
        },
      }),
    onSuccess: async () => {
      setDialogItem(false);
      setFormItem(itemVazio);
      await recarregar();
      toast.success("Login salvo no estoque");
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const removerItemFn = useServerFn(removerItem);
  const mutRemoverItem = useMutation({
    mutationFn: (id: string) => removerItemFn({ data: { id } }),
    onSuccess: async () => {
      await recarregar();
      toast.success("Login removido");
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const importarFn = useServerFn(importarLogins);
  const mutImportar = useMutation({
    mutationFn: () =>
      importarFn({ data: { categoriaId: importCategoria || selecionada, texto: importTexto } }),
    onSuccess: async (res) => {
      setDialogImport(false);
      setImportTexto("");
      await recarregar();
      toast.success(`${res.criados} logins adicionados ao estoque`);
    },
    onError: (e: Error) => toast.error("Não foi possível importar", { description: e.message }),
  });

  if (!estoque.isLoading && !ehAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Estoque de logins</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Apenas administradores podem ver e cadastrar os logins do estoque.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Boxes className="size-5" /> Estoque de logins
          </h1>
          <p className="text-sm text-muted-foreground">
            Assim que o pagamento do Pix é confirmado, o próximo login disponível da categoria é
            enviado sozinho no WhatsApp do cliente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setImportCategoria(selecionada);
              setDialogImport(true);
            }}
            disabled={!categorias.length}
          >
            <Upload className="size-4" /> Importar vários
          </Button>
          <Button variant="outline" onClick={() => window.open(LOJA_URL, "_blank", "noopener")}>
            <ExternalLink className="size-4" /> Abrir loja
          </Button>
          <Button variant="outline" onClick={() => setDialogTeste(true)}>
            <Store className="size-4" /> Testar loja nas conexões
          </Button>
          <Button
            onClick={() => {
              setFormCategoria(categoriaVazia);
              setDialogCategoria(true);
            }}
          >
            <Plus className="size-4" /> Nova categoria
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chatbot de entrega dos logins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">
                Enviar o catálogo numerado sozinho para cada pessoa
              </p>
              <p className="text-xs text-muted-foreground">
                O bot manda a lista com os acessos e os números, reconhece o número que a pessoa
                responde, envia o Pix e entrega o login na hora em que o pagamento é confirmado.
              </p>
            </div>
            <Switch
              checked={loja.botAtivo}
              onCheckedChange={(v) => setFormLoja({ ...loja, botAtivo: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Responder já no primeiro contato</p>
              <p className="text-xs text-muted-foreground">
                Quem escrever pela primeira vez recebe o catálogo automaticamente.
              </p>
            </div>
            <Switch
              checked={loja.botPrimeiroContato}
              onCheckedChange={(v) => setFormLoja({ ...loja, botPrimeiroContato: v })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Título do catálogo</Label>
              <Input
                value={loja.botTitulo}
                onChange={(e) => setFormLoja({ ...loja, botTitulo: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Formato do envio</Label>
              <Select
                value={loja.botModo}
                onValueChange={(v) => setFormLoja({ ...loja, botModo: v as typeof loja.botModo })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lista">Menu em lista (recomendado)</SelectItem>
                  <SelectItem value="botoes">Botões (até 3 produtos)</SelectItem>
                  <SelectItem value="texto">Texto numerado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Palavras que chamam o bot</Label>
              <Input
                value={loja.botPalavras}
                onChange={(e) => setFormLoja({ ...loja, botPalavras: e.target.value })}
                placeholder="loja, comprar, preço, menu"
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Saudação antes do catálogo</Label>
              <Textarea
                rows={2}
                value={loja.botSaudacao}
                onChange={(e) => setFormLoja({ ...loja, botSaudacao: e.target.value })}
                placeholder="Olá! Veja os acessos disponíveis:"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mutLoja.mutate()} disabled={mutLoja.isPending}>
              {mutLoja.isPending && <Loader2 className="size-4 animate-spin" />} Salvar chatbot
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cobrança automática da loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">
                Reconhecer o número que o cliente responde e já mandar o Pix
              </p>
              <p className="text-xs text-muted-foreground">
                O cliente responde 1, 2, 3… (ou toca no botão da loja) e recebe a cobrança na hora.
                Assim que o pagamento é confirmado, o login sai sozinho.
              </p>
            </div>
            <Switch
              checked={loja.autoPix}
              onCheckedChange={(v) => setFormLoja({ ...loja, autoPix: v })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Forma de cobrança</Label>
              <Select
                value={loja.provider}
                onValueChange={(v) => setFormLoja({ ...loja, provider: v as typeof loja.provider })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automática (usa o que estiver pronto)</SelectItem>
                  <SelectItem value="misticpay">MisticPay</SelectItem>
                  <SelectItem value="efi">Efí Bank</SelectItem>
                  <SelectItem value="altispay">AltisPay</SelectItem>
                  <SelectItem value="manual">Chave Pix própria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo da chave Pix</Label>
              <Select
                value={loja.pixKeyType}
                onValueChange={(v) =>
                  setFormLoja({ ...loja, pixKeyType: v as typeof loja.pixKeyType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="random">Chave aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Chave Pix</Label>
              <Input
                value={loja.pixKey}
                onChange={(e) => setFormLoja({ ...loja, pixKey: e.target.value })}
                placeholder="Usada quando não há gateway de pagamento"
              />
            </div>
            <div className="space-y-1">
              <Label>Nome de quem recebe</Label>
              <Input
                value={loja.recebedorNome}
                onChange={(e) => setFormLoja({ ...loja, recebedorNome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Cidade</Label>
              <Input
                value={loja.recebedorCidade}
                onChange={(e) => setFormLoja({ ...loja, recebedorCidade: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>Mensagem enviada junto do Pix</Label>
              <Textarea
                rows={2}
                value={loja.mensagemCobranca}
                onChange={(e) => setFormLoja({ ...loja, mensagemCobranca: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => mutLoja.mutate()} disabled={mutLoja.isPending}>
              {mutLoja.isPending && <Loader2 className="size-4 animate-spin" />} Salvar loja
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Categorias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {estoque.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {!estoque.isLoading && !categorias.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma categoria ainda. Crie a primeira para começar o estoque.
              </p>
            )}
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoriaAberta(c.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  c.id === selecionada ? "border-primary bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.nome}</span>
                  <Badge variant={c.disponiveis > 0 ? "default" : "destructive"}>
                    {c.disponiveis} em estoque
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{brl(c.preco)}</span>
                  <span>{c.vendidos} vendidos</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base">
              Logins {categorias.find((c) => c.id === selecionada)?.nome ?? ""}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMostrarSenhas((v) => !v)}>
                {mostrarSenhas ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {mostrarSenhas ? "Ocultar senhas" : "Ver senhas"}
              </Button>
              {selecionada && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const atual = categorias.find((c) => c.id === selecionada);
                      if (!atual) return;
                      setFormCategoria({
                        id: atual.id,
                        nome: atual.nome,
                        descricao: atual.descricao,
                        preco: String(atual.preco).replace(".", ","),
                        entregaMensagem: atual.entregaMensagem,
                        ativo: atual.ativo,
                      });
                      setDialogCategoria(true);
                    }}
                  >
                    Editar categoria
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setFormItem({ ...itemVazio, categoriaId: selecionada });
                      setDialogItem(true);
                    }}
                  >
                    <Plus className="size-4" /> Novo login
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {!itensDaCategoria.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum login cadastrado nesta categoria.
              </p>
            )}
            {itensDaCategoria.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{i.titulo || i.login}</span>
                    <Badge
                      variant={
                        i.status === "disponivel"
                          ? "default"
                          : i.status === "vendido"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {i.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.login}
                    {i.senha ? ` · ${mostrarSenhas ? i.senha : "••••••••"}` : ""}
                    {i.validade ? ` · vence ${i.validade.split("-").reverse().join("/")}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFormItem({
                        id: i.id,
                        categoriaId: i.categoriaId,
                        titulo: i.titulo,
                        login: i.login,
                        senha: i.senha,
                        url: i.url,
                        extras: i.extras,
                        validade: i.validade,
                        status: i.status as typeof itemVazio.status,
                      });
                      setDialogItem(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mutRemoverItem.mutate(i.id)}
                    disabled={mutRemoverItem.isPending}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogCategoria} onOpenChange={setDialogCategoria}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{formCategoria.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
            <DialogDescription>
              O preço aparece na hora de cobrar e a mensagem de entrega vai junto com o login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-nome">Nome</Label>
              <Input
                id="cat-nome"
                value={formCategoria.nome}
                onChange={(e) => setFormCategoria((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Streaming, Curso, Painel…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-preco">Preço (R$)</Label>
              <Input
                id="cat-preco"
                value={formCategoria.preco}
                onChange={(e) => setFormCategoria((f) => ({ ...f, preco: e.target.value }))}
                placeholder="29,90"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Descrição</Label>
              <Input
                id="cat-desc"
                value={formCategoria.descricao}
                onChange={(e) => setFormCategoria((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-msg">Mensagem enviada junto com o acesso</Label>
              <Textarea
                id="cat-msg"
                rows={3}
                value={formCategoria.entregaMensagem}
                onChange={(e) =>
                  setFormCategoria((f) => ({ ...f, entregaMensagem: e.target.value }))
                }
                placeholder="Não troque a senha. Suporte pelo WhatsApp."
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Categoria ativa</p>
                <p className="text-xs text-muted-foreground">
                  Só categorias ativas aparecem na hora de cobrar.
                </p>
              </div>
              <Switch
                checked={formCategoria.ativo}
                onCheckedChange={(v) => setFormCategoria((f) => ({ ...f, ativo: v }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {formCategoria.id && (
              <Button
                variant="ghost"
                onClick={() => {
                  mutRemoverCategoria.mutate(formCategoria.id!);
                  setDialogCategoria(false);
                }}
              >
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
            <Button
              onClick={() => mutCategoria.mutate()}
              disabled={!formCategoria.nome.trim() || mutCategoria.isPending}
            >
              {mutCategoria.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogItem} onOpenChange={setDialogItem}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{formItem.id ? "Editar login" : "Novo login"}</DialogTitle>
            <DialogDescription>
              Este login fica guardado e sai automaticamente na próxima venda da categoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={formItem.categoriaId || selecionada}
                onValueChange={(v) => setFormItem((f) => ({ ...f, categoriaId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="it-login">Login / e-mail</Label>
                <Input
                  id="it-login"
                  value={formItem.login}
                  onChange={(e) => setFormItem((f) => ({ ...f, login: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="it-senha">Senha</Label>
                <Input
                  id="it-senha"
                  value={formItem.senha}
                  onChange={(e) => setFormItem((f) => ({ ...f, senha: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="it-titulo">Título (opcional)</Label>
                <Input
                  id="it-titulo"
                  value={formItem.titulo}
                  onChange={(e) => setFormItem((f) => ({ ...f, titulo: e.target.value }))}
                  placeholder="Plano anual"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="it-validade">Validade (opcional)</Label>
                <Input
                  id="it-validade"
                  type="date"
                  value={formItem.validade}
                  onChange={(e) => setFormItem((f) => ({ ...f, validade: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-url">Site / aplicativo</Label>
              <Input
                id="it-url"
                value={formItem.url}
                onChange={(e) => setFormItem((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-extras">Observações enviadas ao cliente</Label>
              <Textarea
                id="it-extras"
                rows={2}
                value={formItem.extras}
                onChange={(e) => setFormItem((f) => ({ ...f, extras: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select
                value={formItem.status}
                onValueChange={(v) =>
                  setFormItem((f) => ({ ...f, status: v as typeof itemVazio.status }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponivel">Disponível</SelectItem>
                  <SelectItem value="reservado">Reservado</SelectItem>
                  <SelectItem value="vendido">Vendido</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => mutItem.mutate()}
              disabled={!formItem.login.trim() || mutItem.isPending}
            >
              {mutItem.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogTeste} onOpenChange={setDialogTeste}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Testar a loja nas conexões</DialogTitle>
            <DialogDescription>
              Enviamos uma loja de teste por cada conexão e mostramos qual aceitou botões e qual
              aceitou o menu em lista.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="num-teste">Número de teste (com DDD)</Label>
              <Input
                id="num-teste"
                value={numeroTeste}
                onChange={(e) => setNumeroTeste(e.target.value)}
                placeholder="5562910002123"
              />
            </div>
            {(mutTeste.data?.resultados ?? []).map((r) => (
              <div key={r.conexao} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {r.conexao} <span className="text-muted-foreground">({r.provedor})</span>
                </p>
                <p className={r.botoes ? "text-emerald-600" : "text-destructive"}>
                  Botões: {r.botoes ? "aceitou" : `recusou — ${r.erroBotoes ?? ""}`}
                </p>
                <p className={r.lista ? "text-emerald-600" : "text-destructive"}>
                  Lista: {r.lista ? "aceitou" : `recusou — ${r.erroLista ?? ""}`}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={() => mutTeste.mutate()}
              disabled={numeroTeste.replace(/\D/g, "").length < 10 || mutTeste.isPending}
            >
              {mutTeste.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Testar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogImport} onOpenChange={setDialogImport}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar vários logins</DialogTitle>
            <DialogDescription>
              Um login por linha, no formato login;senha;observações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={importCategoria || selecionada}
                onValueChange={setImportCategoria}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              rows={8}
              value={importTexto}
              onChange={(e) => setImportTexto(e.target.value)}
              placeholder={"cliente1@email.com;senha123;tela 1\ncliente2@email.com;senha456"}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => mutImportar.mutate()}
              disabled={!importTexto.trim() || mutImportar.isPending}
            >
              {mutImportar.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
