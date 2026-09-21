import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Send,
  Trash2,
  History,
} from "lucide-react";
import { toast } from "sonner";

import { fetchConnections } from "@/lib/central";
import {
  enviarCobrancaAgora,
  historicoCobrancas,
  listarAcessos,
  listarCobrancas,
  removerAcesso,
  removerCobranca,
  salvarAcesso,
  salvarCobranca,
} from "@/lib/cobrancas.functions";
import { useMe } from "@/hooks/use-session";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  head: () => ({
    meta: [
      { title: "Cobranças e acessos — envio automático de boletos" },
      {
        name: "description",
        content:
          "Guarde acessos e vencimentos, agende avisos de cobrança e envie boletos pelo WhatsApp automaticamente.",
      },
      { property: "og:title", content: "Cobranças e acessos — envio automático de boletos" },
      {
        property: "og:description",
        content:
          "Guarde acessos e vencimentos, agende avisos de cobrança e envie boletos pelo WhatsApp automaticamente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CobrancasPage,
});

type FormCobranca = {
  id: string | null;
  clienteNome: string;
  telefone: string;
  descricao: string;
  valor: string;
  vencimento: string;
  boletoUrl: string;
  linhaDigitavel: string;
  mensagem: string;
  diasAntes: string;
  horaEnvio: string;
  recorrencia: "unica" | "mensal";
  deviceId: string | null;
  ativo: boolean;
};

const hoje = () => new Date().toISOString().slice(0, 10);

const cobrancaVazia = (): FormCobranca => ({
  id: null,
  clienteNome: "",
  telefone: "",
  descricao: "",
  valor: "",
  vencimento: hoje(),
  boletoUrl: "",
  linhaDigitavel: "",
  mensagem: "",
  diasAntes: "3",
  horaEnvio: "09:00",
  recorrencia: "unica",
  deviceId: null,
  ativo: true,
});

type FormAcesso = {
  id: string | null;
  titulo: string;
  cliente: string;
  categoria: string;
  url: string;
  login: string;
  senha: string;
  vencimento: string;
  lembreteDias: string;
  observacoes: string;
};

const acessoVazio = (): FormAcesso => ({
  id: null,
  titulo: "",
  cliente: "",
  categoria: "geral",
  url: "",
  login: "",
  senha: "",
  vencimento: "",
  lembreteDias: "5",
  observacoes: "",
});

function dataBr(iso: string) {
  if (!iso) return "—";
  const data = iso.length > 10 ? new Date(iso) : new Date(`${iso}T12:00:00`);
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(iso.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CobrancasPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();

  const carregarCobrancas = useServerFn(listarCobrancas);
  const carregarAcessos = useServerFn(listarAcessos);
  const carregarHistorico = useServerFn(historicoCobrancas);
  const gravarCobranca = useServerFn(salvarCobranca);
  const apagarCobranca = useServerFn(removerCobranca);
  const enviarAgora = useServerFn(enviarCobrancaAgora);
  const gravarAcesso = useServerFn(salvarAcesso);
  const apagarAcesso = useServerFn(removerAcesso);

  const cobrancas = useQuery({ queryKey: ["cobrancas"], queryFn: () => carregarCobrancas({}) });
  const acessos = useQuery({
    queryKey: ["cobranca-acessos"],
    queryFn: () => carregarAcessos({}),
    enabled: isAdmin,
  });
  const historico = useQuery({
    queryKey: ["cobranca-historico"],
    queryFn: () => carregarHistorico({}),
  });
  const conexoes = useQuery({ queryKey: ["connections"], queryFn: fetchConnections });

  const [form, setForm] = useState<FormCobranca>(cobrancaVazia());
  const [abrirCobranca, setAbrirCobranca] = useState(false);
  const [formAcesso, setFormAcesso] = useState<FormAcesso>(acessoVazio());
  const [abrirAcesso, setAbrirAcesso] = useState(false);
  const [senhasVisiveis, setSenhasVisiveis] = useState<Record<string, boolean>>({});

  const salvandoCobranca = useMutation({
    mutationFn: () =>
      gravarCobranca({
        data: {
          id: form.id,
          clienteNome: form.clienteNome,
          telefone: form.telefone,
          descricao: form.descricao,
          valor: Number(form.valor.replace(",", ".") || 0),
          vencimento: form.vencimento,
          boletoUrl: form.boletoUrl,
          linhaDigitavel: form.linhaDigitavel,
          mensagem: form.mensagem,
          diasAntes: Number(form.diasAntes || 0),
          horaEnvio: form.horaEnvio || "09:00",
          recorrencia: form.recorrencia,
          deviceId: form.deviceId,
          ativo: form.ativo,
        },
      }),
    onSuccess: () => {
      toast.success("Cobrança salva e agendada.");
      setAbrirCobranca(false);
      setForm(cobrancaVazia());
      queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvandoAcesso = useMutation({
    mutationFn: () =>
      gravarAcesso({
        data: {
          id: formAcesso.id,
          titulo: formAcesso.titulo,
          cliente: formAcesso.cliente,
          categoria: formAcesso.categoria,
          url: formAcesso.url,
          login: formAcesso.login,
          senha: formAcesso.senha,
          vencimento: formAcesso.vencimento || null,
          lembreteDias: Number(formAcesso.lembreteDias || 0),
          observacoes: formAcesso.observacoes,
        },
      }),
    onSuccess: () => {
      toast.success("Acesso salvo.");
      setAbrirAcesso(false);
      setFormAcesso(acessoVazio());
      queryClient.invalidateQueries({ queryKey: ["cobranca-acessos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviando = useMutation({
    mutationFn: (id: string) => enviarAgora({ data: { id } }),
    onSuccess: (r) => {
      toast.success(r.detalhe);
      queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
      queryClient.invalidateQueries({ queryKey: ["cobranca-historico"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluindo = useMutation({
    mutationFn: (id: string) => apagarCobranca({ data: { id } }),
    onSuccess: () => {
      toast.success("Cobrança removida.");
      queryClient.invalidateQueries({ queryKey: ["cobrancas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluindoAcesso = useMutation({
    mutationFn: (id: string) => apagarAcesso({ data: { id } }),
    onSuccess: () => {
      toast.success("Acesso removido.");
      queryClient.invalidateQueries({ queryKey: ["cobranca-acessos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomesPorId = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const c of cobrancas.data ?? []) mapa[c.id] = c.clienteNome;
    return mapa;
  }, [cobrancas.data]);

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <header>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold sm:text-2xl">
            <CalendarClock className="size-6" /> Cobranças e acessos
          </h1>
          <p className="text-sm text-muted-foreground">
            Guarde acessos com data de vencimento e programe o envio automático de cobranças e
            boletos pelo WhatsApp.
          </p>
        </div>
      </header>

      <Tabs defaultValue="cobrancas">
        <TabsList className="w-full">
          <TabsTrigger value="cobrancas">Cobranças agendadas</TabsTrigger>
          {isAdmin ? <TabsTrigger value="acessos">Acessos salvos</TabsTrigger> : null}
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="cobrancas" className="space-y-3">
          <div className="flex justify-stretch sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                setForm(cobrancaVazia());
                setAbrirCobranca(true);
              }}
            >
              <Plus className="mr-1 size-4" /> Nova cobrança
            </Button>
          </div>

          {(cobrancas.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança cadastrada ainda.</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(cobrancas.data ?? []).map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span className="truncate">{c.clienteNome}</span>
                    <Badge variant={c.ativo ? "default" : "secondary"}>
                      {c.ativo ? "Agendada" : "Pausada"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                  <CardContent className="space-y-2 px-4 pb-4 text-sm">
                  <p className="text-muted-foreground">{c.descricao || "Sem descrição"}</p>
                  <p>
                    <strong>{moeda(c.valor)}</strong> · vence {dataBr(c.vencimento)}
                  </p>
                  <p className="text-muted-foreground">
                    Aviso {c.diasAntes} dia(s) antes, às {c.horaEnvio} ·{" "}
                    {c.recorrencia === "mensal" ? "todo mês" : "uma vez"}
                  </p>
                  <p className="text-muted-foreground">Próximo envio: {dataBr(c.proximoEnvio)}</p>
                  {c.status ? (
                    <p className="text-xs text-muted-foreground">Último: {c.status}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={enviando.isPending}
                      onClick={() => enviando.mutate(c.id)}
                    >
                      {enviando.isPending ? (
                        <Loader2 className="mr-1 size-4 animate-spin" />
                      ) : (
                        <Send className="mr-1 size-4" />
                      )}
                      Enviar agora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setForm({
                          id: c.id,
                          clienteNome: c.clienteNome,
                          telefone: c.telefone,
                          descricao: c.descricao,
                          valor: String(c.valor),
                          vencimento: c.vencimento,
                          boletoUrl: c.boletoUrl,
                          linhaDigitavel: c.linhaDigitavel,
                          mensagem: c.mensagem,
                          diasAntes: String(c.diasAntes),
                          horaEnvio: c.horaEnvio,
                          recorrencia: c.recorrencia === "mensal" ? "mensal" : "unica",
                          deviceId: c.deviceId,
                          ativo: c.ativo,
                        });
                        setAbrirCobranca(true);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => excluindo.mutate(c.id)}
                      aria-label="Remover cobrança"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="acessos" className="space-y-3">
            <div className="flex justify-stretch sm:justify-end">
              <Button
                onClick={() => {
                  setFormAcesso(acessoVazio());
                  setAbrirAcesso(true);
                }}
              >
                <Plus className="mr-1 size-4" /> Novo acesso
              </Button>
            </div>

            {(acessos.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum acesso salvo ainda.</p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(acessos.data ?? []).map((a) => (
                <Card key={a.id}>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="truncate">
                        <KeyRound className="mr-1 inline size-4" />
                        {a.titulo}
                      </span>
                      {a.vencimento ? (
                        <Badge variant="secondary">{dataBr(a.vencimento)}</Badge>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {a.cliente ? <p className="text-muted-foreground">{a.cliente}</p> : null}
                    {a.url ? (
                      <a
                        className="block truncate text-primary underline"
                        href={a.url}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {a.url}
                      </a>
                    ) : null}
                    <p>Login: {a.login || "—"}</p>
                    <p className="flex items-center gap-2">
                      Senha: {senhasVisiveis[a.id] ? a.senha || "—" : "••••••••"}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Mostrar ou esconder a senha"
                        onClick={() =>
                          setSenhasVisiveis((s) => ({ ...s, [a.id]: !s[a.id] }))
                        }
                      >
                        {senhasVisiveis[a.id] ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </Button>
                    </p>
                    {a.observacoes ? (
                      <p className="text-xs text-muted-foreground">{a.observacoes}</p>
                    ) : null}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                          setFormAcesso({
                            id: a.id,
                            titulo: a.titulo,
                            cliente: a.cliente,
                            categoria: a.categoria,
                            url: a.url,
                            login: a.login,
                            senha: a.senha,
                            vencimento: a.vencimento,
                            lembreteDias: String(a.lembreteDias),
                            observacoes: a.observacoes,
                          });
                          setAbrirAcesso(true);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Remover acesso"
                        onClick={() => excluindoAcesso.mutate(a.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ) : null}

        <TabsContent value="historico" className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <History className="size-4" /> Últimos envios
          </h2>
          {(historico.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio registrado ainda.</p>
          ) : null}
          <div className="space-y-2">
            {(historico.data ?? []).map((h) => (
              <Card key={h.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    {nomesPorId[h.cobrancaId] ?? "Cobrança"} ·{" "}
                    {h.tipo === "boleto" ? "aviso com boleto" : "aviso"}
                  </span>
                  <span className="text-muted-foreground">{h.detalhe}</span>
                  <Badge variant={h.ok ? "default" : "destructive"}>
                    {h.ok ? "enviado" : "falhou"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{dataBr(h.criadoEm)}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={abrirCobranca} onOpenChange={setAbrirCobranca}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cobrança" : "Nova cobrança"}</DialogTitle>
            <DialogDescription>
              O aviso sai sozinho na data escolhida. Use {"{cliente}"}, {"{valor}"},{" "}
              {"{vencimento}"}, {"{descricao}"} e {"{link}"} na mensagem.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cliente">Cliente</Label>
              <Input
                id="cliente"
                value={form.clienteNome}
                onChange={(e) => setForm({ ...form, clienteNome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="telefone">WhatsApp (com DDD)</Label>
              <Input
                id="telefone"
                value={form.telefone}
                placeholder="5562999999999"
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input
                id="valor"
                value={form.valor}
                inputMode="decimal"
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="vencimento">Vencimento</Label>
              <Input
                id="vencimento"
                type="date"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dias">Avisar quantos dias antes</Label>
              <Input
                id="dias"
                type="number"
                min={0}
                value={form.diasAntes}
                onChange={(e) => setForm({ ...form, diasAntes: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hora">Horário do envio</Label>
              <Input
                id="hora"
                type="time"
                value={form.horaEnvio}
                onChange={(e) => setForm({ ...form, horaEnvio: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recorrencia">Repetição</Label>
              <select
                id="recorrencia"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.recorrencia}
                onChange={(e) =>
                  setForm({ ...form, recorrencia: e.target.value === "mensal" ? "mensal" : "unica" })
                }
              >
                <option value="unica">Uma vez</option>
                <option value="mensal">Todo mês</option>
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="boleto">Link do boleto (PDF ou imagem)</Label>
              <Input
                id="boleto"
                value={form.boletoUrl}
                placeholder="https://..."
                onChange={(e) => setForm({ ...form, boletoUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="linha">Linha digitável (opcional)</Label>
              <Input
                id="linha"
                value={form.linhaDigitavel}
                onChange={(e) => setForm({ ...form, linhaDigitavel: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea
                id="mensagem"
                rows={4}
                value={form.mensagem}
                placeholder="Olá {cliente}! Sua cobrança de {descricao} no valor de {valor} vence em {vencimento}."
                onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="aparelho">Aparelho de envio</Label>
              <select
                id="aparelho"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.deviceId ?? ""}
                onChange={(e) => setForm({ ...form, deviceId: e.target.value || null })}
              >
                <option value="">Aparelho padrão</option>
                {(conexoes.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label || d.instance_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label htmlFor="ativo">Envio automático ligado</Label>
            </div>
          </div>
          <Button
            className="mt-2 w-full sm:w-auto"
            disabled={salvandoCobranca.isPending}
            onClick={() => salvandoCobranca.mutate()}
          >
            {salvandoCobranca.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Salvar cobrança
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={abrirAcesso} onOpenChange={setAbrirAcesso}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formAcesso.id ? "Editar acesso" : "Novo acesso"}</DialogTitle>
            <DialogDescription>
              Guarde o site, o login, a senha e a data de vencimento do serviço.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="a-titulo">Nome do acesso</Label>
              <Input
                id="a-titulo"
                value={formAcesso.titulo}
                onChange={(e) => setFormAcesso({ ...formAcesso, titulo: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-cliente">Cliente</Label>
              <Input
                id="a-cliente"
                value={formAcesso.cliente}
                onChange={(e) => setFormAcesso({ ...formAcesso, cliente: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="a-url">Endereço do site</Label>
              <Input
                id="a-url"
                value={formAcesso.url}
                placeholder="https://..."
                onChange={(e) => setFormAcesso({ ...formAcesso, url: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-login">Login</Label>
              <Input
                id="a-login"
                value={formAcesso.login}
                onChange={(e) => setFormAcesso({ ...formAcesso, login: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-senha">Senha</Label>
              <Input
                id="a-senha"
                value={formAcesso.senha}
                onChange={(e) => setFormAcesso({ ...formAcesso, senha: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-venc">Vencimento</Label>
              <Input
                id="a-venc"
                type="date"
                value={formAcesso.vencimento}
                onChange={(e) => setFormAcesso({ ...formAcesso, vencimento: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="a-lembrete">Lembrar dias antes</Label>
              <Input
                id="a-lembrete"
                type="number"
                min={0}
                value={formAcesso.lembreteDias}
                onChange={(e) => setFormAcesso({ ...formAcesso, lembreteDias: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="a-obs">Observações</Label>
              <Textarea
                id="a-obs"
                rows={3}
                value={formAcesso.observacoes}
                onChange={(e) => setFormAcesso({ ...formAcesso, observacoes: e.target.value })}
              />
            </div>
          </div>
          <Button
            className="mt-2 w-full sm:w-auto"
            disabled={salvandoAcesso.isPending}
            onClick={() => salvandoAcesso.mutate()}
          >
            {salvandoAcesso.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            Salvar acesso
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
