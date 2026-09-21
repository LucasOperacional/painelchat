import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Send,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  getBankOverview,
  refreshBankTransactions,
  sendPixPayout,
} from "@/lib/bank.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/banco")({
  head: () => ({
    meta: [
      { title: "Banco — Central de Atendimento" },
      {
        name: "description",
        content:
          "Carteira da central: saldo, Pix recebidos e envio de Pix para qualquer chave.",
      },
      { property: "og:title", content: "Banco — Central de Atendimento" },
      {
        property: "og:description",
        content: "Saldo da carteira, entradas por Pix e envio de pagamentos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BancoPage,
});

const KEY_TYPES = [
  { value: "CPF", label: "CPF" },
  { value: "CNPJ", label: "CNPJ" },
  { value: "EMAIL", label: "E-mail" },
  { value: "PHONE", label: "Telefone" },
  { value: "RANDOM", label: "Chave aleatória" },
] as const;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_STYLE: Record<string, string> = {
  pago: "bg-emerald-500/15 text-emerald-600",
  processando: "bg-amber-500/15 text-amber-600",
  pendente: "bg-muted text-muted-foreground",
  falhou: "bg-destructive/15 text-destructive",
};

function BancoPage() {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getBankOverview);
  const sendPayout = useServerFn(sendPixPayout);
  const refreshAll = useServerFn(refreshBankTransactions);

  const [amount, setAmount] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<(typeof KEY_TYPES)[number]["value"]>("CPF");
  const [receiverName, setReceiverName] = useState("");
  const [description, setDescription] = useState("");

  const overview = useQuery({
    queryKey: ["bank-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 20_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bank-overview"] });

  const payout = useMutation({
    mutationFn: (input: {
      amount: number;
      pixKey: string;
      pixKeyType: (typeof KEY_TYPES)[number]["value"];
      receiverName: string;
      description: string;
    }) => sendPayout({ data: input }),
    onSuccess: () => {
      toast.success("Pix enviado para processamento.");
      setAmount("");
      setPixKey("");
      setReceiverName("");
      setDescription("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refresh = useMutation({
    mutationFn: () => refreshAll(),
    onSuccess: (res) => {
      toast.success(
        res.updated ? `${res.updated} pagamento(s) atualizado(s).` : "Tudo em dia.",
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = overview.data;
  const isAdmin = !!data?.isAdmin;

  const submit = () => {
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    if (pixKey.trim().length < 3) {
      toast.error("Informe a chave Pix do recebedor.");
      return;
    }
    payout.mutate({
      amount: value,
      pixKey: pixKey.trim(),
      pixKeyType,
      receiverName: receiverName.trim(),
      description: description.trim() || "Pagamento",
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Wallet className="h-6 w-6 text-primary" /> Banco
          </h1>
          <p className="text-sm text-muted-foreground">
            Saldo da carteira, Pix recebidos e envio de pagamentos.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={!isAdmin || refresh.isPending}
        >
          {refresh.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Saldo na carteira</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {brl(data?.balance ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recebido</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-emerald-600">
            {brl(data?.totalIn ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Enviado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {brl(data?.totalOut ?? 0)}
          </CardContent>
        </Card>
      </div>

      {data?.gatewayBalance !== null && data?.gatewayBalance !== undefined ? (
        <p className="text-sm text-muted-foreground">
          Saldo disponível na conta de pagamentos: <strong>{brl(data.gatewayBalance)}</strong>
        </p>
      ) : data?.gatewayError ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível consultar o saldo da conta de pagamentos: {data.gatewayError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> Enviar Pix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isAdmin ? (
            <p className="text-sm text-muted-foreground">
              Somente administradores podem enviar Pix.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Valor (R$)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo da chave</Label>
                  <Select
                    value={pixKeyType}
                    onValueChange={(v) => setPixKeyType(v as typeof pixKeyType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KEY_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Chave Pix</Label>
                  <Input
                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nome do recebedor (opcional)</Label>
                  <Input
                    placeholder="Para identificar no histórico"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Pagamento de fornecedor"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={submit} disabled={payout.isPending}>
                {payout.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar Pix
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {overview.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (data?.transactions.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
          ) : (
            data?.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-[8px] border border-border p-3"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    tx.direction === "in"
                      ? "bg-emerald-500/15 text-emerald-600"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {tx.direction === "in" ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {tx.description || (tx.direction === "in" ? "Pix recebido" : "Pix enviado")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tx.receiver_name ? `${tx.receiver_name} · ` : ""}
                    {tx.pix_key || "—"} ·{" "}
                    {new Date(tx.created_at).toLocaleString("pt-BR")}
                  </p>
                  {tx.error_message ? (
                    <p className="truncate text-xs text-destructive">{tx.error_message}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      tx.direction === "in" ? "text-emerald-600" : ""
                    }`}
                  >
                    {tx.direction === "in" ? "+" : "−"} {brl(tx.amount)}
                  </p>
                  <Badge
                    variant="secondary"
                    className={STATUS_STYLE[tx.status] ?? "bg-muted text-muted-foreground"}
                  >
                    {tx.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
