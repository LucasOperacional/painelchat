import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Play,
  Loader2,
  CalendarClock,
  History,
  CheckCircle2,
  XCircle,
  Pencil,
  Search,
  Check,
  Images,
} from "lucide-react";
import { toast } from "sonner";

import {
  listPostagens,
  savePostagem,
  togglePostagem,
  deletePostagem,
  runPostagemNow,
  listPostagemEnvios,
  listPostagemGrupos,
  type PostagemDto,
} from "@/lib/postagens.functions";
import { listWhatsappDevices } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/postagens")({
  head: () => ({
    meta: [
      { title: "Postagens e Stories — Publicação automática em grupos" },
      {
        name: "description",
        content:
          "Programe publicações de texto, imagem e vídeo nos grupos de WhatsApp e no Status/Stories, com repetição automática e relatório de entregas.",
      },
      { property: "og:title", content: "Postagens e Stories" },
      {
        property: "og:description",
        content: "Publicação automática em grupos e no Status do WhatsApp, com agendamento e repetição.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PostagensPage,
});

type Destino = PostagemDto["destino"];
type Frequencia = PostagemDto["frequencia"];

const DESTINOS: { value: Destino; label: string }[] = [
  { value: "todos_grupos", label: "Todos os grupos conectados" },
  { value: "grupos", label: "Grupos selecionados" },
  { value: "status", label: "Somente Status / Stories" },
  { value: "status_grupos", label: "Status / Stories + grupos" },
];

const FREQUENCIAS: { value: Frequencia; label: string }[] = [
  { value: "unica", label: "Uma única vez" },
  { value: "horas", label: "A cada X horas" },
  { value: "diaria", label: "Todos os dias" },
  { value: "dias_semana", label: "Dias da semana escolhidos" },
  { value: "semanal", label: "Uma vez por semana" },
];

const DIAS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function descreverFrequencia(p: PostagemDto) {
  switch (p.frequencia) {
    case "horas":
      return `A cada ${p.intervaloHoras}h`;
    case "diaria":
      return "Todos os dias";
    case "semanal":
      return "Uma vez por semana";
    case "dias_semana":
      return p.diasSemana.length
        ? p.diasSemana
            .slice()
            .sort()
            .map((d) => DIAS.find((x) => x.value === d)?.label ?? d)
            .join(", ")
        : "Dias da semana";
    default:
      return "Uma única vez";
  }
}

function statusBadge(status: string) {
  const mapa: Record<string, { label: string; className: string }> = {
    pendente: { label: "Pendente", className: "bg-muted text-muted-foreground" },
    em_andamento: { label: "Em andamento", className: "bg-primary/15 text-primary" },
    concluido: { label: "Concluída", className: "bg-emerald-500/15 text-emerald-600" },
    recorrente: { label: "Recorrente", className: "bg-sky-500/15 text-sky-600" },
    falha: { label: "Falha", className: "bg-destructive/15 text-destructive" },
  };
  const item = mapa[status] ?? mapa["pendente"]!;
  return <Badge className={item.className}>{item.label}</Badge>;
}

function PostagensPage() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listPostagens);
  const salvar = useServerFn(savePostagem);
  const alternar = useServerFn(togglePostagem);
  const excluir = useServerFn(deletePostagem);
  const publicar = useServerFn(runPostagemNow);
  const listarEnvios = useServerFn(listPostagemEnvios);
  const buscarGrupos = useServerFn(listPostagemGrupos);
  const listarDevices = useServerFn(listWhatsappDevices);

  const postagens = useQuery({
    queryKey: ["postagens"],
    queryFn: () => listar(),
    refetchInterval: 15000,
    retry: 3,
    retryDelay: (tentativa) => Math.min(1000 * 2 ** tentativa, 8000),
    throwOnError: false,
  });
  const devices = useQuery({ queryKey: ["wa-devices"], queryFn: () => listarDevices() });

  const [editing, setEditing] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [destino, setDestino] = useState<Destino>("todos_grupos");
  const [gruposSel, setGruposSel] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [midiaTipo, setMidiaTipo] = useState<PostagemDto["midiaTipo"]>("nenhum");
  const [midiaUrl, setMidiaUrl] = useState("");
  const [delaySegundos, setDelaySegundos] = useState("8");
  const [frequencia, setFrequencia] = useState<Frequencia>("unica");
  const [intervaloHoras, setIntervaloHoras] = useState("24");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [inicioEm, setInicioEm] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [historicoDe, setHistoricoDe] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const grupos = useQuery({
    queryKey: ["postagem-grupos", deviceId],
    queryFn: () => buscarGrupos({ data: { deviceId } }),
    enabled: aberto && (destino === "grupos" || destino === "status_grupos"),
    staleTime: 60_000,
    retry: false,
  });

  const envios = useQuery({
    queryKey: ["postagem-envios", historicoDe],
    queryFn: () => listarEnvios({ data: { postagemId: historicoDe! } }),
    enabled: !!historicoDe,
  });

  function limpar() {
    setEditing(null);
    setNome("");
    setDeviceId(null);
    setDestino("todos_grupos");
    setGruposSel([]);
    setMensagem("");
    setMidiaTipo("nenhum");
    setMidiaUrl("");
    setDelaySegundos("8");
    setFrequencia("unica");
    setIntervaloHoras("24");
    setDiasSemana([]);
    setInicioEm("");
    setAtivo(true);
  }

  function abrirNova() {
    limpar();
    setAberto(true);
  }

  function abrirEdicao(p: PostagemDto) {
    setEditing(p.id);
    setNome(p.nome);
    setDeviceId(p.deviceId);
    setDestino(p.destino);
    setGruposSel(p.grupos);
    setMensagem(p.mensagem);
    setMidiaTipo(p.midiaTipo);
    setMidiaUrl(p.midiaUrl);
    setDelaySegundos(String(p.delaySegundos));
    setFrequencia(p.frequencia);
    setIntervaloHoras(String(p.intervaloHoras));
    setDiasSemana(p.diasSemana);
    setInicioEm(toLocalInput(p.inicioEm));
    setAtivo(p.ativo);
    setAberto(true);
  }

  const salvarMutation = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          id: editing,
          postagem: {
            nome,
            deviceId,
            destino,
            grupos: gruposSel,
            mensagem,
            midiaUrl: midiaTipo === "nenhum" ? "" : midiaUrl.trim(),
            midiaTipo,
            delaySegundos: Number(delaySegundos) || 8,
            frequencia,
            intervaloHoras: Number(intervaloHoras) || 24,
            diasSemana,
            inicioEm: inicioEm ? new Date(inicioEm).toISOString() : null,
            ativo,
          },
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Postagem atualizada." : "Postagem criada.");
      setAberto(false);
      limpar();
      queryClient.invalidateQueries({ queryKey: ["postagens"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const alternarMutation = useMutation({
    mutationFn: (input: { id: string; ativo: boolean }) => alternar({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["postagens"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível alterar."),
  });

  const excluirMutation = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => {
      toast.success("Postagem excluída.");
      queryClient.invalidateQueries({ queryKey: ["postagens"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir."),
  });

  const publicarMutation = useMutation({
    mutationFn: (id: string) => publicar({ data: { id } }),
    onSuccess: (r) => {
      if (r.erro) toast.error(r.erro);
      else if (r.falhas > 0)
        toast.warning(`${r.enviados} publicados e ${r.falhas} falhas de ${r.total}.`);
      else toast.success(`Publicado em ${r.enviados} destino(s).`);
      queryClient.invalidateQueries({ queryKey: ["postagens"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível publicar."),
  });

  const listaGrupos = (grupos.data ?? []).filter((g) =>
    g.name.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Postagens e Stories</h2>
          <p className="text-sm text-muted-foreground">
            Publique texto, imagem ou vídeo em todos os grupos e no Status do WhatsApp, com horário e
            repetição automática.
          </p>
        </div>
        <Button onClick={abrirNova}>
          <Plus className="mr-2 h-4 w-4" /> Nova postagem
        </Button>
      </div>

      {postagens.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando postagens…
        </div>
      ) : postagens.isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <XCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar as postagens agora. A conexão com o servidor falhou
              momentaneamente.
            </p>
            <Button variant="outline" onClick={() => postagens.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (postagens.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Images className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma postagem programada. Crie a primeira para publicar nos grupos e no Status.
            </p>
            <Button onClick={abrirNova}>
              <Plus className="mr-2 h-4 w-4" /> Nova postagem
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(postagens.data ?? []).map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base">{p.nome}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {statusBadge(p.status)}
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" /> {descreverFrequencia(p)}
                    </span>
                  </div>
                </div>
                <Switch
                  checked={p.ativo}
                  onCheckedChange={(v) => alternarMutation.mutate({ id: p.id, ativo: v })}
                />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                  {p.mensagem || "(somente mídia)"}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>
                    Destino: {DESTINOS.find((d) => d.value === p.destino)?.label ?? p.destino}
                  </span>
                  <span>Intervalo entre envios: {p.delaySegundos}s</span>
                  <span>Próxima: {formatDate(p.proximoEm)}</span>
                  <span>Última: {formatDate(p.ultimoEm)}</span>
                  <span>Publicados: {p.totalEnviados}</span>
                  <span>Falhas: {p.totalFalhas}</span>
                </div>
                {p.ultimoStatus ? (
                  <p className="text-xs text-muted-foreground">Resultado: {p.ultimoStatus}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => publicarMutation.mutate(p.id)}
                    disabled={publicarMutation.isPending}
                  >
                    {publicarMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Publicar agora
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => abrirEdicao(p)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setHistoricoDe(p.id)}>
                    <History className="mr-2 h-4 w-4" /> Entregas
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => excluirMutation.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : (setAberto(false), limpar()))}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar postagem" : "Nova postagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Promoção da semana" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Conexão do WhatsApp</Label>
                <Select
                  value={deviceId ?? "auto"}
                  onValueChange={(v) => setDeviceId(v === "auto" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Automático" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático (primeiro conectado)</SelectItem>
                    {(devices.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label || d.phone || "WhatsApp"} —{" "}
                        {d.provider === "wuzapi" ? "WuzAPI" : d.provider === "waha" ? "WAHA" : "Evolution Go"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Onde publicar</Label>
                <Select value={destino} onValueChange={(v) => setDestino(v as Destino)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINOS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {destino === "grupos" || destino === "status_grupos" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Grupos ({gruposSel.length} selecionados)</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => grupos.refetch()}
                    disabled={grupos.isFetching}
                  >
                    {grupos.isFetching ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-2 h-4 w-4" />
                    )}
                    Buscar grupos
                  </Button>
                </div>
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar grupo pelo nome"
                />
                {grupos.isError ? (
                  <p className="text-sm text-destructive">
                    {grupos.error instanceof Error
                      ? grupos.error.message
                      : "Não foi possível buscar os grupos."}
                  </p>
                ) : null}
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                  {listaGrupos.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">
                      {grupos.isFetching ? "Buscando grupos…" : "Nenhum grupo encontrado."}
                    </p>
                  ) : (
                    listaGrupos.map((g) => {
                      const marcado = gruposSel.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() =>
                            setGruposSel((atual) =>
                              marcado ? atual.filter((x) => x !== g.id) : [...atual, g.id],
                            )
                          }
                          className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                            marcado ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">
                            {g.name}
                            {g.participants ? ` · ${g.participants} membros` : ""}
                          </span>
                          {marcado ? <Check className="h-4 w-4" /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Mensagem / legenda</Label>
              <Textarea
                rows={4}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder="Escreva o texto da postagem"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Mídia</Label>
                <Select
                  value={midiaTipo}
                  onValueChange={(v) => setMidiaTipo(v as PostagemDto["midiaTipo"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Somente texto</SelectItem>
                    <SelectItem value="imagem">Imagem</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {midiaTipo !== "nenhum" ? (
                <div className="space-y-2">
                  <Label>Endereço do arquivo</Label>
                  <Input
                    value={midiaUrl}
                    onChange={(e) => setMidiaUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Começar em</Label>
                <Input
                  type="datetime-local"
                  value={inicioEm}
                  onChange={(e) => setInicioEm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Repetição</Label>
                <Select value={frequencia} onValueChange={(v) => setFrequencia(v as Frequencia)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIAS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {frequencia === "horas" ? (
              <div className="space-y-2">
                <Label>Repetir a cada (horas)</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={intervaloHoras}
                  onChange={(e) => setIntervaloHoras(e.target.value)}
                />
              </div>
            ) : null}

            {frequencia === "dias_semana" ? (
              <div className="space-y-2">
                <Label>Dias da semana</Label>
                <div className="flex flex-wrap gap-2">
                  {DIAS.map((d) => {
                    const marcado = diasSemana.includes(d.value);
                    return (
                      <Button
                        key={d.value}
                        type="button"
                        size="sm"
                        variant={marcado ? "default" : "outline"}
                        onClick={() =>
                          setDiasSemana((atual) =>
                            marcado ? atual.filter((x) => x !== d.value) : [...atual, d.value],
                          )
                        }
                      >
                        {d.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Intervalo entre grupos (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={delaySegundos}
                  onChange={(e) => setDelaySegundos(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Espera entre um envio e o próximo para reduzir o risco de bloqueio.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Agendamento ativo</Label>
                  <p className="text-xs text-muted-foreground">Publica automaticamente no horário.</p>
                </div>
                <Switch checked={ativo} onCheckedChange={setAtivo} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => (setAberto(false), limpar())}>
                Cancelar
              </Button>
              <Button onClick={() => salvarMutation.mutate()} disabled={salvarMutation.isPending}>
                {salvarMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historicoDe} onOpenChange={(v) => !v && setHistoricoDe(null)}>
        <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Relatório de entregas</DialogTitle>
          </DialogHeader>
          {envios.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (envios.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrega registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {(envios.data ?? []).map((e) => (
                <div key={e.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  {e.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {e.tipo === "status" ? "Status / Stories" : e.destinoNome}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.detalhe}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
