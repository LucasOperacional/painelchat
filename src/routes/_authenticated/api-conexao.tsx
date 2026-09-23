import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PlugZap, Save } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import { fetchQueues } from "@/lib/central";
import { getApiSettings, saveApiSettings, testApiConnection } from "@/lib/whatsapp.functions";
import {
  removerChaveDivulgaZap,
  salvarChaveDivulgaZap,
  statusChaveDivulgaZap,
} from "@/lib/divulgazap.functions";
import {
  getSystemControl,
  restartSystemConnections,
  saveSystemControl,
} from "@/lib/system-control.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/api-conexao")({
  head: () => ({
    meta: [
      { title: "API de conexão — Central" },
      {
        name: "description",
        content:
          "Cadastre em um só lugar os tokens e endereços das APIs de WhatsApp usadas pela central. A configuração vale para todos os dispositivos.",
      },
      { property: "og:title", content: "API de conexão — Central" },
      {
        property: "og:description",
        content: "Tokens, endereços e fila padrão das integrações de WhatsApp da central.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiConnectionPage,
});

const PROVIDER_LABEL: Record<string, string> = {
  evolution: "Evolution Go",
  wuzapi: "WuzAPI",
  waha: "WAHA",
};

type ProviderId = "evolution" | "wuzapi" | "waha";

function ApiConnectionPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const settingsFn = useServerFn(getApiSettings);
  const saveFn = useServerFn(saveApiSettings);
  const testFn = useServerFn(testApiConnection);

  const settings = useQuery({
    queryKey: ["api-settings"],
    queryFn: () => settingsFn({}),
    enabled: isAdmin,
  });
  const queues = useQuery({ queryKey: ["queues"], queryFn: fetchQueues, enabled: isAdmin });

  const [provider, setProvider] = useState<ProviderId>("evolution");
  const [baseUrl, setBaseUrl] = useState("https://api.nxsplus.xyz");
  const [defaultQueueId, setDefaultQueueId] = useState("auto");
  const [evolutionApiKey, setEvolutionApiKey] = useState("");
  const [wuzapiApiKey, setWuzapiApiKey] = useState("");
  const [wahaApiKey, setWahaApiKey] = useState("");

  const current = (settings.data?.settings ?? []).find((s) => s.provider === provider);

  useEffect(() => {
    if (current) {
      setBaseUrl(current.baseUrl);
      setDefaultQueueId(current.defaultQueueId ?? "auto");
    } else {
      setBaseUrl(
        provider === "wuzapi"
          ? "https://api.wuzapi.com"
          : provider === "waha"
            ? "http://localhost:3000"
            : "https://api.nxsplus.xyz",
      );
      setDefaultQueueId("auto");
    }
    setEvolutionApiKey("");
    setWuzapiApiKey("");
    setWahaApiKey("");
  }, [provider, settings.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          provider,
          baseUrl,
          defaultQueueId: defaultQueueId === "auto" ? null : defaultQueueId,
          apiKey:
            provider === "wuzapi" ? wuzapiApiKey : provider === "waha" ? wahaApiKey : evolutionApiKey,
        },
      }),
    onSuccess: (res) => {
      setEvolutionApiKey("");
      setWuzapiApiKey("");
      setWahaApiKey("");
      const link = res as {
        linked?: number;
        error?: string | null;
        deviceId?: string | null;
      };
      const linked = link?.linked ?? 0;
      const linkError = link?.error ?? null;
      if (linked > 0) {
        toast.success(
          `Configuração salva e ${linked} dispositivo(s) vinculados à ${PROVIDER_LABEL[provider]}`,
          { description: "Abrindo a leitura do QR Code..." },
        );
        void navigate({
          to: "/whatsapp",
          search: { device: link.deviceId ?? undefined, qr: true },
        });
      } else if (linkError) {
        toast.warning("Configuração salva, mas não deu para vincular", { description: linkError });
      } else {
        toast.success("Configuração salva para todos os dispositivos desta API");
      }
      void queryClient.invalidateQueries({ queryKey: ["api-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-devices"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { provider } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(res.message, {
          description: `${res.instances} instância(s) disponíveis no servidor.`,
        });
      } else {
        toast.warning("Conexão não confirmada", { description: res.message });
      }
    },
    onError: (e: Error) => toast.error("Falha ao testar", { description: e.message }),
  });

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Apenas administradores podem configurar as APIs de conexão.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">API de conexão</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre aqui os tokens e endereços de cada integração. O que você salvar vale como padrão
          para todos os dispositivos que usam a mesma API.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-2">
          <Label>Integração</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
            <SelectTrigger className="md:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="evolution">Evolution Go</SelectItem>
              <SelectItem value="wuzapi">WuzAPI</SelectItem>
              <SelectItem value="waha">WAHA</SelectItem>
            </SelectContent>
          </Select>
          {current && (
            <p className="text-xs text-muted-foreground">
              {current.devices === 0
                ? "Nenhum dispositivo usa esta integração ainda."
                : `${current.devices} dispositivo(s) usam esta integração.`}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Endereço da API</Label>
            <Input
              id="baseUrl"
              placeholder="https://api.nxsplus.xyz"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          {provider === "evolution" && (
            <div className="space-y-2">
              <Label htmlFor="evolutionApiKey">API Key global</Label>
              <Input
                id="evolutionApiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.data?.hasEvolutionApiKey
                    ? "já cadastrado — cole para trocar"
                    : "cole a API Key global do servidor"
                }
                value={evolutionApiKey}
                onChange={(e) => setEvolutionApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use a chave global do servidor, não o token individual de uma instância.
              </p>
            </div>
          )}

          {provider === "wuzapi" && (
            <div className="space-y-2">
              <Label htmlFor="wuzapiApiKey">Token de administrador WuzAPI</Label>
              <Input
                id="wuzapiApiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.data?.hasApiKeyByProvider?.wuzapi
                    ? "já cadastrado — cole para trocar"
                    : "cole o token de administrador do servidor WuzAPI"
                }
                value={wuzapiApiKey}
                onChange={(e) => setWuzapiApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Token usado nas rotas <code>/admin/*</code> do WuzAPI (criação de instâncias, QR Code,
                etc.).
              </p>
            </div>
          )}

          {provider === "waha" && (
            <div className="space-y-2">
              <Label htmlFor="wahaApiKey">Chave da API da WAHA</Label>
              <Input
                id="wahaApiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.data?.hasApiKeyByProvider?.waha
                    ? "já cadastrada — cole para trocar"
                    : "cole a chave da API do seu servidor WAHA"
                }
                value={wahaApiKey}
                onChange={(e) => setWahaApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                É a mesma chave configurada no servidor WAHA (WHATSAPP_API_KEY). Cada dispositivo
                vira uma sessão lá dentro, com QR Code lido aqui na central.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Fila que recebe as novas conversas</Label>
            <Select value={defaultQueueId} onValueChange={setDefaultQueueId}>
              <SelectTrigger>
                <SelectValue placeholder="Automática" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automática (fila de maior prioridade)</SelectItem>
                {(queues.data ?? []).map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    {q.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1.5 size-4" /> Salvar como padrão
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
            <PlugZap className="mr-1.5 size-4" /> Testar conexão
          </Button>
        </div>

        {provider === "evolution" && !settings.data?.hasEvolutionApiKey && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Falta cadastrar a API Key global da Evolution Go para a central falar com o
            servidor.
          </p>
        )}

        <div className="space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Endereço para receber as mensagens</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={current?.inboundUrl ?? ""} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(current?.inboundUrl ?? "");
                toast.success("Endereço copiado");
              }}
            >
              Copiar
            </Button>
          </div>
          <p>
            A central registra este endereço sozinha na Evolution Go ao conectar o dispositivo.
          </p>
        </div>
      </section>

      <RemoteAdminSection />

      <DivulgaZapKeySection />

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">

        <h2 className="text-sm font-semibold text-foreground">Resumo das integrações</h2>
        <ul className="space-y-2">
          {(settings.data?.settings ?? []).map((item) => (
            <li key={item.provider} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">{PROVIDER_LABEL[item.provider]}</span>
              <span className="flex items-center gap-2">
                <Badge variant={item.baseUrl ? "default" : "secondary"}>
                  {item.baseUrl ? "Configurada" : "Sem configuração"}
                </Badge>
                <span className="text-muted-foreground">{item.devices} dispositivo(s)</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RemoteAdminSection() {
  const queryClient = useQueryClient();
  const controlFn = useServerFn(getSystemControl);
  const saveFn = useServerFn(saveSystemControl);
  const restartFn = useServerFn(restartSystemConnections);
  const [phone, setPhone] = useState("");

  const control = useQuery({ queryKey: ["system-control"], queryFn: () => controlFn({}) });

  useEffect(() => {
    if (control.data?.adminPhone) setPhone(control.data.adminPhone);
  }, [control.data?.adminPhone]);

  const savePhone = useMutation({
    mutationFn: () => saveFn({ data: { adminPhone: phone } }),
    onSuccess: () => {
      toast.success("Número do administrador atualizado");
      void queryClient.invalidateQueries({ queryKey: ["system-control"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const setState = useMutation({
    mutationFn: (state: "ligado" | "desligado" | "bloqueado") => saveFn({ data: { state } }),
    onSuccess: () => {
      toast.success("Situação do sistema atualizada");
      void queryClient.invalidateQueries({ queryKey: ["system-control"] });
    },
    onError: (e: Error) => toast.error("Não foi possível alterar", { description: e.message }),
  });

  const restart = useMutation({
    mutationFn: () => restartFn({}),
    onSuccess: (res) => {
      toast.success("Conexões reiniciadas", {
        description: (res as { linhas: string[] }).linhas.join("\n"),
      });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-status"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-devices"] });
    },
    onError: (e: Error) => toast.error("Falha ao reiniciar", { description: e.message }),
  });

  const state = control.data?.state ?? "ligado";

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Controle do sistema</h2>
          <p className="text-xs text-muted-foreground">
            Reinicie as conexões e defina o número que pode comandar a central pelo WhatsApp.
          </p>
        </div>
        <Badge variant={state === "ligado" ? "default" : "secondary"}>{state}</Badge>
      </div>

      <div className="space-y-2 md:max-w-md">
        <Label htmlFor="adminPhone">Número do administrador (só ele pode comandar)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="adminPhone"
            inputMode="numeric"
            placeholder="5562996928605"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => savePhone.mutate()}
            disabled={savePhone.isPending || phone.replace(/\D/g, "").length < 10}
          >
            <Save className="mr-1.5 size-4" /> Salvar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Esse número recebe o menu ao enviar “menu”, “#admin” ou “#sistema”. Nenhum outro número
          consegue executar as ações.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => restart.mutate()} disabled={restart.isPending}>
          <PlugZap className="mr-1.5 size-4" /> Reiniciar conexões e APIs
        </Button>
        <Button
          variant="outline"
          onClick={() => setState.mutate("ligado")}
          disabled={setState.isPending || state === "ligado"}
        >
          Ligar sistema
        </Button>
        <Button
          variant="outline"
          onClick={() => setState.mutate("desligado")}
          disabled={setState.isPending || state === "desligado"}
        >
          Desligar
        </Button>
        <Button
          variant="outline"
          onClick={() => setState.mutate("bloqueado")}
          disabled={setState.isPending || state === "bloqueado"}
        >
          Bloquear (manutenção)
        </Button>
      </div>
    </section>
  );
}


function DivulgaZapKeySection() {
  const queryClient = useQueryClient();
  const statusFn = useServerFn(statusChaveDivulgaZap);
  const saveFn = useServerFn(salvarChaveDivulgaZap);
  const removeFn = useServerFn(removerChaveDivulgaZap);
  const [apiKey, setApiKey] = useState("");

  const status = useQuery({ queryKey: ["divulgazap-key"], queryFn: () => statusFn({}) });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { apiKey } }),
    onSuccess: () => {
      setApiKey("");
      toast.success("Chave do DivulgaZap salva");
      void queryClient.invalidateQueries({ queryKey: ["divulgazap-key"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => removeFn({}),
    onSuccess: () => {
      toast.success("Chave removida");
      void queryClient.invalidateQueries({ queryKey: ["divulgazap-key"] });
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">DivulgaZap</h2>
          <p className="text-xs text-muted-foreground">
            Chave usada para os disparos de mensagens e notificações.
          </p>
        </div>
        <Badge variant={status.data?.configurado ? "default" : "secondary"}>
          {status.data?.configurado ? "Cadastrada" : "Não cadastrada"}
        </Badge>
      </div>

      <div className="space-y-2 md:max-w-md">
        <Label htmlFor="divulgazapKey">Chave da API</Label>
        <Input
          id="divulgazapKey"
          type="password"
          autoComplete="off"
          placeholder={
            status.data?.configurado ? "já cadastrada — cole para trocar" : "dz_..."
          }
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending || apiKey.trim().length < 10}>
          <Save className="mr-1.5 size-4" /> Salvar chave
        </Button>
        {status.data?.configurado && (
          <Button variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Remover
          </Button>
        )}
      </div>
    </section>
  );
}

