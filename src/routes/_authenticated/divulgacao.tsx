import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
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
} from "lucide-react";
import { toast } from "sonner";

import {
  listBroadcastCampaigns,
  saveBroadcastCampaign,
  toggleBroadcastCampaign,
  deleteBroadcastCampaign,
  runBroadcastNow,
  listBroadcastRuns,
  listBroadcastGroups,
  type BroadcastCampaignDto,
} from "@/lib/broadcast.functions";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/divulgacao")({
  head: () => ({
    meta: [
      { title: "Divulgação em Grupos — Disparos automáticos" },
      {
        name: "description",
        content:
          "Cadastre grupos de WhatsApp e programe disparos automáticos de mensagens com agendamento e repetição.",
      },
      { property: "og:title", content: "Divulgação em Grupos" },
      { property: "og:description", content: "Disparos automáticos para grupos de WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DivulgacaoPage,
});

const REPEAT_OPTIONS = [
  { value: "0", label: "Não repetir" },
  { value: "60", label: "A cada 1 hora" },
  { value: "120", label: "A cada 2 horas" },
  { value: "180", label: "A cada 3 horas" },
  { value: "240", label: "A cada 4 horas" },
  { value: "360", label: "A cada 6 horas" },
  { value: "720", label: "A cada 12 horas" },
  { value: "1440", label: "Uma vez por dia" },
  { value: "10080", label: "Uma vez por semana" },
];

function repeatLabel(minutes: number) {
  return REPEAT_OPTIONS.find((o) => o.value === String(minutes))?.label ?? `A cada ${minutes} min`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function DivulgacaoPage() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listBroadcastCampaigns);
  const salvar = useServerFn(saveBroadcastCampaign);
  const alternar = useServerFn(toggleBroadcastCampaign);
  const excluir = useServerFn(deleteBroadcastCampaign);
  const disparar = useServerFn(runBroadcastNow);
  const listarEnvios = useServerFn(listBroadcastRuns);
  const listarDevices = useServerFn(listWhatsappDevices);

  const campanhas = useQuery({
    queryKey: ["broadcast-campaigns"],
    queryFn: () => listar(),
    refetchInterval: 15000,
  });
  const devices = useQuery({ queryKey: ["wa-devices"], queryFn: () => listarDevices() });

  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"divulgazap" | "device">("divulgazap");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [targetsText, setTargetsText] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [repeatMinutes, setRepeatMinutes] = useState("0");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [grupos, setGrupos] = useState<
    { id: string; name: string; participants?: number | null }[]
  >([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [gruposDeviceId, setGruposDeviceId] = useState<string>("default");

  const buscarGruposFn = useServerFn(listBroadcastGroups);
  const selectedTargets = targetsText
    .split(/[\n,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  function toggleGrupo(id: string) {
    const atuais = new Set(selectedTargets);
    if (atuais.has(id)) atuais.delete(id);
    else atuais.add(id);
    setTargetsText(Array.from(atuais).join("\n"));
  }

  const gruposFiltrados = grupos.filter((g) => {
    const termo = groupFilter.trim().toLowerCase();
    if (!termo) return true;
    return g.name.toLowerCase().includes(termo) || g.id.toLowerCase().includes(termo);
  });
  const todosSelecionados =
    gruposFiltrados.length > 0 && gruposFiltrados.every((g) => selectedTargets.includes(g.id));

  function alternarTodos() {
    const atuais = new Set(selectedTargets);
    if (todosSelecionados) gruposFiltrados.forEach((g) => atuais.delete(g.id));
    else gruposFiltrados.forEach((g) => atuais.add(g.id));
    setTargetsText(Array.from(atuais).join("\n"));
  }

  const buscarGrupos = useMutation({
    mutationFn: () =>
      buscarGruposFn({
        data: {
          channel: "device",
          deviceId: gruposDeviceId === "default" ? null : gruposDeviceId,
        },
      }),
    onSuccess: (lista) => {
      setGrupos(lista);
      if (lista.length === 0) toast.info("Nenhum grupo encontrado nessa conexão.");
      else toast.success(`${lista.length} grupo(s) encontrado(s).`);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao buscar os grupos."),
  });

  const envios = useQuery({
    queryKey: ["broadcast-runs", historyFor],
    queryFn: () => listarEnvios({ data: { campaignId: historyFor! } }),
    enabled: Boolean(historyFor),
  });

  function resetForm() {
    setEditing(null);
    setName("");
    setChannel("divulgazap");
    setDeviceId(null);
    setTargetsText("");
    setMessage("");
    setImageUrl("");
    setScheduledAt("");
    setRepeatMinutes("0");
  }

  function loadForm(c: BroadcastCampaignDto) {
    setEditing(c.id);
    setName(c.name);
    setChannel(c.channel === "device" ? "device" : "divulgazap");
    setDeviceId(c.deviceId);
    setTargetsText(c.targets.join("\n"));
    setMessage(c.message);
    setImageUrl(c.imageUrl);
    setScheduledAt(c.scheduledAt ? c.scheduledAt.slice(0, 16) : "");
    setRepeatMinutes(String(c.repeatMinutes));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const salvarMutation = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          id: editing,
          campaign: {
            name: name.trim(),
            channel,
            deviceId: channel === "device" ? deviceId : null,
            targets: targetsText
              .split(/[\n,;]+/)
              .map((t) => t.trim())
              .filter(Boolean),
            message: message.trim(),
            imageUrl: imageUrl.trim(),
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            repeatMinutes: Number(repeatMinutes),
          },
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Campanha atualizada." : "Campanha criada.");
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["broadcast-campaigns"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a campanha."),
  });

  const dispararMutation = useMutation({
    mutationFn: (id: string) => disparar({ data: { id } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Enviado para ${result.enviados} grupo(s).`);
      else if (result.erro) toast.error(result.erro);
      else toast.warning(`${result.enviados} enviados, ${result.falhas} falhas.`);
      queryClient.invalidateQueries({ queryKey: ["broadcast-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["broadcast-runs"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Falha ao disparar."),
  });

  const canSave =
    name.trim() &&
    message.trim() &&
    targetsText.trim() &&
    (channel === "divulgazap" || deviceId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Users className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Divulgação em Grupos</h1>
          <p className="text-sm text-muted-foreground">
            Dispare mensagens para vários grupos de WhatsApp, com agendamento e repetição automática.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4" />
            {editing ? "Editar campanha" : "Nova campanha"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="camp-name">Nome da campanha</Label>
              <Input
                id="camp-name"
                placeholder="Promoção da semana"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Enviar por</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as "divulgazap" | "device")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="divulgazap">DivulgaZap (API)</SelectItem>
                  <SelectItem value="device">Dispositivo conectado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {channel === "device" && (
            <div className="space-y-2">
              <Label>Dispositivo</Label>
              <Select value={deviceId ?? ""} onValueChange={(v) => setDeviceId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o dispositivo" />
                </SelectTrigger>
                <SelectContent>
                  {(devices.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label} — {d.phone || d.provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="camp-targets">Grupos de destino (um por linha)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={gruposDeviceId} onValueChange={setGruposDeviceId}>
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="Dispositivo para buscar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Dispositivo padrão</SelectItem>
                    {(devices.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label} — {d.phone || d.provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={buscarGrupos.isPending}
                  onClick={() => buscarGrupos.mutate()}
                >
                  {buscarGrupos.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                  Buscar grupos
                </Button>
              </div>
            </div>
            {grupos.length > 0 && (
              <div className="space-y-2 rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    placeholder="Filtrar grupos pelo nome"
                    className="h-8 flex-1"
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={alternarTodos}>
                    {todosSelecionados ? "Limpar seleção" : "Selecionar todos"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {gruposFiltrados.length} grupo(s) encontrados · {selectedTargets.length} selecionado(s)
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {gruposFiltrados.map((g) => {
                    const selecionado = selectedTargets.includes(g.id);
                    return (
                      <button
                        type="button"
                        key={g.id}
                        onClick={() => toggleGrupo(g.id)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          selecionado ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                            selecionado ? "border-primary bg-primary text-primary-foreground" : "border-input"
                          }`}
                        >
                          {selecionado && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{g.name}</span>
                        {typeof g.participants === "number" && (
                          <span className="text-xs text-muted-foreground">{g.participants}</span>
                        )}
                      </button>
                    );
                  })}
                  {gruposFiltrados.length === 0 && (
                    <p className="px-2 py-1 text-sm text-muted-foreground">
                      Nenhum grupo com esse nome.
                    </p>
                  )}
                </div>
              </div>
            )}
            <Textarea
              id="camp-targets"
              rows={3}
              placeholder={"120363000000000000@g.us\n5511999999999"}
              value={targetsText}
              onChange={(e) => setTargetsText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Escolha o dispositivo e clique em “Buscar grupos” para carregar os grupos do WhatsApp
              conectado, ou digite o ID do grupo (ex.: 120363...@g.us) ou o número com DDI e DDD. Um
              por linha ou separados por vírgula.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="camp-message">Mensagem</Label>
            <Textarea
              id="camp-message"
              rows={4}
              placeholder="Texto que será enviado aos grupos."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="camp-image">URL da imagem (opcional)</Label>
            <Input
              id="camp-image"
              placeholder="https://exemplo.com/banner.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="camp-date">Agendar para (opcional)</Label>
              <Input
                id="camp-date"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Repetir</Label>
              <Select value={repeatMinutes} onValueChange={setRepeatMinutes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={!canSave || salvarMutation.isPending}
              onClick={() => salvarMutation.mutate()}
            >
              {salvarMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editing ? "Salvar alterações" : "Criar campanha"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Campanhas</h2>
        {(campanhas.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma campanha cadastrada ainda.</p>
        )}
        {(campanhas.data ?? []).map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <Badge variant={c.isActive ? "default" : "secondary"}>
                    {c.isActive ? "Ativa" : "Pausada"}
                  </Badge>
                  <Badge variant="outline">
                    {c.channel === "divulgazap" ? "DivulgaZap" : "Dispositivo"}
                  </Badge>
                </div>
                <Switch
                  checked={c.isActive}
                  onCheckedChange={(checked) =>
                    alternar({ data: { id: c.id, isActive: checked } }).then(() =>
                      queryClient.invalidateQueries({ queryKey: ["broadcast-campaigns"] }),
                    )
                  }
                />
              </div>

              <p className="line-clamp-2 text-sm text-muted-foreground">{c.message}</p>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{c.targets.length} grupo(s)</span>
                <span className="flex items-center gap-1">
                  <CalendarClock className="size-3" />
                  Próximo disparo: {formatDate(c.nextRunAt)}
                </span>
                <span>Repetição: {repeatLabel(c.repeatMinutes)}</span>
                {c.lastStatus && (
                  <span>
                    Último envio ({formatDate(c.lastRunAt)}): {c.lastStatus}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={dispararMutation.isPending}
                  onClick={() => dispararMutation.mutate(c.id)}
                >
                  {dispararMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  Enviar agora
                </Button>
                <Button size="sm" variant="outline" onClick={() => loadForm(c)}>
                  <Pencil className="size-4" />
                  Editar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setHistoryFor(c.id)}>
                  <History className="size-4" />
                  Histórico
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    excluir({ data: { id: c.id } }).then(() => {
                      toast.success("Campanha removida.");
                      queryClient.invalidateQueries({ queryKey: ["broadcast-campaigns"] });
                    })
                  }
                >
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(historyFor)} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de envios</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {envios.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {(envios.data ?? []).length === 0 && !envios.isLoading && (
              <p className="text-sm text-muted-foreground">Nenhum envio registrado.</p>
            )}
            {(envios.data ?? []).map((r) => (
              <div key={r.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-0">
                  <p className="font-medium">{r.target}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {formatDate(r.createdAt)} — {r.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
