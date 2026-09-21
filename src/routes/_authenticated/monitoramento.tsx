import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Activity, BellRing, MessageSquare, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import {
  estatisticasMensagens,
  salvarMonitorSettings,
  statusMonitor,
  testarAlerta,
  verificarAgora,
} from "@/lib/monitor.functions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/monitoramento")({
  head: () => ({
    meta: [
      { title: "Monitoramento de conexões — Central" },
      {
        name: "description",
        content:
          "Acompanhe em tempo real a saúde das conexões com Evolution Go e WuzAPI, com religamento automático e avisos no WhatsApp.",
      },
      { property: "og:title", content: "Monitoramento de conexões — Central" },
      {
        property: "og:description",
        content: "Quedas, religamentos automáticos e avisos enviados ao número de plantão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MonitoramentoPage,
});

function quando(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function MonitoramentoPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(statusMonitor);
  const estatisticasFn = useServerFn(estatisticasMensagens);
  const salvarFn = useServerFn(salvarMonitorSettings);
  const verificarFn = useServerFn(verificarAgora);
  const testarFn = useServerFn(testarAlerta);

  const status = useQuery({
    queryKey: ["monitor-status"],
    queryFn: () => statusFn({}),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  const mensagens = useQuery({
    queryKey: ["monitor-mensagens"],
    queryFn: () => estatisticasFn({}),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  const [ativo, setAtivo] = useState(true);
  const [autoReconectar, setAutoReconectar] = useState(true);
  const [numeroAlerta, setNumeroAlerta] = useState("5562996928605");
  const [intervalo, setIntervalo] = useState(2);

  useEffect(() => {
    const s = status.data?.settings;
    if (!s) return;
    setAtivo(s.ativo);
    setAutoReconectar(s.autoReconectar);
    setNumeroAlerta(s.numeroAlerta);
    setIntervalo(s.intervaloMinutos);
  }, [status.data]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarFn({
        data: { ativo, autoReconectar, numeroAlerta, intervaloMinutos: intervalo },
      }),
    onSuccess: () => {
      toast.success("Monitoramento atualizado");
      void queryClient.invalidateQueries({ queryKey: ["monitor-status"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const verificar = useMutation({
    mutationFn: () => verificarFn({}),
    onSuccess: (r) => {
      toast.success(
        `${r.verificados} aparelho(s) verificados · ${r.quedas} queda(s) · ${r.religados} religado(s)`,
      );
      void queryClient.invalidateQueries({ queryKey: ["monitor-status"] });
    },
    onError: (e: Error) => toast.error("Falha na verificação", { description: e.message }),
  });

  const testar = useMutation({
    mutationFn: () => testarFn({}),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Aviso de teste enviado para ${r.numero}`);
      else toast.warning("Não deu para enviar o aviso", { description: r.detalhe });
      void queryClient.invalidateQueries({ queryKey: ["monitor-status"] });
    },
    onError: (e: Error) => toast.error("Falha no teste", { description: e.message }),
  });

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem ver o monitoramento das conexões.
        </p>
      </div>
    );
  }

  const devices = status.data?.devices ?? [];
  const eventos = status.data?.eventos ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Monitoramento de conexões</h1>
        <p className="text-sm text-muted-foreground">
          A central verifica sozinha se os aparelhos continuam conectados às APIs. Quando algo cai,
          ela tenta religar na hora e manda um aviso no WhatsApp do plantão.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Monitoramento ligado</p>
            <p className="text-xs text-muted-foreground">
              Desligue apenas em manutenção: sem isso não há avisos nem religamento.
            </p>
          </div>
          <Switch checked={ativo} onCheckedChange={setAtivo} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Religar automaticamente</p>
            <p className="text-xs text-muted-foreground">
              Ao detectar a queda, a central reconecta a instância antes de avisar.
            </p>
          </div>
          <Switch checked={autoReconectar} onCheckedChange={setAutoReconectar} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="numeroAlerta">Número que recebe os avisos</Label>
            <Input
              id="numeroAlerta"
              value={numeroAlerta}
              onChange={(e) => setNumeroAlerta(e.target.value)}
              placeholder="5562996928605"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="intervalo">Verificar a cada (minutos)</Label>
            <Input
              id="intervalo"
              type="number"
              min={1}
              max={60}
              value={intervalo}
              onChange={(e) => setIntervalo(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            <Save className="mr-1.5 size-4" /> Salvar
          </Button>
          <Button
            variant="outline"
            onClick={() => verificar.mutate()}
            disabled={verificar.isPending}
          >
            <RefreshCw className="mr-1.5 size-4" /> Verificar agora
          </Button>
          <Button variant="outline" onClick={() => testar.mutate()} disabled={testar.isPending}>
            <BellRing className="mr-1.5 size-4" /> Enviar aviso de teste
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4" /> Mensagens nas últimas 24 horas
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void mensagens.refetch()}
            disabled={mensagens.isFetching}
          >
            <RefreshCw className="mr-1.5 size-4" /> Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Enviadas</p>
            <p className="text-xl font-semibold text-foreground">{mensagens.data?.enviadas ?? 0}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Recebidas</p>
            <p className="text-xl font-semibold text-foreground">{mensagens.data?.recebidas ?? 0}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Não enviadas</p>
            <p className="text-xl font-semibold text-destructive">
              {mensagens.data?.naoEnviadas ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">Frequência</p>
            <p className="text-xl font-semibold text-foreground">{mensagens.data?.porHora ?? 0}/h</p>
            <p className="text-xs text-muted-foreground">
              {mensagens.data?.ultimaHora ?? 0} na última hora
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">Movimento por hora</p>
          <div className="flex h-24 items-end gap-1">
            {(mensagens.data?.serie ?? []).map((h) => {
              const maior = Math.max(
                1,
                ...(mensagens.data?.serie ?? []).map((x) => x.enviadas + x.recebidas),
              );
              const total = h.enviadas + h.recebidas;
              return (
                <div key={h.hora} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm bg-primary/70"
                    style={{ height: `${Math.round((total / maior) * 72)}px` }}
                    title={`${h.rotulo}h · ${h.enviadas} enviadas · ${h.recebidas} recebidas`}
                  />
                  <span className="text-[10px] text-muted-foreground">{h.rotulo}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Mensagens que não foram enviadas</p>
          {(mensagens.data?.falhas ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma falha de envio nas últimas 24 horas.
            </p>
          )}
          <ul className="space-y-2">
            {(mensagens.data?.falhas ?? []).map((f) => (
              <li key={f.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{f.origem}</span>
                  <span className="text-xs text-muted-foreground">{quando(f.criadoEm)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{f.descricao}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Activity className="size-4" /> Situação dos aparelhos
        </h2>
        {devices.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum aparelho cadastrado ainda.</p>
        )}
        <ul className="space-y-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <div>
                <p className="font-medium text-foreground">{d.label}</p>
                <p className="text-xs text-muted-foreground">
                  {d.provider === "wuzapi" ? "WuzAPI" : "Evolution Go"} · {d.phone || "sem número"} ·
                  última checagem {quando(d.ultimoCheck)}
                </p>
                {d.ultimoErro && (
                  <p className="text-xs text-destructive">Último erro: {d.ultimoErro}</p>
                )}
              </div>
              <Badge
                variant={
                  d.estado === "online" ? "default" : d.estado === "offline" ? "destructive" : "secondary"
                }
              >
                {d.estado === "online"
                  ? "On-line"
                  : d.estado === "offline"
                    ? `Fora do ar (${d.tentativas} tentativa(s))`
                    : "Sem verificação"}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Últimas ocorrências</h2>
        {eventos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>
        )}
        <ul className="space-y-2">
          {eventos.map((e) => (
            <li key={e.id} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {e.tipo}
                  {e.deviceLabel ? ` · ${e.deviceLabel}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <Badge
                    variant={
                      e.severidade === "ok"
                        ? "default"
                        : e.severidade === "aviso"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {e.severidade === "ok" ? "Normal" : e.severidade === "aviso" ? "Atenção" : "Erro"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{quando(e.criadoEm)}</span>
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{e.mensagem}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {e.alertaEnviado ? "Aviso enviado no WhatsApp." : `Aviso não enviado: ${e.alertaDetalhe ?? "—"}`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
