import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Inbox, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import {
  mensagensNaoEntregues,
  reprocessarAviso,
  reprocessarTodos,
} from "@/lib/mensagens-pendentes.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/mensagens-pendentes")({
  head: () => ({
    meta: [
      { title: "Mensagens pendentes — Central" },
      {
        name: "description",
        content:
          "Veja os avisos que chegaram pelas APIs do WhatsApp mas ainda não apareceram no chat, com data e hora de chegada.",
      },
      { property: "og:title", content: "Mensagens pendentes — Central" },
      {
        property: "og:description",
        content: "Avisos recebidos das APIs que não geraram mensagem no atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MensagensPendentesPage,
});

function quando(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const JANELAS = [
  { horas: 6, label: "6 horas" },
  { horas: 24, label: "24 horas" },
  { horas: 72, label: "3 dias" },
  { horas: 168, label: "7 dias" },
];

function MensagensPendentesPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();
  const listarFn = useServerFn(mensagensNaoEntregues);
  const reprocessarFn = useServerFn(reprocessarAviso);
  const reprocessarTodosFn = useServerFn(reprocessarTodos);
  const [horas, setHoras] = useState(24);

  const lista = useQuery({
    queryKey: ["mensagens-pendentes", horas],
    queryFn: () => listarFn({ data: { horas } }),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const reprocessar = useMutation({
    mutationFn: (id: string) => reprocessarFn({ data: { id } }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](
        r.ok ? "Aviso reenviado para o chat." : `Não foi possível: ${r.detalhe}`,
      );
      queryClient.invalidateQueries({ queryKey: ["mensagens-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reenviarTudo = useMutation({
    mutationFn: () => reprocessarTodosFn({ data: { horas } }),
    onSuccess: (r) => {
      if (r.total === 0) toast.info("Não havia mensagens pendentes.");
      else
        toast.success(
          `${r.enviados} de ${r.processados} mensagens reenviadas para o chat.` +
            (r.falhas ? ` ${r.falhas} falharam.` : "") +
            (r.restantes ? ` Ainda restam ${r.restantes} — clique novamente.` : ""),
        );
      queryClient.invalidateQueries({ queryKey: ["mensagens-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 text-muted-foreground">
        Apenas administradores podem ver esta página.
      </div>
    );
  }

  const dados = lista.data;
  const pendentes = dados?.pendentes ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Inbox className="size-6 text-primary" /> Mensagens pendentes
          </h1>
          <p className="text-sm text-muted-foreground">
            Avisos que chegaram pelas APIs do WhatsApp e ainda não apareceram no chat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => lista.refetch()}
            disabled={lista.isFetching}
          >
            <RefreshCw className={`size-4 ${lista.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            onClick={() => reenviarTudo.mutate()}
            disabled={reenviarTudo.isPending || !lista.data?.totalPendentes}
          >
            <RotateCcw className={`size-4 ${reenviarTudo.isPending ? "animate-spin" : ""}`} />
            {reenviarTudo.isPending
              ? "Reenviando…"
              : `Reenviar todas${lista.data?.totalPendentes ? ` (${lista.data.totalPendentes})` : ""}`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {JANELAS.map((j) => (
          <Button
            key={j.horas}
            size="sm"
            variant={horas === j.horas ? "default" : "outline"}
            onClick={() => setHoras(j.horas)}
          >
            {j.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Avisos recebidos no período</p>
          <p className="text-2xl font-semibold">{dados?.totalEventos ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Descartados de propósito (canais, grupos, seu número)
          </p>
          <p className="text-2xl font-semibold">{dados?.totalDescartados ?? "—"}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Sem mensagem no chat</p>
          <p className="text-2xl font-semibold text-destructive">
            {dados?.totalPendentes ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Com texto ou mídia</p>
          <p className="text-2xl font-semibold">{dados?.pendentesComConteudo ?? "—"}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Chegou em</th>
              <th className="p-3">De</th>
              <th className="p-3">Conteúdo</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Situação</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {lista.isLoading ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={6}>
                  Carregando…
                </td>
              </tr>
            ) : pendentes.length === 0 ? (
              <tr>
                <td className="p-4 text-muted-foreground" colSpan={6}>
                  Nenhuma mensagem pendente neste período — tudo o que chegou já está no chat.
                </td>
              </tr>
            ) : (
              pendentes.map((p) => (
                <tr key={p.id} className="border-t align-top">
                  <td className="whitespace-nowrap p-3 font-medium">{quando(p.criadoEm)}</td>
                  <td className="p-3">
                    <span className="break-all">{p.de}</span>
                    {p.fromMe ? (
                      <Badge variant="outline" className="ml-2">
                        enviada por você
                      </Badge>
                    ) : null}
                  </td>
                  <td className="max-w-[320px] p-3">
                    {p.conteudo ? (
                      <span className="line-clamp-3 break-words">{p.conteudo}</span>
                    ) : (
                      <span className="text-muted-foreground">sem texto</span>
                    )}
                    {p.erro ? (
                      <p className="mt-1 text-xs text-destructive break-words">{p.erro}</p>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">{p.tipo}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        p.status === "erro"
                          ? "destructive"
                          : p.status === "processando"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {p.status === "ok" ? "recebido, fora do chat" : p.status}
                    </Badge>
                    <p className="mt-1 text-xs text-muted-foreground">{p.evento}</p>
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reprocessar.mutate(p.id)}
                      disabled={reprocessar.isPending}
                    >
                      <RotateCcw className="size-4" />
                      Tentar de novo
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
