import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  QrCode,
  Phone,
  RefreshCw,
  Save,
  Plug,
  PowerOff,
  Plus,
  Star,
  History,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import { fetchQueues } from "@/lib/central";
import {
  connectWhatsapp,
  disconnectWhatsapp,
  fetchWhatsappQr,
  getWhatsappStatus,
  listWhatsappDevices,
  createWhatsappDevice,
  setDefaultWhatsappDevice,
  deleteWhatsappDevice,
  saveWhatsappDevice,
} from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  getHistoricoSettings,
  saveHistoricoSettings,
  importarHistoricoWhatsapp,
} from "@/lib/historico.functions";
import { DeviceCard } from "@/components/device-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  // ?device=<id>&qr=1 abre direto a leitura do QR Code do dispositivo.
  validateSearch: (search: Record<string, unknown>) => ({
    device: typeof search["device"] === "string" ? (search["device"] as string) : undefined,
    qr: search["qr"] === true || search["qr"] === "1" || search["qr"] === "true",
  }),
  head: () => ({
    meta: [
      { title: "Dispositivos do WhatsApp — Central" },
      {
        name: "description",
        content:
          "Cadastre os dispositivos de WhatsApp da central, escolha qual API cada um usa e leia o QR Code para conectar.",
      },
      { property: "og:title", content: "Dispositivos do WhatsApp — Central" },
      {
        property: "og:description",
        content: "Nome do dispositivo, integração usada e leitura do QR Code em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsappPage,
});

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  connecting: "Aguardando pareamento",
  disconnected: "Desconectado",
};

const PROVIDER_LABEL: Record<string, string> = {
  evolution: "Evolution Go",
  wuzapi: "WuzAPI",
  waha: "WAHA",
};

type ProviderId = "evolution" | "wuzapi" | "waha";

function WhatsappPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();

  const statusFn = useServerFn(getWhatsappStatus);
  const connectFn = useServerFn(connectWhatsapp);
  const qrFn = useServerFn(fetchWhatsappQr);
  const disconnectFn = useServerFn(disconnectWhatsapp);
  const devicesFn = useServerFn(listWhatsappDevices);
  const createDeviceFn = useServerFn(createWhatsappDevice);
  const setDefaultFn = useServerFn(setDefaultWhatsappDevice);
  const deleteDeviceFn = useServerFn(deleteWhatsappDevice);
  const historicoSettingsFn = useServerFn(getHistoricoSettings);
  const salvarHistoricoFn = useServerFn(saveHistoricoSettings);
  const importarHistoricoFn = useServerFn(importarHistoricoWhatsapp);
  const saveDeviceFn = useServerFn(saveWhatsappDevice);

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [newDeviceLabel, setNewDeviceLabel] = useState("");
  const [newDeviceProvider, setNewDeviceProvider] = useState<ProviderId>("evolution");
  const [newDeviceColor, setNewDeviceColor] = useState("#0ea5e9");

  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState<ProviderId>("evolution");
  const [color, setColor] = useState("#0ea5e9");
  const [queueId, setQueueId] = useState("auto");
  const [qr, setQr] = useState<string | null>(null);
  const [autoQr, setAutoQr] = useState(false);
  // Modo de conexão: QR Code (padrão) ou código de pareamento por número.
  const [connectMode, setConnectMode] = useState<"qr" | "code">("qr");
  const [pairPhone, setPairPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const cardsRef = useRef<HTMLDivElement>(null);

  // Quando a central envia para cá logo após vincular a API (?device=...&qr=1),
  // já abrimos o dispositivo e começamos a leitura do QR Code.
  const search = Route.useSearch();
  const autoOpened = useRef(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!cardsRef.current) return;
      const target = e.target as Node | null;
      if (!(target instanceof Element)) return;
      if (cardsRef.current.contains(target)) return;
      // Menus (Select/Popover) renderizam em portal fora do card: não fechar.
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      setDeviceId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const devices = useQuery({
    queryKey: ["whatsapp-devices"],
    queryFn: () => devicesFn({}),
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const queues = useQuery({
    queryKey: ["queues"],
    queryFn: fetchQueues,
    enabled: isAdmin,
  });

  useEffect(() => {
    const list = devices.data ?? [];
    if (!list.length) {
      setDeviceId(null);
      return;
    }
    if (deviceId && !list.some((d) => d.id === deviceId)) {
      setDeviceId(null);
    }
  }, [devices.data, deviceId]);

  // Abertura automática vinda da tela de API de conexão.
  useEffect(() => {
    if (autoOpened.current || !search.qr) return;
    const list = devices.data ?? [];
    if (!list.length) return;
    const target = list.find((d) => d.id === search.device) ?? list[0];
    if (!target) return;
    autoOpened.current = true;
    setDeviceId(target.id);
    requestAnimationFrame(() => cardsRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [devices.data, search.device, search.qr]);

  const status = useQuery({
    queryKey: ["whatsapp-status", deviceId],
    queryFn: () => statusFn({ data: { deviceId } }),
    enabled: isAdmin && !!deviceId,
    refetchInterval: autoQr ? 4000 : 10000,
  });

  // Só carrega os dados do dispositivo no formulário uma vez por dispositivo:
  // refetches em segundo plano não podem sobrescrever o que está sendo editado.
  const formLoadedFor = useRef<string | null>(null);
  const [formLoaded, setFormLoaded] = useState(false);

  useEffect(() => {
    setQr(null);
    setAutoQr(false);
    setPairingCode(null);
    formLoadedFor.current = null;
    setFormLoaded(false);
  }, [deviceId]);

  useEffect(() => {
    const c = status.data?.config;
    if (!c) return;
    if (formLoadedFor.current === deviceId) return;
    formLoadedFor.current = deviceId;
    setLabel(c.label);
    setColor(c.color ?? "#0ea5e9");
    setQueueId(c.defaultQueueId ?? "auto");
    if (status.data?.provider) setProvider(status.data.provider as ProviderId);
    setQr((v) => v ?? c.lastQr ?? null);
    setFormLoaded(true);
  }, [status.data, deviceId]);

  // Chegou pela tela de API de conexão: inicia a leitura assim que o
  // dispositivo escolhido aparece, sem esperar o clique no botão.
  const forcedQr = useRef(false);
  useEffect(() => {
    if (!search.qr || forcedQr.current || !deviceId) return;
    if (status.data?.live?.loggedIn) return;
    forcedQr.current = true;
    setQr(null);
    setAutoQr(true);
  }, [search.qr, deviceId, status.data]);

  // Ao abrir um dispositivo realmente desconectado, já busca o QR Code.
  // Enquanto o status não for lido (ou vier com erro) não iniciamos a leitura:
  // pedir QR Code para um número pareado derruba a sessão na Evolution Go.
  useEffect(() => {
    if (!deviceId) return;
    const data = status.data;
    if (!data?.hasApiKey || !data.live || data.error) return;
    if (data.live.loggedIn) return;
    if (data.config?.status === "connected") return;
    setAutoQr(true);
  }, [deviceId, status.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-devices"] });
  };

  const saveDevice = useMutation({
    mutationFn: () => {
      // Nunca salvar com o formulário ainda vazio: isso renomeava o
      // dispositivo para "Dispositivo" e apagava a fila escolhida.
      if (!deviceId || !formLoaded) {
        throw new Error("Aguarde os dados do dispositivo carregarem.");
      }
      return saveDeviceFn({
        data: {
          deviceId,
          label: label.trim() || status.data?.config?.label || "Dispositivo",
          provider,
          color,
          defaultQueueId: queueId === "auto" ? null : queueId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Dispositivo salvo");
      refresh();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const addDevice = useMutation({
    mutationFn: () =>
      createDeviceFn({
        data: {
          label: newDeviceLabel.trim() || "Novo dispositivo",
          provider: newDeviceProvider,
          color: newDeviceColor,
        },
      }),

    onSuccess: async (res) => {
      setNewDeviceLabel("");
      setProvider(newDeviceProvider);
      setNewDeviceColor("#0ea5e9");
      setDeviceId(res.id);

      if (res.linked) {
        setQr(res.qrcode ?? null);
        setAutoQr(!res.connected);
        if (res.connected) {
          toast.success("Dispositivo criado e já conectado", {
            description: res.phone ? `Número ${res.phone}` : undefined,
          });
        } else if (res.qrcode) {
          toast.success(`Dispositivo criado na ${PROVIDER_LABEL[newDeviceProvider]}`, {
            description: `Instância ${res.instanceName}. Leia o QR Code para conectar.`,
          });
        } else {
          toast.success(`Dispositivo criado na ${PROVIDER_LABEL[newDeviceProvider]}`, {
            description: "Gerando o QR Code...",
          });
        }
      } else {
        toast.warning(
          `Dispositivo criado, mas sem vínculo com a ${PROVIDER_LABEL[newDeviceProvider]}`,
          {
            description:
              res.error ?? `Confira o token da ${PROVIDER_LABEL[newDeviceProvider]} em API de conexão.`,
          },
        );
      }
      refresh();
    },
    onError: (e: Error) => toast.error("Não foi possível adicionar", { description: e.message }),
  });

  const makeDefault = useMutation({
    mutationFn: (id: string) => setDefaultFn({ data: { deviceId: id } }),
    onSuccess: () => {
      toast.success("Dispositivo padrão atualizado");
      refresh();
    },
    onError: (e: Error) => toast.error("Não foi possível atualizar", { description: e.message }),
  });

  // Regra do histórico: importar as conversas que já existem no celular.
  const historicoSettings = useQuery({
    queryKey: ["historico-settings"],
    queryFn: () => historicoSettingsFn({}),
    enabled: isAdmin,
  });

  const salvarHistorico = useMutation({
    mutationFn: (sincronizarHistorico: boolean) =>
      salvarHistoricoFn({ data: { sincronizarHistorico } }),
    onSuccess: async (_r, ligado) => {
      toast.success(
        ligado
          ? "Ao parear o celular, as conversas antigas entram sozinhas"
          : "As conversas antigas não serão mais importadas",
      );
      await queryClient.invalidateQueries({ queryKey: ["historico-settings"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const importarHistorico = useMutation({
    mutationFn: (id: string) =>
      importarHistoricoFn({ data: { deviceId: id, limitePorConversa: 100 } }),
    onSuccess: (res) => {
      if (res.mensagens > 0) {
        toast.success(
          `${res.mensagens} mensagens importadas em ${res.conversas} conversas`,
          res.avisos[0] ? { description: res.avisos[0] } : undefined,
        );
      } else {
        toast.warning("Nenhuma conversa foi importada", {
          description:
            res.avisos[0] ??
            "O celular não devolveu mensagens antigas para este dispositivo.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) =>
      toast.error("Não foi possível importar as conversas", { description: e.message }),
  });

  const removeDevice = useMutation({
    mutationFn: (id: string) => deleteDeviceFn({ data: { deviceId: id } }),
    onSuccess: () => {
      setDeviceId(null);
      toast.success("Dispositivo removido");
      refresh();
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const connect = useMutation({
    mutationFn: () =>
      connectFn({
        data: {
          deviceId,
          phone: connectMode === "code" ? pairPhone.replace(/\D/g, "") : "",
        },
      }),
    onSuccess: (res) => {
      if (res.needsConfiguration) {
        setAutoQr(false);
        toast.warning(`Cadastre o token da ${PROVIDER_LABEL[provider]}`, {
          description:
            res.error ?? "Abra API de conexão, informe o token e salve antes de conectar.",
        });
        refresh();
        return;
      }
      if (res.error) {
        setAutoQr(false);
        toast.error("Erro ao conectar", { description: res.error });
        refresh();
        return;
      }
      setPairingCode(res.pairingCode ?? null);
      setQr(connectMode === "qr" ? (res.qrcode ?? null) : null);
      if (!res.connected) setAutoQr(true);
      toast.success(
        res.connected
          ? "WhatsApp conectado"
          : res.pairingCode
            ? "Digite o código no WhatsApp do celular para conectar"
            : "Leia o QR Code no WhatsApp para conectar",
      );
      refresh();
    },

    onError: (e: Error) => toast.error("Erro ao conectar", { description: e.message }),
  });

  const startQrConnection = () => {
    if (autoQr) {
      setAutoQr(false);
      return;
    }
    setPairingCode(null);
    setQr(null);
    connect.mutate();
  };

  const loadQr = useMutation({
    mutationFn: () => qrFn({ data: { deviceId } }),
    onSuccess: (res) => {
      setQr(res.qrcode ?? null);
      if (res.connected) {
        refresh();
        toast.success("WhatsApp conectado");
      } else if (res.warning) {
        toast.warning("Não foi possível gerar o QR Code", { description: res.warning });
      } else if (!res.qrcode) {
        toast.info("Nenhum QR Code disponível agora.");
      }
    },
    onError: (e: Error) => toast.error("Erro ao buscar QR Code", { description: e.message }),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { deviceId: id } }),
    onSuccess: (res) => {
      setQr(null);
      setPairingCode(null);
      if (res?.warning) toast.warning("Desconectado na central", { description: res.warning });
      else toast.success("WhatsApp desconectado");
      refresh();
    },
    onError: (e: Error) => toast.error("Erro ao desconectar", { description: e.message }),
  });

  const isConnected = Boolean(status.data?.live?.loggedIn);

  useEffect(() => {
    if (!autoQr || isConnected || !deviceId) return;

    let active = true;
    let busy = false;
    let failures = 0;

    const tick = async () => {
      if (busy) return; // evita chamadas sobrepostas na Evolution Go
      busy = true;
      try {
        const res = await qrFn({ data: { deviceId } });
        if (!active) return;
        if (res.connected) {
          setQr(null);
          setAutoQr(false);
          await queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
          toast.success("WhatsApp conectado");
          return;
        }
        if (res.qrcode && connectMode === "qr") {
          failures = 0;
          setQr(res.qrcode);
          return;
        }
        if (res.warning) {
          // Instabilidade momentânea do servidor: seguimos tentando em silêncio.
          failures += 1;
          if (failures >= 4) {
            setAutoQr(false);
            toast.warning("Não foi possível gerar o QR Code", { description: res.warning });
          }
        }
      } catch (e) {
        if (!active) return;
        failures += 1;
        if (failures >= 4) {
          setAutoQr(false);
          toast.error("Erro ao buscar QR Code", { description: (e as Error).message });
        }
      } finally {
        busy = false;
      }
    };
    void tick();
    const id = setInterval(tick, provider === "wuzapi" ? 2000 : 6000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [autoQr, provider, isConnected, qrFn, queryClient, deviceId, connectMode]);

  useEffect(() => {
    if (isConnected && autoQr) {
      setAutoQr(false);
      setQr(null);
    }
  }, [isConnected, autoQr]);

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem configurar os dispositivos do WhatsApp.
        </p>
      </div>
    );
  }

  const config = status.data?.config;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Dispositivos do WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Dê um nome ao dispositivo, escolha qual API ele usa e leia o QR Code. Os tokens e
          endereços ficam em{" "}
          <Link to="/api-conexao" className="underline">
            API de conexão
          </Link>
          .
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Dispositivos</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="newDevice">Nome do novo dispositivo</Label>
              <Input
                id="newDevice"
                placeholder="Ex.: Vendas"
                value={newDeviceLabel}
                onChange={(e) => setNewDeviceLabel(e.target.value)}
                className="md:w-56"
              />
            </div>
            <div className="space-y-2">
              <Label>API do novo dispositivo</Label>
              <Select
                value={newDeviceProvider}
                onValueChange={(v) => setNewDeviceProvider(v as ProviderId)}
              >
                <SelectTrigger className="md:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evolution">Evolution Go</SelectItem>
                  <SelectItem value="wuzapi">WuzAPI</SelectItem>
                  <SelectItem value="waha">WAHA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor do novo dispositivo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newDeviceColor}
                  onChange={(e) => setNewDeviceColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded-md border border-border bg-card p-1"
                  aria-label="Cor do novo dispositivo"
                />
                <span className="text-xs text-muted-foreground">{newDeviceColor}</span>
              </div>
            </div>
            <Button onClick={() => addDevice.mutate()} disabled={addDevice.isPending}>
              <Plus className="mr-1.5 size-4" /> Adicionar
            </Button>
          </div>

        </div>

        {(devices.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum dispositivo ainda. Adicione o primeiro para começar.
          </p>
        ) : (
          <div ref={cardsRef} className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(devices.data ?? []).map((device) => {
              const selected = device.id === deviceId;
              return (
                <div key={device.id} className={selected ? "sm:col-span-2 lg:col-span-3" : undefined}>
                  <DeviceCard
                    label={device.label}
                    company={device.company}
                    displayId={device.displayId}
                    color={device.color}
                    providerLabel={PROVIDER_LABEL[device.provider] ?? device.provider}
                    status={device.status}
                    phone={device.phone}
                    updatedAt={device.updatedAt}
                    isDefault={device.isDefault}
                    isSelected={selected}
                    isConnected={device.status === "connected"}
                    onSelect={() => setDeviceId(device.id)}
                    onEdit={() => setDeviceId(device.id)}
                    onDelete={() => removeDevice.mutate(device.id)}
                    onDisconnect={
                      device.status === "connected" ? () => disconnect.mutate(device.id) : undefined
                    }
                    onMakeDefault={() => {
                      setDeviceId(device.id);
                      makeDefault.mutate(device.id);
                    }}
                  >
                    {selected && (
                      <>
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-foreground">
                              Dispositivo selecionado
                            </h3>
                            <div className="flex items-center gap-2">
                              <Badge variant={isConnected ? "default" : "secondary"}>
                                {STATUS_LABEL[config?.status ?? "disconnected"] ?? "Desconectado"}
                              </Badge>
                              <Button variant="outline" size="sm" onClick={() => refresh()}>
                                <RefreshCw className="mr-1.5 size-4" /> Atualizar
                              </Button>
                              {!device.isDefault && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => makeDefault.mutate(device.id)}
                                  disabled={makeDefault.isPending}
                                >
                                  <Star className="mr-1.5 size-4" /> Tornar padrão
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="deviceLabel">Nome do dispositivo</Label>
                              <Input
                                id="deviceLabel"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="Ex.: Suporte"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Cor do dispositivo</Label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={color}
                                  onChange={(e) => setColor(e.target.value)}
                                  className="h-9 w-14 cursor-pointer rounded-md border border-border bg-card p-1"
                                  aria-label="Cor do dispositivo"
                                />
                                <span className="text-xs text-muted-foreground">{color}</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Qual API este dispositivo usa</Label>
                              <Select
                                value={provider}
                                onValueChange={(v) => setProvider(v as ProviderId)}
                                disabled={!!deviceId}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="evolution">Evolution Go</SelectItem>
                                  <SelectItem value="wuzapi">WuzAPI</SelectItem>
                                  <SelectItem value="waha">WAHA</SelectItem>
                                </SelectContent>
                              </Select>
                              {deviceId ? (
                                <p className="text-xs text-muted-foreground">
                                  A conexão deste dispositivo é fixa. Para usar a outra API, crie um
                                  dispositivo novo.
                                </p>
                              ) : null}
                            </div>
                            <div className="space-y-2">
                              <Label>Fila que recebe as novas conversas</Label>
                              <Select value={queueId} onValueChange={setQueueId}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Automática" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">
                                    Automática (fila de maior prioridade)
                                  </SelectItem>
                                  {(queues.data ?? []).map((q) => (
                                    <SelectItem key={q.id} value={q.id}>
                                      {q.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                Mensagens recebidas neste dispositivo começam nesta fila.
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => saveDevice.mutate()}
                              disabled={saveDevice.isPending || !formLoaded}
                            >
                              <Save className="mr-1.5 size-4" /> Salvar
                            </Button>
                            {isConnected ? (
                              <Button
                                variant="outline"
                                onClick={() => disconnect.mutate(device.id)}
                                disabled={disconnect.isPending}
                              >
                                <PowerOff className="mr-1.5 size-4" /> Desconectar
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                onClick={() => connect.mutate()}
                                disabled={connect.isPending || !status.data?.hasApiKey}
                              >
                                <Plug className="mr-1.5 size-4" /> Conectar
                              </Button>
                            )}
                          </div>

                          <div className="space-y-3 rounded-md border border-border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  Conversas do celular
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Traz para a central as conversas e os grupos que já existem no
                                  aparelho. O que você responder pelo celular também aparece aqui.
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => importarHistorico.mutate(device.id)}
                                disabled={importarHistorico.isPending || !isConnected}
                              >
                                {importarHistorico.isPending ? (
                                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                                ) : (
                                  <History className="mr-1.5 size-4" />
                                )}
                                {importarHistorico.isPending
                                  ? "Importando..."
                                  : "Importar conversas do celular"}
                              </Button>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <Label
                                htmlFor={`historico-${device.id}`}
                                className="text-xs font-normal text-muted-foreground"
                              >
                                Importar sozinho as conversas antigas sempre que o celular for
                                pareado
                              </Label>
                              <Switch
                                id={`historico-${device.id}`}
                                checked={historicoSettings.data?.sincronizarHistorico ?? true}
                                onCheckedChange={(v) => salvarHistorico.mutate(v)}
                                disabled={salvarHistorico.isPending || historicoSettings.isLoading}
                              />
                            </div>
                            {!isConnected && (
                              <p className="text-xs text-muted-foreground">
                                Conecte o dispositivo para importar as conversas.
                              </p>
                            )}
                          </div>

                          {status.data && !status.data.hasApiKey && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted p-3">
                              <p className="text-sm text-muted-foreground">
                                Cadastre o token da {PROVIDER_LABEL[provider]} antes de conectar.
                              </p>
                              <Button asChild size="sm" variant="outline">
                                <Link to="/api-conexao">Abrir API de conexão</Link>
                              </Button>
                            </div>
                          )}
                          {status.data?.error && (
                            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                              {status.data.error}
                            </p>
                          )}
                          {status.data?.config?.connectionTest?.status && (
                            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                              {status.data.config.connectionTest.status === "ok"
                                ? "Teste automático concluído: mensagem de validação enviada para 5562996928605."
                                : status.data.config.connectionTest.status === "executando"
                                  ? "Enviando a mensagem de teste para 5562996928605..."
                                  : `Teste automático falhou: ${status.data.config.connectionTest.detail ?? "não foi possível enviar a mensagem de validação."}`}
                            </p>
                          )}
                        </div>

                        <div className="space-y-4 border-t border-border pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-foreground">
                              Leitura do QR Code
                            </h3>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={autoQr ? "secondary" : "default"}
                                onClick={startQrConnection}
                                disabled={connect.isPending || isConnected || !status.data?.hasApiKey}
                              >
                                <QrCode className="mr-1.5 size-4" />
                                {connect.isPending
                                  ? "Gerando QR Code..."
                                  : autoQr
                                    ? "Parar leitura"
                                    : "Conectar via QR Code"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => loadQr.mutate()}
                                disabled={loadQr.isPending || !status.data?.hasApiKey}
                              >
                                <RefreshCw className="mr-1.5 size-4" /> Atualizar QR Code
                              </Button>
                            </div>

                          </div>

                          {qr ? (
                            <div className="flex flex-col items-center gap-3">
                              <img
                                src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
                                alt="QR Code para conectar o WhatsApp da empresa"
                                className="size-64 rounded-md border border-border bg-white p-2"
                              />
                              <p className="text-center text-sm text-muted-foreground">
                                No celular, abra o WhatsApp e vá em Configurações → Dispositivos
                                conectados → Conectar dispositivo.
                                {autoQr ? " O código é atualizado sozinho enquanto você faz a leitura." : ""}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {isConnected
                                ? "Este dispositivo já está conectado."
                                : "Clique em “Conectar via QR Code” para ler o código aqui mesmo."}
                            </p>
                          )}

                        </div>
                      </>
                    )}
                  </DeviceCard>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
