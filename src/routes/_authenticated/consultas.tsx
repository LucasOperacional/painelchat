import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, KeyRound, Database, History, CircleCheck, CircleX } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import {
  CONSULTAS_CATALOGO,
  CONSULTAS_CATEGORIAS,
  type ConsultaProduto,
} from "@/lib/consultas-catalogo";
import { CONSULTAS_SITUACAO, SITUACAO_LABEL } from "@/lib/consultas-status";
import { configuracaoEntrada, validarEntradaConsulta } from "@/lib/consultas-input";
import {
  executarConsulta,
  historicoConsultas,
  removerChaveConsultas,
  salvarChaveConsultas,
  statusConsultas,
} from "@/lib/consultas.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/_authenticated/consultas")({
  head: () => ({
    meta: [
      { title: "Consultas — Dados cadastrais, veiculares e de crédito" },
      {
        name: "description",
        content:
          "Catálogo de consultas de dados cadastrais, veiculares, de crédito, jurídicos e fiscais direto na central de atendimento.",
      },
      { property: "og:title", content: "Consultas na central de atendimento" },
      {
        property: "og:description",
        content: "Faça consultas cadastrais, veiculares, jurídicas e de crédito sem sair do sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsultasPage,
});

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Exemplo e explicação do dado que cada consulta precisa receber. */
const EXEMPLOS: Record<string, { exemplo: string; ajuda: string }> = {
  "CPF": { exemplo: "123.456.789-00", ajuda: "Digite o CPF da pessoa (só os números já servem)." },
  "CNPJ": { exemplo: "12.345.678/0001-90", ajuda: "Digite o CNPJ da empresa (só os números já servem)." },
  "CPF ou CNPJ": {
    exemplo: "123.456.789-00 ou 12.345.678/0001-90",
    ajuda: "Digite o CPF da pessoa ou o CNPJ da empresa.",
  },
  "Placa do veículo": { exemplo: "ABC1D23", ajuda: "Digite a placa do veículo, com ou sem traço." },
  "Chassi": { exemplo: "9BWZZZ377VT004251", ajuda: "Digite o chassi do veículo (17 caracteres)." },
  "Renavam": { exemplo: "00123456789", ajuda: "Digite o número do Renavam do veículo." },
  "Número do motor": { exemplo: "ABC123456", ajuda: "Digite o número do motor do veículo." },
  "Nome completo": { exemplo: "Maria Aparecida da Silva", ajuda: "Digite o nome completo da pessoa." },
  "Nome da empresa": { exemplo: "Padaria Bom Pão LTDA", ajuda: "Digite a razão social ou o nome da empresa." },
  "Telefone": { exemplo: "62996928605", ajuda: "Digite o telefone com DDD." },
  "E-mail": { exemplo: "nome@email.com", ajuda: "Digite o e-mail." },
  "CEP": { exemplo: "74000-000", ajuda: "Digite o CEP do endereço." },
  "Data de nascimento": { exemplo: "1990-05-21", ajuda: "Digite a data de nascimento no formato ano-mês-dia." },
  "Número do RG": { exemplo: "1234567", ajuda: "Digite o número do RG." },
  "Número da OAB": { exemplo: "SP123456", ajuda: "Digite a sigla do estado e o número da OAB." },
  "Número do processo": { exemplo: "0001234-56.2023.8.26.0100", ajuda: "Digite o número do processo." },
  "Termo / Tribunal": { exemplo: "Maria Silva", ajuda: "Digite o nome ou termo que deseja procurar." },
  "ID do laudo": { exemplo: "123456", ajuda: "Digite o número (ID) do laudo." },
};

function pedido(entrada: string) {
  return EXEMPLOS[entrada] ?? { exemplo: entrada, ajuda: `Informe: ${entrada}.` };
}

function situacaoDe(slug: string) {
  return CONSULTAS_SITUACAO[slug] ?? "ok";
}

function IconeSituacao({ slug }: { slug: string }) {
  const situacao = situacaoDe(slug);
  const funcionando = situacao === "ok";
  const Icone = funcionando ? CircleCheck : CircleX;
  return (
    <span className="inline-flex shrink-0" title={SITUACAO_LABEL[situacao]} aria-label={SITUACAO_LABEL[situacao]}>
      <Icone
        aria-hidden
        className={funcionando ? "size-4 text-success" : "size-4 text-destructive"}
      />
    </span>
  );
}

function ConsultasPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");
  const [selecionado, setSelecionado] = useState<ConsultaProduto | null>(null);
  const [valor, setValor] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const [chave, setChave] = useState("");

  const status = useServerFn(statusConsultas);
  const salvar = useServerFn(salvarChaveConsultas);
  const remover = useServerFn(removerChaveConsultas);
  const executar = useServerFn(executarConsulta);
  const historico = useServerFn(historicoConsultas);

  const statusQuery = useQuery({ queryKey: ["consultas-status"], queryFn: () => status() });
  const historicoQuery = useQuery({
    queryKey: ["consultas-historico"],
    queryFn: () => historico(),
  });

  const salvarMutation = useMutation({
    mutationFn: (apiKey: string) => salvar({ data: { apiKey, baseUrl: statusQuery.data?.baseUrl ?? "" } }),
    onSuccess: () => {
      toast.success("Chave de consultas salva.");
      setChave("");
      queryClient.invalidateQueries({ queryKey: ["consultas-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const removerMutation = useMutation({
    mutationFn: () => remover({}),
    onSuccess: () => {
      toast.success("Chave removida.");
      queryClient.invalidateQueries({ queryKey: ["consultas-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
  });

  const consultarMutation = useMutation({
    mutationFn: (input: { produto: string; input: string }) => executar({ data: input }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["consultas-historico"] });
      if (!r.ok) {
        setResultado(r.erro);
        toast.error(r.erro);
        return;
      }
      setResultado(r.resultado);
      toast.success("Consulta concluída.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na consulta."),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return CONSULTAS_CATALOGO.filter((p) => {
      if (categoria !== "todas" && p.categoria !== categoria) return false;
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        p.slug.toLowerCase().includes(termo) ||
        p.categoria.includes(termo)
      );
    });
  }, [busca, categoria]);

  function abrir(produto: ConsultaProduto) {
    setSelecionado(produto);
    setValor("");
    setResultado(null);
  }

  function consultarSelecionada() {
    if (!selecionado) return;
    const validacao = validarEntradaConsulta(selecionado.entrada, valor);
    if (validacao.erro) {
      toast.error(validacao.erro);
      return;
    }
    setValor(validacao.valor);
    consultarMutation.mutate({ produto: selecionado.slug, input: validacao.valor });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:space-y-6 md:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:items-center">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <Database className="size-6 text-primary" /> Consultas
          </h1>
          <p className="text-sm text-muted-foreground">
            {CONSULTAS_CATALOGO.length} consultas de dados cadastrais, veiculares, de crédito,
            jurídicos e fiscais.
          </p>
        </div>
        <Badge className="max-w-28 whitespace-normal text-center sm:max-w-none sm:whitespace-nowrap" variant={statusQuery.data?.configurado ? "secondary" : "destructive"}>
          {statusQuery.data?.configurado ? "Chave cadastrada" : "Chave não cadastrada"}
        </Badge>
      </div>

      <Tabs defaultValue="catalogo">
        <TabsList className="flex w-full gap-0.5">
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          {isAdmin && <TabsTrigger value="config">Configuração</TabsTrigger>}
        </TabsList>

        <TabsContent value="catalogo" className="space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar consulta (CPF, placa, processo...)"
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="-mx-3 flex snap-x gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Button
              size="sm"
              className="shrink-0"
              variant={categoria === "todas" ? "secondary" : "ghost"}
              onClick={() => setCategoria("todas")}
            >
              Todas ({CONSULTAS_CATALOGO.length})
            </Button>
            {CONSULTAS_CATEGORIAS.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={categoria === c ? "secondary" : "ghost"}
                className="shrink-0 capitalize"
                onClick={() => setCategoria(c)}
              >
                {c} ({CONSULTAS_CATALOGO.filter((p) => p.categoria === c).length})
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtrados.map((p) => (
              <Card key={p.slug} className="flex flex-col">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm leading-snug">{p.nome}</CardTitle>
                  <p className="text-xs capitalize text-muted-foreground">{p.categoria}</p>
                </CardHeader>
                <CardContent className="mt-auto space-y-3 px-4 pb-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <IconeSituacao slug={p.slug} />
                    <Badge variant="outline" title={pedido(p.entrada).ajuda}>Informe: {p.entrada}</Badge>
                    {situacaoDe(p.slug) !== "ok" && (
                      <Badge variant="secondary">{SITUACAO_LABEL[situacaoDe(p.slug)]}</Badge>
                    )}
                    {p.pdf && <Badge variant="outline">PDF</Badge>}
                    <span className="ml-auto font-semibold text-primary">{moeda(p.preco)}</span>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => abrir(p)}>
                    Consultar
                  </Button>
                </CardContent>
              </Card>
            ))}
            {filtrados.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma consulta encontrada.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="historico" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Últimas consultas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(historicoQuery.data ?? []).map((h) => (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.produtoNome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {h.entrada} · {new Date(h.criadoEm).toLocaleString("pt-BR")}
                    </p>
                    {h.status !== "ok" && h.erro && (
                      <p className="text-xs text-destructive">{h.erro}</p>
                    )}
                  </div>
                  <Badge variant={h.status === "ok" ? "secondary" : "destructive"}>
                    {h.status === "ok" ? moeda(Number(h.custo)) : "erro"}
                  </Badge>
                  {h.status === "ok" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelecionado({
                          slug: "",
                          nome: h.produtoNome,
                          categoria: h.categoria,
                          preco: Number(h.custo),
                          entrada: h.entrada,
                          pdf: false,
                        });
                        setValor(h.entrada);
                        setResultado(h.resultado);
                      }}
                    >
                      Ver
                    </Button>
                  )}
                </div>
              ))}
              {(historicoQuery.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma consulta feita ainda.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="config" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4" /> Chave da API de consultas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Gere a chave no portal em Chaves de API e cole aqui. Ela fica guardada em área
                  protegida e nunca aparece de volta na tela.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="chave">Chave</Label>
                  <Input
                    id="chave"
                    placeholder="rbt_live_..."
                    value={chave}
                    onChange={(e) => setChave(e.target.value)}
                  />
                  {statusQuery.data?.preview && (
                    <p className="text-xs text-muted-foreground">
                      Chave atual: {statusQuery.data.preview}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => salvarMutation.mutate(chave)}
                    disabled={salvarMutation.isPending || chave.trim().length < 10}
                  >
                    {salvarMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Salvar chave
                  </Button>
                  {statusQuery.data?.configurado && (
                    <Button
                      variant="outline"
                      onClick={() => removerMutation.mutate()}
                      disabled={removerMutation.isPending}
                    >
                      Remover
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={Boolean(selecionado)} onOpenChange={(o) => !o && setSelecionado(null)}>
          <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selecionado?.slug && <IconeSituacao slug={selecionado.slug} />}
              <span className="min-w-0">{selecionado?.nome}</span>
            </DialogTitle>
            <DialogDescription>
              O que informar: {selecionado?.entrada || "dado do produto"}
              {selecionado?.slug ? ` · ${moeda(selecionado.preco)} por consulta` : ""}
              {selecionado?.slug && situacaoDe(selecionado.slug) !== "ok"
                ? ` · ${SITUACAO_LABEL[situacaoDe(selecionado.slug)]}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {selecionado?.slug && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="valor-consulta">
                  Dado a consultar — {selecionado.entrada}
                </Label>
                <Input
                  id="valor-consulta"
                  placeholder={`Ex.: ${pedido(selecionado.entrada).exemplo}`}
                  value={valor}
                   inputMode={configuracaoEntrada(selecionado.entrada).inputMode}
                   maxLength={configuracaoEntrada(selecionado.entrada).maxLength}
                  onChange={(e) => setValor(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === "Enter") consultarSelecionada();
                   }}
                />
                <p className="text-xs text-muted-foreground">
                  {pedido(selecionado.entrada).ajuda}
                </p>
              </div>
              <Button
                className="w-full"
                disabled={consultarMutation.isPending || valor.trim().length === 0}
                onClick={consultarSelecionada}
              >
                {consultarMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Consultar agora
              </Button>
            </div>
          )}

          {resultado != null && (
            <ScrollArea className="max-h-80 rounded-lg border border-border/60 bg-muted/40 p-3">
              <pre className="whitespace-pre-wrap break-words text-xs">{resultado}</pre>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
