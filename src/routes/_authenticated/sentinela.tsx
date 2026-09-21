import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Bot, RefreshCw, Save, ShieldCheck, Unlock } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import {
  liberarOrigem,
  resolverAchado,
  salvarSentinelaSettings,
  statusSentinela,
  verificarAgoraSentinela,
} from "@/lib/sentinela.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/sentinela")({
  head: () => ({
    meta: [
      { title: "IA Sentinela — vigilância da central" },
      {
        name: "description",
        content:
          "A IA acompanha as integrações de WhatsApp, recupera mensagens e arquivos perdidos, corrige falhas sozinha e barra acessos suspeitos.",
      },
      { property: "og:title", content: "IA Sentinela — vigilância da central" },
      {
        property: "og:description",
        content: "Estabilidade contínua: nada de mensagens perdidas, quedas ou acessos abusivos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SentinelaPage,
});

function quando(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function corSeveridade(s: string) {
  if (s === "erro") return "destructive" as const;
  if (s === "aviso") return "secondary" as const;
  return "outline" as const;
}

function SentinelaPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(statusSentinela);
  const salvarFn = useServerFn(salvarSentinelaSettings);
  const verificarFn = useServerFn(verificarAgoraSentinela);
  const resolverFn = useServerFn(resolverAchado);
  const liberarFn = useServerFn(liberarOrigem);

  const status = useQuery({
    queryKey: ["sentinela-status"],
    queryFn: () => statusFn({}),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const [ativo, setAtivo] = useState(true);
  const [autoReconectar, setAutoReconectar] = useState(true);
  const [autoReenviar, setAutoReenviar] = useState(true);
  const [autoRecuperarMidia, setAutoRecuperarMidia] = useState(true);
  const [autoLimparDuplicadas, setAutoLimparDuplicadas] = useState(true);
  const [segurancaModo, setSegurancaModo] = useState<"bloquear" | "alertar" | "misto">("misto");
  const [limite, setLimite] = useState(240);
  const [bloqueio, setBloqueio] = useState(15);
  const [avisarPainel, setAvisarPainel] = useState(true);
  const [avisarWhatsapp, setAvisarWhatsapp] = useState(true);
  const [numero, setNumero] = useState("5562910002123");

  useEffect(() => {
    const s = status.data?.settings;
    if (!s) return;
    setAtivo(s.ativo);
    setAutoReconectar(s.autoReconectar);
    setAutoReenviar(s.autoReenviar);
    setAutoRecuperarMidia(s.autoRecuperarMidia);
    setAutoLimparDuplicadas(s.autoLimparDuplicadas);
    setSegurancaModo((s.segurancaModo as "bloquear" | "alertar" | "misto") ?? "misto");
    setLimite(s.limiteReqMinuto);
    setBloqueio(s.bloqueioMinutos);
    setAvisarPainel(s.avisarPainel);
    setAvisarWhatsapp(s.avisarWhatsapp);
    setNumero(s.numeroAlerta);
  }, [status.data]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: {
          ativo,
          autoReconectar,
          autoReenviar,
          autoRecuperarMidia,
          autoLimparDuplicadas,
          segurancaModo,
          limiteReqMinuto: limite,
          bloqueioMinutos: bloqueio,
          avisarPainel,
          avisarWhatsapp,
          numeroAlerta: numero,
        },
      }),
    onSuccess: () => {
      toast.success("Regras salvas.");
      queryClient.invalidateQueries({ queryKey: ["sentinela-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verificar = useMutation({
    mutationFn: () => verificarFn({}),
    onSuccess: (r) => {
      toast.success(
        `Verificação concluída: ${r.verificacoes} itens, ${r.corrigidos} corrigidos, ${r.problemas} pendentes.`,
      );
      queryClient.invalidateQueries({ queryKey: ["sentinela-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolver = useMutation({
    mutationFn: (v: { id: string; status: "corrigido" | "ignorado" }) => resolverFn({ data: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sentinela-status"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const liberar = useMutation({
    mutationFn: (id: string) => liberarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Origem liberada.");
      queryClient.invalidateQueries({ queryKey: ["sentinela-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Apenas administradores podem abrir a IA Sentinela.
      </div>
    );
  }

  const dados = status.data;
  const ultimo = dados?.ciclos?.[0];
  const abertos = (dados?.achados ?? []).filter((a) => a.status === "aberto");

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bot className="size-5 text-primary" /> IA Sentinela
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanha as integrações, recupera mensagens e arquivos perdidos e barra acessos
            abusivos — sozinha, a cada {dados?.settings.intervaloMinutos ?? 2} minutos.
          </p>
        </div>
        <Button
          onClick={() => verificar.mutate()}
          disabled={verificar.isPending}
          className="gap-2"
        >
          <RefreshCw className={`size-4 ${verificar.isPending ? "animate-spin" : ""}`} />
          Verificar agora
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Situação</p>
          <p className="mt-1 text-lg font-semibold">
            {ultimo?.severidade === "erro"
              ? "Precisa de atenção"
              : ultimo?.severidade === "aviso"
                ? "Sob observação"
                : "Tudo em ordem"}
          </p>
          <p className="text-xs text-muted-foreground">Última checagem: {quando(ultimo?.iniciadoEm ?? null)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Mensagens recebidas (24h)</p>
          <p className="mt-1 text-lg font-semibold">{dados?.eventos24h.total ?? 0}</p>
          <p className="text-xs text-muted-foreground">
            {dados?.eventos24h.pendentes ?? 0} aguardando confirmação
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Corrigidos automaticamente</p>
          <p className="mt-1 text-lg font-semibold">{ultimo?.corrigidos ?? 0}</p>
          <p className="text-xs text-muted-foreground">no último ciclo</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Pendências abertas</p>
          <p className="mt-1 text-lg font-semibold">{abertos.length}</p>
          <p className="text-xs text-muted-foreground">itens que pedem uma olhada</p>
        </div>
      </section>

      {dados?.settings.resumoIa ? (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Bot className="size-4 text-primary" /> Resumo da IA
          </h2>
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {dados.settings.resumoIa}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Atualizado em {quando(dados.settings.resumoIaEm)}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Correções automáticas</h2>
          <div className="space-y-3">
            {[
              ["Vigilância ligada", ativo, setAtivo],
              ["Religar conexões que caírem", autoReconectar, setAutoReconectar],
              ["Reprocessar mensagens que falharem", autoReenviar, setAutoReenviar],
              ["Baixar de novo arquivos que falharem", autoRecuperarMidia, setAutoRecuperarMidia],
              ["Evitar mensagens repetidas", autoLimparDuplicadas, setAutoLimparDuplicadas],
              ["Mostrar avisos no painel", avisarPainel, setAvisarPainel],
              ["Avisar no WhatsApp", avisarWhatsapp, setAvisarWhatsapp],
            ].map(([label, valor, setter]) => (
              <div key={String(label)} className="flex items-center justify-between gap-3">
                <Label className="text-sm">{String(label)}</Label>
                <Switch
                  checked={Boolean(valor)}
                  onCheckedChange={(v) => (setter as (b: boolean) => void)(v)}
                />
              </div>
            ))}
            <div className="grid gap-1.5">
              <Label className="text-sm">Número que recebe os avisos</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" /> Proteção contra ataques
          </h2>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-sm">O que fazer com acessos em excesso</Label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["misto", "Avisar e bloquear excesso claro"],
                    ["bloquear", "Bloquear sempre"],
                    ["alertar", "Só avisar"],
                  ] as const
                ).map(([valor, label]) => (
                  <Button
                    key={valor}
                    type="button"
                    size="sm"
                    variant={segurancaModo === valor ? "default" : "outline"}
                    onClick={() => setSegurancaModo(valor)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-sm">Acessos permitidos por minuto (cada origem)</Label>
              <Input
                type="number"
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value) || 240)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-sm">Tempo de bloqueio (minutos)</Label>
              <Input
                type="number"
                value={bloqueio}
                onChange={(e) => setBloqueio(Number(e.target.value) || 15)}
              />
            </div>
          </div>
        </div>
      </section>

      <div>
        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="gap-2">
          <Save className="size-4" /> Salvar regras
        </Button>
      </div>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 text-sm font-semibold">Ocorrências</h2>
        <div className="divide-y">
          {(dados?.achados ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
          ) : (
            (dados?.achados ?? []).map((a) => (
              <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={corSeveridade(a.severidade)}>{a.severidade}</Badge>
                    <span className="text-sm font-medium">{a.titulo}</span>
                    {a.status !== "aberto" ? (
                      <Badge variant="outline">{a.status}</Badge>
                    ) : null}
                  </div>
                  {a.detalhe ? (
                    <p className="mt-1 text-xs text-muted-foreground">{a.detalhe}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.alvo ? `${a.alvo} · ` : ""}
                    {a.acao ? `${a.acao} · ` : ""}
                    {quando(a.criadoEm)}
                  </p>
                </div>
                {a.status === "aberto" ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolver.mutate({ id: a.id, status: "corrigido" })}
                    >
                      Resolvido
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolver.mutate({ id: a.id, status: "ignorado" })}
                    >
                      Ignorar
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 text-sm font-semibold">Origens acompanhadas</h2>
        <div className="divide-y">
          {(dados?.bloqueios ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum acesso suspeito até agora.</p>
          ) : (
            (dados?.bloqueios ?? []).map((b) => {
              const bloqueado = b.bloqueadoAte && new Date(b.bloqueadoAte) > new Date();
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span>{b.ip}</span>
                      {bloqueado ? (
                        <Badge variant="destructive">bloqueado</Badge>
                      ) : (
                        <Badge variant="outline">liberado</Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {b.requisicoes} acessos no último minuto · {b.totalBloqueios} bloqueio(s) ·{" "}
                      {quando(b.ultimoEm)}
                    </p>
                  </div>
                  {bloqueado ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => liberar.mutate(b.id)}
                    >
                      <Unlock className="size-4" /> Liberar
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <h2 className="border-b p-4 text-sm font-semibold">Últimas verificações</h2>
        <div className="divide-y">
          {(dados?.ciclos ?? []).map((c) => (
            <div key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={corSeveridade(c.severidade)}>{c.severidade}</Badge>
                <span className="text-sm">{quando(c.iniciadoEm)}</span>
                <span className="text-xs text-muted-foreground">
                  {c.verificacoes} itens · {c.corrigidos} corrigidos · {c.problemas} pendentes ·{" "}
                  {(c.duracaoMs / 1000).toFixed(1)}s
                </span>
              </div>
              {c.resumo ? (
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{c.resumo}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
