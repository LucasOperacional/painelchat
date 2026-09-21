import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Receipt, RefreshCw, Ban, FileText, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  atualizarNota,
  cancelarNota,
  criarClienteNfse,
  emitirNota,
  listarClientesNfse,
  listarNotas,
  listarServicosNfse,
  removerTokenNfse,
  salvarTokenNfse,
  statusNfse,
} from "@/lib/nfse.functions";
import { useMe } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/notas")({
  head: () => ({
    meta: [
      { title: "Notas fiscais de serviço — Central" },
      {
        name: "description",
        content:
          "Emita, consulte e cancele notas fiscais de serviço direto da central de atendimento, integrada ao GerandoNotaFácil.",
      },
      { property: "og:title", content: "Notas fiscais de serviço — Central" },
      {
        property: "og:description",
        content: "Emissão de NFS-e, clientes, serviços e acompanhamento da cota do plano.",
      },
    ],
  }),
  component: NotasPage,
});

function money(value: number | null | undefined) {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateBr(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function NotasPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();

  const fetchStatus = useServerFn(statusNfse);
  const saveToken = useServerFn(salvarTokenNfse);
  const clearToken = useServerFn(removerTokenNfse);
  const fetchNotas = useServerFn(listarNotas);
  const fetchClientes = useServerFn(listarClientesNfse);
  const fetchServicos = useServerFn(listarServicosNfse);
  const emitir = useServerFn(emitirNota);
  const cancelar = useServerFn(cancelarNota);
  const atualizar = useServerFn(atualizarNota);
  const novoCliente = useServerFn(criarClienteNfse);

  const status = useQuery({ queryKey: ["nfse-status"], queryFn: () => fetchStatus() });
  const configurado = status.data?.configurado === true && !status.data.erro;

  const notas = useQuery({
    queryKey: ["nfse-notas"],
    queryFn: () => fetchNotas(),
    enabled: configurado,
  });
  const clientes = useQuery({
    queryKey: ["nfse-clientes"],
    queryFn: () => fetchClientes(),
    enabled: configurado,
  });
  const servicos = useQuery({
    queryKey: ["nfse-servicos"],
    queryFn: () => fetchServicos(),
    enabled: configurado,
  });

  const [token, setToken] = useState("");

  const salvar = useMutation({
    mutationFn: () => saveToken({ data: { token } }),
    onSuccess: () => {
      setToken("");
      toast.success("Token salvo. Consultando a empresa...");
      queryClient.invalidateQueries({ queryKey: ["nfse-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: () => clearToken(),
    onSuccess: () => {
      toast.success("Token removido.");
      queryClient.invalidateQueries({ queryKey: ["nfse-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Emissão
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteDocumento, setClienteDocumento] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [servicoId, setServicoId] = useState("");

  const emitirMut = useMutation({
    mutationFn: () => {
      const numero = Number(valor.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(numero) || numero <= 0) {
        throw new Error("Informe um valor maior que zero.");
      }
      return emitir({
        data: {
          valor: Number(numero.toFixed(2)),
          ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
          ...(clienteId ? { clienteId } : {}),
          ...(clienteNome.trim() ? { clienteNome: clienteNome.trim() } : {}),
          ...(clienteDocumento.trim() ? { clienteDocumento: clienteDocumento.trim() } : {}),
          ...(clienteEmail.trim() ? { clienteEmail: clienteEmail.trim() } : {}),
          ...(servicoId ? { servicoId } : {}),
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        res.status === "emitida"
          ? `Nota ${res.numero_nfse ?? ""} emitida.`
          : "Nota enviada, aguardando a prefeitura.",
      );
      setValor("");
      setDescricao("");
      queryClient.invalidateQueries({ queryKey: ["nfse-notas"] });
      queryClient.invalidateQueries({ queryKey: ["nfse-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelarMut = useMutation({
    mutationFn: (id: string) => cancelar({ data: { id } }),
    onSuccess: () => {
      toast.success("Pedido de cancelamento enviado.");
      queryClient.invalidateQueries({ queryKey: ["nfse-notas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizarMut = useMutation({
    mutationFn: (id: string) => atualizar({ data: { id } }),
    onSuccess: () => {
      toast.success("Situação atualizada.");
      queryClient.invalidateQueries({ queryKey: ["nfse-notas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Novo cliente
  const [novoNome, setNovoNome] = useState("");
  const [novoDoc, setNovoDoc] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novoCidade, setNovoCidade] = useState("");
  const [novoUf, setNovoUf] = useState("");

  const clienteMut = useMutation({
    mutationFn: () =>
      novoCliente({
        data: {
          nome: novoNome,
          documento: novoDoc,
          ...(novoEmail.trim() ? { email: novoEmail.trim() } : {}),
          ...(novoCidade.trim() ? { cidade: novoCidade.trim() } : {}),
          ...(novoUf.trim() ? { uf: novoUf.trim().toUpperCase() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Cliente cadastrado.");
      setNovoNome("");
      setNovoDoc("");
      setNovoEmail("");
      setNovoCidade("");
      setNovoUf("");
      queryClient.invalidateQueries({ queryKey: ["nfse-clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const empresa = status.data?.empresa ?? null;
  const quota = status.data?.quota ?? null;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Receipt className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Notas fiscais de serviço</h1>
          <p className="text-sm text-muted-foreground">
            Emissão e acompanhamento de NFS-e pela GerandoNotaFácil.
          </p>
        </div>
      </header>

      {status.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Verificando a integração...
        </p>
      )}

      {status.data && !status.data.configurado && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          Falta cadastrar o token da GerandoNotaFácil. Gere o token no painel da conta e salve
          abaixo — ele define se as notas saem em produção ou em teste.
        </div>
      )}

      {status.data?.erro && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {status.data.erro}
        </div>
      )}

      {isAdmin && (
        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="token">Token da GerandoNotaFácil</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={status.data?.configurado ? "Token salvo — digite para trocar" : "gnf_..."}
              autoComplete="off"
            />
          </div>
          <Button onClick={() => salvar.mutate()} disabled={token.length < 10 || salvar.isPending}>
            {salvar.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar
          </Button>
          {status.data?.configurado && (
            <Button
              variant="outline"
              onClick={() => remover.mutate()}
              disabled={remover.isPending}
            >
              <Trash2 className="size-4" />
              Remover
            </Button>
          )}
        </div>
      )}

      {empresa && (
        <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Empresa" value={text(empresa["razao_social"] ?? empresa["nome"])} />
          <Info label="CNPJ" value={text(empresa["cnpj"])} />
          <Info label="Município" value={text(empresa["municipio"] ?? empresa["cidade"])} />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ambiente</p>
            <Badge variant={empresa["sandbox"] ? "secondary" : "default"}>
              {empresa["sandbox"] ? "Teste (homologação)" : text(empresa["ambiente"] ?? "Produção")}
            </Badge>
          </div>
          {quota && (
            <>
              <Info label="Notas usadas no mês" value={text(quota["used"] ?? quota["usado"])} />
              <Info label="Limite do plano" value={text(quota["limit"] ?? quota["limite"])} />
              <Info
                label="Restantes"
                value={text(quota["remaining"] ?? quota["restante"])}
              />
              <Info label="Plano" value={text(quota["plan"] ?? quota["plano"])} />
            </>
          )}
        </div>
      )}

      <Tabs defaultValue="emitir">
        <TabsList>
          <TabsTrigger value="emitir">Emitir nota</TabsTrigger>
          <TabsTrigger value="notas">Notas emitidas</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="servicos">Serviços</TabsTrigger>
        </TabsList>

        <TabsContent value="emitir">
          <form
            className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              emitirMut.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="valor">Valor do serviço (R$)</Label>
              <Input
                id="valor"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1500,00"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <Label>Cliente cadastrado</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(clientes.data?.clientes ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome ?? "Sem nome"} — {c.documento ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente-nome">Ou nome do cliente</Label>
              <Input
                id="cliente-nome"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Nome ou razão social"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente-doc">CPF ou CNPJ do cliente</Label>
              <Input
                id="cliente-doc"
                value={clienteDocumento}
                onChange={(e) => setClienteDocumento(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cliente-email">E-mail do cliente</Label>
              <Input
                id="cliente-email"
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
                placeholder="cliente@email.com"
                type="email"
              />
            </div>

            <div className="space-y-2">
              <Label>Serviço cadastrado</Label>
              <Select value={servicoId} onValueChange={setServicoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar (opcional)" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(servicos.data?.servicos ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.descricao ?? s.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="descricao">Descrição do serviço</Label>
              <Textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Assessoria previdenciária referente ao mês de janeiro."
                rows={3}
              />
            </div>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={!configurado || emitirMut.isPending}>
                {emitirMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                Emitir nota
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="notas" className="space-y-3">
          {notas.isLoading && (
            <p className="text-sm text-muted-foreground">Carregando notas...</p>
          )}
          {(notas.data?.notas ?? []).length === 0 && !notas.isLoading && (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              Nenhuma nota emitida ainda.
            </p>
          )}
          {(notas.data?.notas ?? []).map((n) => (
            <div key={n.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {n.numero_nfse ? `NFS-e ${n.numero_nfse}` : "NFS-e sem número"} ·{" "}
                    {money(n.valor)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {n.cliente_nome ?? "Cliente não informado"} ·{" "}
                    {dateBr(n.emitida_em ?? n.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{n.status}</Badge>
                  {n.pdf_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={n.pdf_url} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => atualizarMut.mutate(n.id)}
                    disabled={atualizarMut.isPending}
                  >
                    <RefreshCw className="size-4" />
                    Atualizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelarMut.mutate(n.id)}
                    disabled={cancelarMut.isPending}
                  >
                    <Ban className="size-4" />
                    Cancelar
                  </Button>
                </div>
              </div>
              {n.servico_descricao && (
                <p className="mt-2 text-xs text-muted-foreground">{n.servico_descricao}</p>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="clientes" className="space-y-4">
          <form
            className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              clienteMut.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="novo-nome">Nome ou razão social</Label>
              <Input
                id="novo-nome"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-doc">CPF ou CNPJ</Label>
              <Input
                id="novo-doc"
                value={novoDoc}
                onChange={(e) => setNovoDoc(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="novo-email">E-mail</Label>
              <Input
                id="novo-email"
                type="email"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <div className="space-y-2">
                <Label htmlFor="novo-cidade">Cidade</Label>
                <Input
                  id="novo-cidade"
                  value={novoCidade}
                  onChange={(e) => setNovoCidade(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="novo-uf">UF</Label>
                <Input
                  id="novo-uf"
                  maxLength={2}
                  value={novoUf}
                  onChange={(e) => setNovoUf(e.target.value)}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={!configurado || novoNome.length < 2 || clienteMut.isPending}
              >
                {clienteMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Cadastrar cliente
              </Button>
            </div>
          </form>

          <div className="space-y-2">
            {(clientes.data?.clientes ?? []).map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm"
              >
                <span className="font-medium">{c.nome ?? "Sem nome"}</span>
                <span className="text-muted-foreground">
                  {c.documento ?? "—"} · {c.cidade ?? "—"}
                  {c.uf ? `/${c.uf}` : ""}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="servicos" className="space-y-2">
          {(servicos.data?.servicos ?? []).length === 0 && (
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              Nenhum serviço cadastrado na conta.
            </p>
          )}
          {(servicos.data?.servicos ?? []).map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm"
            >
              <span className="font-medium">{s.descricao ?? s.id}</span>
              <span className="text-muted-foreground">
                {s.codigo_tributacao_nacional ?? "—"}
                {typeof s.aliquota_iss === "number" ? ` · ISS ${s.aliquota_iss}%` : ""}
              </span>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
