import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Palette,
  Image as ImageIcon,
  Upload,
  Headset,
  Users,
  ListOrdered,
  Plus,
  Pencil,
  Trash2,
  QrCode,
  PhoneCall,
  Check,
  Gauge,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { applyBrandingColors, BRANDING_THEMES } from "@/lib/branding-themes";
import { getBrandingSettings, saveBrandingSettings } from "@/lib/projects.functions";
import { getInboundSettings, saveInboundSettings } from "@/lib/inbound-settings.functions";
import {
  getMisticpayStatus,
  saveMisticpaySettings,
  clearMisticpaySettings,
} from "@/lib/misticpay.functions";
import { getEfiStatus, saveEfiSettings, clearEfiSettings } from "@/lib/efi.functions";
import {
  getAltispayStatus,
  saveAltispaySettings,
  clearAltispaySettings,
} from "@/lib/altispay.functions";
import {
  getWavoipStatus,
  saveWavoipSettings,
  clearWavoipSettings,
} from "@/lib/wavoip.functions";
import {
  listButtonMenus,
  saveButtonMenu,
  deleteButtonMenu,
  listMenuTargets,
  MENU_KIND_LABELS,
  type ButtonMenu,
  type ButtonMenuKind,
  type MenuOptionRoute,
} from "@/lib/button-menus.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  statusOtimizacao,
  salvarOtimizacao,
  otimizarAgora,
} from "@/lib/otimizacao.functions";

type ConfigSectionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  status?: string | undefined;
  statusOk?: boolean | undefined;
  children: React.ReactNode;
};

function ConfigSectionCard({
  icon: Icon,
  title,
  description,
  status,
  statusOk,
  children,
}: ConfigSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card
        className="cursor-pointer transition-colors hover:bg-muted/40"
        onClick={() => setOpen(true)}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <span className="flex-1">{title}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{description}</p>
          {status && (
            <p
              className={`text-xs font-medium ${
                statusOk === false ? "text-destructive" : "text-success"
              }`}
            >
              {status}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="size-5 text-primary" /> {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatarBytes(valor: number | null | undefined) {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function OtimizacaoCard() {
  const statusFn = useServerFn(statusOtimizacao);
  const saveFn = useServerFn(salvarOtimizacao);
  const runFn = useServerFn(otimizarAgora);
  const queryClient = useQueryClient();

  const status = useQuery({ queryKey: ["otimizacao"], queryFn: () => statusFn({}) });

  const [ativo, setAtivo] = useState(true);
  const [intervalo, setIntervalo] = useState("6");
  const [eventos, setEventos] = useState("6");
  const [logs, setLogs] = useState("7");
  const [mensagens, setMensagens] = useState("0");
  const [anexos, setAnexos] = useState(true);

  useEffect(() => {
    const s = status.data?.settings;
    if (!s) return;
    setAtivo(s.ativo);
    setIntervalo(String(s.intervalo_horas));
    setEventos(String(s.retencao_eventos_horas));
    setLogs(String(s.retencao_logs_dias));
    setMensagens(String(s.retencao_mensagens_dias));
    setAnexos(s.limpar_anexos_orfaos);
  }, [status.data]);

  const salvar = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          ativo,
          intervaloHoras: Math.max(Number(intervalo) || 6, 1),
          retencaoEventosHoras: Math.max(Number(eventos) || 6, 1),
          retencaoLogsDias: Math.max(Number(logs) || 7, 1),
          retencaoMensagensDias: Math.max(Number(mensagens) || 0, 0),
          limparAnexosOrfaos: anexos,
        },
      }),
    onSuccess: () => {
      toast.success("Limpeza automática atualizada");
      void queryClient.invalidateQueries({ queryKey: ["otimizacao"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const rodar = useMutation({
    mutationFn: () => runFn({}),
    onSuccess: (rel) => {
      toast.success("Servidor otimizado", {
        description: `Espaço liberado: ${formatarBytes(rel.liberado)} — ${rel.eventos_removidos} registro(s) antigos removidos.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["otimizacao"] });
    },
    onError: (e: Error) => toast.error("Falha ao otimizar", { description: e.message }),
  });

  const uso = status.data?.uso;
  const ultimo = status.data?.settings.ultimo_relatorio ?? null;
  const ultimaExec = status.data?.settings.ultima_execucao ?? null;

  const statusText = ativo
    ? ultimaExec
      ? `Ativada — última em ${new Date(ultimaExec).toLocaleString("pt-BR")}`
      : "Ativada — ainda não executada"
    : "Desativada";

  return (
    <ConfigSectionCard
      icon={Gauge}
      title="Otimização automática do servidor"
      description="Limpa registros antigos, apaga arquivos sem conversa e libera espaço sozinho."
      status={statusText}
      statusOk={ativo}
    >
      <p className="text-sm text-muted-foreground">
        O sistema limpa registros antigos, apaga arquivos sem conversa e libera espaço sozinho, na
        frequência escolhida abaixo.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Espaço usado</p>
          <p className="text-lg font-semibold text-foreground">
            {formatarBytes(uso?.tamanho_banco)}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Mensagens guardadas</p>
          <p className="text-lg font-semibold text-foreground">{uso?.mensagens ?? 0}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Registros técnicos</p>
          <p className="text-lg font-semibold text-foreground">{uso?.eventos ?? 0}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Limpeza automática</p>
          <p className="text-xs text-muted-foreground">{statusText}</p>
        </div>
        <Switch checked={ativo} onCheckedChange={setAtivo} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="otim-intervalo">Rodar a cada (horas)</Label>
          <Input
            id="otim-intervalo"
            inputMode="numeric"
            value={intervalo}
            onChange={(e) => setIntervalo(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="otim-eventos">Guardar registros técnicos por (horas)</Label>
          <Input
            id="otim-eventos"
            inputMode="numeric"
            value={eventos}
            onChange={(e) => setEventos(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="otim-logs">Guardar relatórios de segurança por (dias)</Label>
          <Input
            id="otim-logs"
            inputMode="numeric"
            value={logs}
            onChange={(e) => setLogs(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="otim-mensagens">Apagar conversas com mais de (dias)</Label>
          <Input
            id="otim-mensagens"
            inputMode="numeric"
            value={mensagens}
            onChange={(e) => setMensagens(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use 0 para nunca apagar mensagens do histórico.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">Apagar arquivos sem conversa</p>
          <p className="text-xs text-muted-foreground">
            Remove fotos e áudios de conversas que já não existem mais.
          </p>
        </div>
        <Switch checked={anexos} onCheckedChange={setAnexos} />
      </div>

      {ultimo && (
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Última otimização</p>
          <p>
            Espaço liberado: {formatarBytes(ultimo.liberado)} · {ultimo.eventos_removidos} registro
            (s) técnicos · {ultimo.mensagens_removidas} mensagem(ns) antigas.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salvar limpeza automática
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => rodar.mutate()}
          disabled={rodar.isPending}
        >
          {rodar.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Otimizar agora
        </Button>
      </div>
    </ConfigSectionCard>
  );
}

function MisticpayCard() {
  const loadStatus = useServerFn(getMisticpayStatus);
  const save = useServerFn(saveMisticpaySettings);
  const clear = useServerFn(clearMisticpaySettings);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["misticpay-status"], queryFn: () => loadStatus({}) });

  const [form, setForm] = useState({
    clientId: "",
    clientSecret: "",
    baseUrl: "https://api.misticpay.com/api",
    authMode: "basic" as "basic" | "cics",
    defaultPayerName: "",
    defaultPayerDocument: "",
  });

  useEffect(() => {
    const data = status.data;
    if (!data) return;
    setForm((f) => ({
      ...f,
      clientId: data.clientId || f.clientId,
      baseUrl: data.baseUrl || f.baseUrl,
      authMode: data.authMode,
      defaultPayerName: data.defaultPayerName || f.defaultPayerName,
      defaultPayerDocument: data.defaultPayerDocument || f.defaultPayerDocument,
    }));
  }, [status.data]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: async () => {
      toast.success("Credenciais da MisticPay salvas");
      setForm((f) => ({ ...f, clientSecret: "" }));
      await queryClient.invalidateQueries({ queryKey: ["misticpay-status"] });
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  const clearMutation = useMutation({
    mutationFn: () => clear({}),
    onSuccess: async () => {
      toast.success("Credenciais removidas");
      await queryClient.invalidateQueries({ queryKey: ["misticpay-status"] });
    },
    onError: (error: Error) => toast.error("Não foi possível remover", { description: error.message }),
  });

  const misticStatus = status.data?.configured
    ? status.data.error
      ? "Erro na conexão"
      : status.data.account
        ? `Conectado como ${status.data.account.name ?? status.data.account.email}`
        : "Credenciais cadastradas"
    : "Não configurado";

  return (
    <ConfigSectionCard
      icon={QrCode}
      title="MisticPay (cobrança Pix)"
      description="Gere cobranças Pix e envie QR Code + copia e cola para o cliente."
      status={misticStatus}
      statusOk={status.data?.configured && !status.data?.error}
    >
      <p className="text-sm text-muted-foreground">
        Com as credenciais salvas, o atendimento gera a cobrança com valor e envia o QR Code
        junto do código Pix copia e cola para o cliente.
      </p>

      {status.data?.configured && (
        <div className="rounded-md border p-3 text-sm">
          {status.data.error ? (
            <span className="text-destructive">{status.data.error}</span>
          ) : status.data.account ? (
            <span>
              Conectado como <strong>{status.data.account.name ?? status.data.account.email}</strong>
              {typeof status.data.account.availableBalance === "number" && (
                <> · saldo R$ {status.data.account.availableBalance.toFixed(2).replace(".", ",")}</>
              )}
            </span>
          ) : (
            <span>Credenciais cadastradas.</span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mp-client-id">Client ID (pk_… ou ci_…)</Label>
          <Input
            id="mp-client-id"
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            placeholder="pk_..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mp-client-secret">Client Secret (sk_… ou cs_…)</Label>
          <Input
            id="mp-client-secret"
            type="password"
            value={form.clientSecret}
            onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
            placeholder={status.data?.configured ? "•••••• (salvo)" : "sk_..."}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mp-mode">Tipo de credencial</Label>
          <select
            id="mp-mode"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={form.authMode}
            onChange={(e) =>
              setForm((f) => ({ ...f, authMode: e.target.value as "basic" | "cics" }))
            }
          >
            <option value="basic">Chave de acesso (pk_/sk_)</option>
            <option value="cics">Credencial legada (ci/cs)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mp-base">Endereço da API</Label>
          <Input
            id="mp-base"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mp-payer-name">Nome padrão do pagador</Label>
          <Input
            id="mp-payer-name"
            value={form.defaultPayerName}
            onChange={(e) => setForm((f) => ({ ...f, defaultPayerName: e.target.value }))}
            placeholder="Cliente"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mp-payer-doc">CPF padrão do pagador</Label>
          <Input
            id="mp-payer-doc"
            value={form.defaultPayerDocument}
            onChange={(e) => setForm((f) => ({ ...f, defaultPayerDocument: e.target.value }))}
            placeholder="12345678909"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            saveMutation.isPending || !form.clientId.trim() || !form.clientSecret.trim()
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salvar credenciais
        </Button>
        {status.data?.configured && (
          <Button
            type="button"
            variant="outline"
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Remover
          </Button>
        )}
      </div>
    </ConfigSectionCard>
  );
}

function EfiCard() {
  const loadStatus = useServerFn(getEfiStatus);
  const save = useServerFn(saveEfiSettings);
  const clear = useServerFn(clearEfiSettings);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["efi-status"], queryFn: () => loadStatus({}) });

  const [form, setForm] = useState({
    clientId: "",
    clientSecret: "",
    environment: "producao" as "producao" | "homologacao",
    pixKey: "",
    relayUrl: "",
    relayToken: "",
    expirationSeconds: 3600,
    certificateP12: "",
    certificateName: "",
    certificatePassword: "",
  });

  useEffect(() => {
    const data = status.data;
    if (!data) return;
    setForm((f) => ({
      ...f,
      clientId: data.clientId || f.clientId,
      environment: data.environment,
      pixKey: data.pixKey || f.pixKey,
      relayUrl: data.relayUrl || f.relayUrl,
      expirationSeconds: data.expirationSeconds || f.expirationSeconds,
    }));
  }, [status.data]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: async () => {
      toast.success("Credenciais da Efí salvas");
      setForm((f) => ({ ...f, clientSecret: "", relayToken: "", certificateP12: "" }));
      await queryClient.invalidateQueries({ queryKey: ["efi-status"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  const clearMutation = useMutation({
    mutationFn: () => clear({}),
    onSuccess: async () => {
      toast.success("Credenciais removidas");
      await queryClient.invalidateQueries({ queryKey: ["efi-status"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível remover", { description: error.message }),
  });

  const efiStatus = status.data?.configured
    ? status.data.connected
      ? `Conectado à Efí (${status.data.environment})`
      : status.data.error
        ? "Erro na conexão"
        : "Credenciais cadastradas"
    : "Não configurado";

  return (
    <ConfigSectionCard
      icon={QrCode}
      title="Efí Bank (cobrança Pix)"
      description="Cobre via Pix com certificado digital e intermediário seguro."
      status={efiStatus}
      statusOk={status.data?.configured && status.data?.connected}
    >
      <p className="text-sm text-muted-foreground">
        A Efí exige o certificado digital da conta em toda chamada. Informe o endereço do seu
        servidor intermediário (que guarda o certificado e repassa os pedidos para a Efí) junto
        das credenciais da aplicação.
      </p>

      {status.data?.configured && (
        <div className="rounded-md border p-3 text-sm">
          {status.data.connected ? (
            <span>Conectado à Efí ({status.data.environment}).</span>
          ) : status.data.error ? (
            <span className="text-destructive">{status.data.error}</span>
          ) : (
            <span>Credenciais cadastradas.</span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="efi-client-id">Client ID</Label>
          <Input
            id="efi-client-id"
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            placeholder="Client_Id_..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-client-secret">Client Secret</Label>
          <Input
            id="efi-client-secret"
            type="password"
            value={form.clientSecret}
            onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
            placeholder={status.data?.configured ? "•••••• (salvo)" : "Client_Secret_..."}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-env">Ambiente</Label>
          <select
            id="efi-env"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={form.environment}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                environment: e.target.value as "producao" | "homologacao",
              }))
            }
          >
            <option value="producao">Produção</option>
            <option value="homologacao">Homologação (testes)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-key">Chave Pix da conta Efí</Label>
          <Input
            id="efi-key"
            value={form.pixKey}
            onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))}
            placeholder="chave@email.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-relay">Endereço do intermediário</Label>
          <Input
            id="efi-relay"
            value={form.relayUrl}
            onChange={(e) => setForm((f) => ({ ...f, relayUrl: e.target.value }))}
            placeholder="https://meuservidor.com.br/efi"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-relay-token">Senha do intermediário (opcional)</Label>
          <Input
            id="efi-relay-token"
            type="password"
            value={form.relayToken}
            onChange={(e) => setForm((f) => ({ ...f, relayToken: e.target.value }))}
            placeholder={status.data?.relayTokenSet ? "•••••• (salvo)" : "Enviada como x-relay-token"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-cert">Certificado digital (.p12)</Label>
          <Input
            id="efi-cert"
            type="file"
            accept=".p12,.pfx,application/x-pkcs12"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 250_000) {
                toast.error("Arquivo muito grande para um certificado .p12");
                return;
              }
              const buffer = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              buffer.forEach((b) => {
                binary += String.fromCharCode(b);
              });
              setForm((f) => ({
                ...f,
                certificateP12: btoa(binary),
                certificateName: file.name,
              }));
              toast.success(`Certificado ${file.name} pronto para salvar`);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {form.certificateName
              ? `Selecionado: ${form.certificateName}`
              : status.data?.certificateSet
                ? `Salvo: ${status.data.certificateName || "certificado.p12"}`
                : "Baixe o certificado no painel da Efí e envie o arquivo aqui."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-cert-pass">Senha do certificado (se houver)</Label>
          <Input
            id="efi-cert-pass"
            type="password"
            value={form.certificatePassword}
            onChange={(e) => setForm((f) => ({ ...f, certificatePassword: e.target.value }))}
            placeholder="Normalmente em branco"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="efi-exp">Validade da cobrança (segundos)</Label>
          <Input
            id="efi-exp"
            inputMode="numeric"
            value={String(form.expirationSeconds)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                expirationSeconds: Number(e.target.value.replace(/\D/g, "")) || 3600,
              }))
            }
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O certificado fica guardado com segurança aqui e é enviado ao seu intermediário nos
        cabeçalhos x-efi-certificate (arquivo em base64) e x-efi-certificate-password. O
        intermediário repassa caminho, método, corpo e autorização para{" "}
        {form.environment === "homologacao" ? "pix-h.api.efipay.com.br" : "pix.api.efipay.com.br"}{" "}
        usando esse certificado.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={saveMutation.isPending || !form.clientId.trim() || !form.clientSecret.trim()}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salvar credenciais
        </Button>
        {status.data?.configured && (
          <Button
            type="button"
            variant="outline"
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Remover
          </Button>
        )}
      </div>
    </ConfigSectionCard>
  );
}

function AltispayCard() {
  const loadStatus = useServerFn(getAltispayStatus);
  const save = useServerFn(saveAltispaySettings);
  const clear = useServerFn(clearAltispaySettings);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["altispay-status"], queryFn: () => loadStatus({}) });

  const [form, setForm] = useState({
    apiKey: "",
    environment: "producao" as "producao" | "sandbox",
    baseUrl: "",
    defaultPayerName: "",
    defaultPayerDocument: "",
    defaultPayerEmail: "",
    webhookToken: "",
  });

  useEffect(() => {
    const data = status.data;
    if (!data) return;
    setForm((f) => ({
      ...f,
      environment: data.environment,
      baseUrl: data.baseUrl || f.baseUrl,
      defaultPayerName: data.defaultPayerName || f.defaultPayerName,
      defaultPayerDocument: data.defaultPayerDocument || f.defaultPayerDocument,
      defaultPayerEmail: data.defaultPayerEmail || f.defaultPayerEmail,
    }));
  }, [status.data]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: async () => {
      toast.success("Credenciais da AltisPay salvas");
      setForm((f) => ({ ...f, apiKey: "", webhookToken: "" }));
      await queryClient.invalidateQueries({ queryKey: ["altispay-status"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  const clearMutation = useMutation({
    mutationFn: () => clear({}),
    onSuccess: async () => {
      toast.success("Credenciais removidas");
      await queryClient.invalidateQueries({ queryKey: ["altispay-status"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível remover", { description: error.message }),
  });

  const altisStatus = status.data?.configured
    ? `Chave cadastrada (${status.data.apiKeyPreview}) — ambiente ${
        status.data.environment === "sandbox" ? "de teste" : "de produção"
      }`
    : "Não configurado";

  return (
    <ConfigSectionCard
      icon={QrCode}
      title="AltisPay (cobrança Pix)"
      description="Cobre via AltisPay com chave de API e webhook de confirmação."
      status={altisStatus}
      statusOk={status.data?.configured}
    >
      <p className="text-sm text-muted-foreground">
        Gere a chave de API no painel da AltisPay em Integração → Chave de API e cole aqui. A
        chave de teste começa com altis_sandbox_ e a de produção com altis_.
      </p>

      {status.data?.configured && (
        <div className="rounded-md border p-3 text-sm">
          Chave cadastrada ({status.data.apiKeyPreview}) — ambiente{" "}
          {status.data.environment === "sandbox" ? "de teste" : "de produção"}.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="altis-key">Chave de API</Label>
          <Input
            id="altis-key"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            placeholder={status.data?.configured ? "Deixe em branco para manter" : "altis_..."}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altis-env">Ambiente</Label>
          <select
            id="altis-env"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={form.environment}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                environment: e.target.value as "producao" | "sandbox",
                baseUrl: "",
              }))
            }
          >
            <option value="producao">Produção</option>
            <option value="sandbox">Teste (sandbox)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altis-base">Endereço da API (opcional)</Label>
          <Input
            id="altis-base"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://app.altispay.com.br/api/v1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altis-payer">Nome padrão do pagador</Label>
          <Input
            id="altis-payer"
            value={form.defaultPayerName}
            onChange={(e) => setForm((f) => ({ ...f, defaultPayerName: e.target.value }))}
            placeholder="Cliente"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altis-doc">CPF/CNPJ padrão</Label>
          <Input
            id="altis-doc"
            value={form.defaultPayerDocument}
            onChange={(e) => setForm((f) => ({ ...f, defaultPayerDocument: e.target.value }))}
            placeholder="Usado quando o cliente não informa"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altis-email">E-mail padrão do pagador</Label>
          <Input
            id="altis-email"
            value={form.defaultPayerEmail}
            onChange={(e) => setForm((f) => ({ ...f, defaultPayerEmail: e.target.value }))}
            placeholder="financeiro@suaempresa.com.br"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="altis-webhook">Segredo do webhook</Label>
          <Input
            id="altis-webhook"
            type="password"
            value={form.webhookToken}
            onChange={(e) => setForm((f) => ({ ...f, webhookToken: e.target.value }))}
            placeholder={
              status.data?.webhookConfigured ? "Deixe em branco para manter" : "X-Altis-Token"
            }
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        No painel da AltisPay, em Integração → Webhook, aponte os eventos PAYMENT_CONFIRMED e
        PAYMENT_RECEIVED para {typeof window !== "undefined" ? window.location.origin : ""}
        /api/public/altispay e use o mesmo segredo informado acima. Assim o cliente recebe o
        aviso de pagamento confirmado na hora.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            saveMutation.isPending || (!form.apiKey.trim() && !status.data?.configured)
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salvar credenciais
        </Button>
        {status.data?.configured && (
          <Button
            type="button"
            variant="outline"
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Remover
          </Button>
        )}
      </div>
    </ConfigSectionCard>
  );
}


function WavoipCard() {
  const loadStatus = useServerFn(getWavoipStatus);
  const save = useServerFn(saveWavoipSettings);
  const clear = useServerFn(clearWavoipSettings);
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["wavoip-status"], queryFn: () => loadStatus({}) });

  const [form, setForm] = useState({
    deviceToken: "",
    email: "",
    password: "",
    baseUrl: "",
    callUrl: "",
    startIfReady: true,
    closeAfterCall: true,
  });

  useEffect(() => {
    const data = status.data;
    if (!data) return;
    setForm((f) => ({
      ...f,
      email: data.email || f.email,
      baseUrl: data.baseUrl || f.baseUrl,
      callUrl: data.callUrl || f.callUrl,
      startIfReady: data.startIfReady,
      closeAfterCall: data.closeAfterCall,
    }));
  }, [status.data]);

  const saveMutation = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: async () => {
      toast.success("Dados da Wavoip salvos");
      setForm((f) => ({ ...f, password: "" }));
      await queryClient.invalidateQueries({ queryKey: ["wavoip-status"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  const clearMutation = useMutation({
    mutationFn: () => clear({}),
    onSuccess: async () => {
      toast.success("Dados removidos");
      await queryClient.invalidateQueries({ queryKey: ["wavoip-status"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível remover", { description: error.message }),
  });

  const wavoipStatus = status.data?.configured
    ? `Token cadastrado (${status.data.deviceTokenPreview})${
        status.data.historyReady ? " — histórico liberado" : ""
      }`
    : "Não configurado";

  return (
    <ConfigSectionCard
      icon={PhoneCall}
      title="Wavoip (ligações de WhatsApp)"
      description="Libere o botão de ligar nas conversas e registre histórico de chamadas."
      status={wavoipStatus}
      statusOk={status.data?.configured}
    >
      <p className="text-sm text-muted-foreground">
        Copie o token do aparelho no painel da Wavoip e cole abaixo para liberar o botão "Ligar"
        nas conversas. O e-mail e a senha da sua conta Wavoip são usados só para mostrar o
        histórico de chamadas.
      </p>

      {status.data?.configured && (
        <div className="rounded-md border p-3 text-sm">
          Token cadastrado ({status.data.deviceTokenPreview})
          {status.data.historyReady ? " — histórico de chamadas liberado." : "."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="wav-token">Token do aparelho</Label>
          <Input
            id="wav-token"
            type="password"
            value={form.deviceToken}
            onChange={(e) => setForm((f) => ({ ...f, deviceToken: e.target.value }))}
            placeholder={status.data?.configured ? "Deixe em branco para manter" : "Token Wavoip"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wav-email">E-mail da conta Wavoip</Label>
          <Input
            id="wav-email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="voce@suaempresa.com.br"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wav-pass">Senha da conta Wavoip</Label>
          <Input
            id="wav-pass"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={status.data?.historyReady ? "Deixe em branco para manter" : "••••••••"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wav-base">Endereço da API (opcional)</Label>
          <Input
            id="wav-base"
            value={form.baseUrl}
            onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
            placeholder="https://api.wavoip.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wav-call">Endereço da tela de ligação (opcional)</Label>
          <Input
            id="wav-call"
            value={form.callUrl}
            onChange={(e) => setForm((f) => ({ ...f, callUrl: e.target.value }))}
            placeholder="https://app.wavoip.com/call"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.startIfReady}
            onChange={(e) => setForm((f) => ({ ...f, startIfReady: e.target.checked }))}
          />
          Iniciar a chamada assim que a tela abrir
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.closeAfterCall}
            onChange={(e) => setForm((f) => ({ ...f, closeAfterCall: e.target.checked }))}
          />
          Fechar a janela quando a ligação terminar
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            saveMutation.isPending || (!form.deviceToken.trim() && !status.data?.configured)
          }
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Salvar dados
        </Button>
        {status.data?.configured && (
          <Button
            type="button"
            variant="outline"
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            Remover
          </Button>
        )}
      </div>
    </ConfigSectionCard>
  );
}


function ButtonMenusCard() {
  const load = useServerFn(listButtonMenus);
  const save = useServerFn(saveButtonMenu);
  const remove = useServerFn(deleteButtonMenu);
  const queryClient = useQueryClient();
  const menus = useQuery({ queryKey: ["button-menus"], queryFn: () => load({}) });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ButtonMenu | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [kind, setKind] = useState<ButtonMenuKind>("text");
  const [footer, setFooter] = useState("");
  const [buttonText, setButtonText] = useState("Ver menu");
  const [imageUrl, setImageUrl] = useState("");
  const [optionRoutes, setOptionRoutes] = useState<MenuOptionRoute[]>([]);

  const loadTargets = useServerFn(listMenuTargets);
  const targets = useQuery({ queryKey: ["menu-targets"], queryFn: () => loadTargets({}) });

  const optionLabels = optionsText
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

  const routeAt = (i: number): MenuOptionRoute =>
    optionRoutes[i] ?? { action: "none", targetId: null, reply: "" };

  const updateRoute = (i: number, patch: Partial<MenuOptionRoute>) => {
    setOptionRoutes((prev) => {
      const next = optionLabels.map((_, idx) => prev[idx] ?? { action: "none" as const, targetId: null, reply: "" });
      next[i] = { ...next[i]!, ...patch };
      return next;
    });
  };

  const openEditor = (menu: ButtonMenu | null) => {
    setEditing(menu);
    setTitle(menu?.title ?? "");
    setMessage(menu?.message ?? "");
    setOptionsText((menu?.options ?? []).join("\n"));
    setKind(menu?.kind ?? "text");
    setFooter(menu?.footer ?? "");
    setButtonText(menu?.button_text || "Ver menu");
    setImageUrl(menu?.image_url ?? "");
    setOptionRoutes(menu?.option_routes ?? []);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: editing?.id,
          title: title.trim(),
          message: message.trim(),
          options: optionsText
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean),
          kind,
          footer: footer.trim(),
          buttonText: buttonText.trim() || "Ver menu",
          imageUrl: imageUrl.trim(),
          optionRoutes: optionLabels.map((_, i) => routeAt(i)),
        },
      }),
    onSuccess: async () => {
      toast.success(editing ? "Menu atualizado" : "Menu criado");
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["button-menus"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar o menu", { description: error.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: async () => {
      toast.success("Menu removido");
      await queryClient.invalidateQueries({ queryKey: ["button-menus"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível remover", { description: error.message }),
  });

  const menusCount = (menus.data ?? []).length;

  return (
    <ConfigSectionCard
      icon={ListOrdered}
      title="Menus de botão"
      description="Menus numerados que o atendente envia ao iniciar uma conversa."
      status={menus.isLoading ? "Carregando..." : `${menusCount} menu(s) criado(s)`}
      statusOk={menusCount > 0}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Menus numerados que o atendente envia ao iniciar uma conversa. O cliente responde com o
          número da opção.
        </p>
        <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
          <Plus className="size-4" /> Novo menu
        </Button>
      </div>

      {menus.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : menusCount === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum menu criado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {(menus.data ?? []).map((menu) => (
            <li
              key={menu.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{menu.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {MENU_KIND_LABELS[menu.kind ?? "text"]} · {menu.options.length} opção(ões):{" "}
                  {menu.options.join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEditor(menu)}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(menu.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar menu" : "Novo menu de botão"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="menu-title">Título</Label>
              <Input
                id="menu-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Menu de atendimento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-message">Mensagem de introdução (opcional)</Label>
              <Textarea
                id="menu-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex.: Olá! Escolha uma das opções abaixo:"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="menu-options">Opções (uma por linha)</Label>
              <Textarea
                id="menu-options"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"Suporte\nVendas\nFinanceiro"}
                rows={4}
              />
            </div>
            {optionLabels.length > 0 && (
              <div className="space-y-2">
                <Label>Para onde enviar ao clicar</Label>
                <div className="space-y-3">
                  {optionLabels.map((label, i) => {
                    const route = routeAt(i);
                    const value =
                      route.action === "none" || !route.targetId
                        ? "none"
                        : `${route.action}:${route.targetId}`;
                    return (
                      <div key={`${label}-${i}`} className="rounded-lg border p-3 space-y-2">
                        <p className="text-sm font-medium">
                          {i + 1} - {label}
                        </p>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "none") {
                              updateRoute(i, { action: "none", targetId: null });
                              return;
                            }
                            const [action, id] = v.split(":");
                            updateRoute(i, {
                              action: action as MenuOptionRoute["action"],
                              targetId: id ?? null,
                            });
                          }}
                        >
                          <option value="none">Manter na conversa (sem transferir)</option>
                          {(targets.data?.queues ?? []).map((q) => (
                            <option key={q.id} value={`queue:${q.id}`}>
                              Fila · {q.name}
                            </option>
                          ))}
                          {(targets.data?.departments ?? []).map((d) => (
                            <option key={d.id} value={`department:${d.id}`}>
                              Departamento · {d.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={route.reply}
                          onChange={(e) => updateRoute(i, { reply: e.target.value })}
                          placeholder="Mensagem de resposta ao clicar (opcional)"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Formato no WhatsApp</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MENU_KIND_LABELS) as ButtonMenuKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      kind === k
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {MENU_KIND_LABELS[k]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {kind === "text"
                  ? "Mensagem numerada; o cliente responde com o número."
                  : kind === "button"
                    ? "Botões de resposta rápida (máximo 3 opções)."
                    : "Botão que abre uma lista com todas as opções."}
              </p>
            </div>
            {(
              <div className="space-y-2">
                <Label htmlFor="menu-footer">Rodapé (opcional)</Label>
                <Input
                  id="menu-footer"
                  value={footer}
                  onChange={(e) => setFooter(e.target.value)}
                  placeholder="Ex.: Atendimento das 8h às 18h"
                />
              </div>
            )}
            {kind === "list" && (
              <div className="space-y-2">
                <Label htmlFor="menu-button-text">Texto do botão que abre a lista</Label>
                <Input
                  id="menu-button-text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="Ver menu"
                />
              </div>
            )}
            {kind === "button" && (
              <div className="space-y-2">
                <Label htmlFor="menu-image">Imagem no topo (opcional)</Label>
                <Input
                  id="menu-image"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!title.trim() || !optionsText.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfigSectionCard>
  );
}

function GroupMessagesCard() {
  const load = useServerFn(getInboundSettings);
  const save = useServerFn(saveInboundSettings);
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["inbound-settings"], queryFn: () => load({}) });

  const mutation = useMutation({
    mutationFn: (ignoreGroups: boolean) => save({ data: { ignoreGroups } }),
    onSuccess: async (_r, ignoreGroups) => {
      toast.success(
        ignoreGroups ? "Mensagens de grupos serão ignoradas" : "Mensagens de grupos ativadas",
      );
      await queryClient.invalidateQueries({ queryKey: ["inbound-settings"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível salvar", { description: error.message }),
  });

  const ignoreGroups = settings.data?.ignoreGroups ?? false;

  return (
    <ConfigSectionCard
      icon={Users}
      title="Mensagens de grupos"
      description="Escolha se mensagens recebidas em grupos entram na central."
      status={ignoreGroups ? "Grupos ignorados" : "Grupos ativados"}
      statusOk={!ignoreGroups}
    >
      <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
        <div className="space-y-1">
          <Label htmlFor="ignoreGroups">Ignorar mensagens de grupos</Label>
          <p className="text-sm text-muted-foreground">
            Quando ativado, as mensagens recebidas em grupos não entram na central.
          </p>
        </div>
        <Switch
          id="ignoreGroups"
          checked={ignoreGroups}
          disabled={settings.isLoading || mutation.isPending}
          onCheckedChange={(checked) => mutation.mutate(checked)}
        />
      </div>
    </ConfigSectionCard>
  );
}

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações da central" },
      {
        name: "description",
        content: "Personalize as cores e as logos da tela de início e do dashboard da central.",
      },
      { property: "og:title", content: "Configurações da central" },
      {
        property: "og:description",
        content: "Personalize cores e logos da central de atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Form = {
  primaryColor: string;
  accentColor: string;
  chatBackgroundColor: string;
  chatBackgroundUrl: string;
  logoUrl: string;
  loginLogoUrl: string;
  dashboardLogoUrl: string;
  faviconUrl: string;
  headline: string;
  tagline: string;
};

const EMPTY: Form = {
  primaryColor: "#a3e635",
  accentColor: "#22d3ee",
  chatBackgroundColor: "#f1f5f9",
  chatBackgroundUrl: "",
  logoUrl: "",
  loginLogoUrl: "",
  dashboardLogoUrl: "",
  faviconUrl: "",
  headline: "",
  tagline: "",
};

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#a3e635" />
      </div>
    </div>
  );
}

const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 3650;

/** Envia a imagem escolhida e devolve um endereço pronto para usar na central. */
async function uploadBrandingImage(file: File, folder: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Escolha um arquivo de imagem (PNG, JPG, SVG ou WEBP).");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("A imagem precisa ter no máximo 5 MB.");
  }
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `marca/${folder}/${crypto.randomUUID()}.${ext}`;
  const upload = await supabase.storage
    .from("anexos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const signed = await supabase.storage.from("anexos").createSignedUrl(path, TEN_YEARS_IN_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(signed.error?.message ?? "Não foi possível gerar o endereço da imagem.");
  }
  return signed.data.signedUrl;
}

function ImageUploadButton({
  folder,
  onUploaded,
  label = "Importar arquivo",
}: {
  folder: string;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            const url = await uploadBrandingImage(file, folder);
            onUploaded(url);
            toast.success("Imagem importada. Lembre-se de salvar as configurações.");
          } catch (error) {
            toast.error("Não foi possível importar a imagem", {
              description: (error as Error).message,
            });
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Upload className="mr-1.5 size-4" />}
        {label}
      </Button>
    </>
  );
}

function LogoField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
          {value ? (
            <img src={value} alt="" className="size-full object-contain" />
          ) : (
            <Headset className="size-5 text-muted-foreground" />
          )}
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://.../logo.png"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ImageUploadButton folder={id} onUploaded={onChange} />
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Remover
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function SettingsPage() {
  const load = useServerFn(getBrandingSettings);
  const save = useServerFn(saveBrandingSettings);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);

  const selectColors = (primaryColor: string, accentColor: string) => {
    setForm((current) => ({ ...current, primaryColor, accentColor }));
    applyBrandingColors(primaryColor, accentColor);
  };

  const settings = useQuery({ queryKey: ["branding-settings"], queryFn: () => load({}) });

  useEffect(() => {
    const row = settings.data as Record<string, unknown> | null | undefined;
    if (!row) return;
    setForm({
      primaryColor: String(row["primary_color"] ?? EMPTY.primaryColor),
      accentColor: String(row["accent_color"] ?? EMPTY.accentColor),
      chatBackgroundColor: String(row["chat_background_color"] ?? EMPTY.chatBackgroundColor),
      chatBackgroundUrl: String(row["chat_background_url"] ?? ""),
      logoUrl: String(row["logo_url"] ?? ""),
      loginLogoUrl: String(row["login_logo_url"] ?? ""),
      dashboardLogoUrl: String(row["dashboard_logo_url"] ?? ""),
      faviconUrl: String(row["favicon_url"] ?? ""),
      headline: String(row["headline"] ?? ""),
      tagline: String(row["tagline"] ?? ""),
    });
  }, [settings.data]);

  const mutation = useMutation({
    mutationFn: (data: Form) => save({ data }),
    onSuccess: async () => {
      toast.success("Configurações salvas");
      await queryClient.invalidateQueries({ queryKey: ["branding-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["project-branding"] });
    },
    onError: (error: Error) => toast.error("Não foi possível salvar", { description: error.message }),
  });

  const brandingStatus = `${form.headline || "Central de Atendimento"} · ${form.tagline || "Multi atendimento"}`;
  const chatBgStatus = form.chatBackgroundUrl
    ? "Imagem personalizada"
    : form.chatBackgroundColor && form.chatBackgroundColor.toLowerCase() !== "#f1f5f9"
      ? "Cor personalizada"
      : "Padrão do tema";
  const logosCount = [form.loginLogoUrl, form.dashboardLogoUrl, form.logoUrl, form.faviconUrl].filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Toque em um card para abrir e editar as opções da central.
        </p>
      </header>

      {settings.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ConfigSectionCard
              icon={Palette}
              title="Cores e identidade"
              description="Cores principais, temas prontos, título e subtítulo da central."
              status={brandingStatus}
            >
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField
                    id="primaryColor"
                    label="Cor principal"
                    value={form.primaryColor}
                    onChange={(v) => {
                      setForm((current) => ({ ...current, primaryColor: v }));
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) applyBrandingColors(v, form.accentColor);
                    }}
                  />
                  <ColorField
                    id="accentColor"
                    label="Cor de destaque"
                    value={form.accentColor}
                    onChange={(v) => {
                      setForm((current) => ({ ...current, accentColor: v }));
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) applyBrandingColors(form.primaryColor, v);
                    }}
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Temas prontos</p>
                    <p className="text-xs text-muted-foreground">Escolha uma opção e veja a mudança imediatamente.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BRANDING_THEMES.map((theme) => {
                      const selected =
                        form.primaryColor.toLowerCase() === theme.primary.toLowerCase() &&
                        form.accentColor.toLowerCase() === theme.accent.toLowerCase();
                      return (
                        <Button
                          key={theme.id}
                          type="button"
                          variant="outline"
                          aria-pressed={selected}
                          onClick={() => selectColors(theme.primary, theme.accent)}
                          className={`relative h-auto min-w-0 flex-col items-stretch gap-2 overflow-hidden p-2 text-left whitespace-normal ${selected ? "border-primary ring-2 ring-primary/20" : ""}`}
                        >
                          <span className="flex h-10 w-full overflow-hidden rounded border border-border/60 bg-background" aria-hidden>
                            <span className="w-1/4" style={{ backgroundColor: theme.primary }} />
                            <span className="flex flex-1 items-center justify-center bg-muted/60">
                              <span className="h-2 w-3/5 rounded-full" style={{ backgroundColor: theme.accent }} />
                            </span>
                          </span>
                          <span className="flex min-w-0 items-start gap-1.5">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-foreground">{theme.name}</span>
                              <span className="block truncate text-[11px] font-normal text-muted-foreground">{theme.description}</span>
                            </span>
                            {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-label="Selecionado" />}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="headline">Título</Label>
                    <Input
                      id="headline"
                      value={form.headline}
                      onChange={(e) => setForm({ ...form, headline: e.target.value })}
                      placeholder="Central de Atendimento"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tagline">Subtítulo</Label>
                    <Input
                      id="tagline"
                      value={form.tagline}
                      onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                      placeholder="Multi atendimento"
                    />
                  </div>
                </div>
              </div>
            </ConfigSectionCard>

            <ConfigSectionCard
              icon={ImageIcon}
              title="Plano de fundo do chat"
              description="Cor ou imagem de fundo usada dentro das conversas."
              status={chatBgStatus}
            >
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <ColorField
                      id="chatBackgroundColor"
                      label="Cor de fundo"
                      value={form.chatBackgroundColor}
                      onChange={(v) => setForm({ ...form, chatBackgroundColor: v })}
                    />
                    <label
                      htmlFor="chatBackgroundAuto"
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        id="chatBackgroundAuto"
                        type="checkbox"
                        checked={
                          !form.chatBackgroundColor.trim() ||
                          form.chatBackgroundColor.trim().toLowerCase() === "#f1f5f9"
                        }
                        onChange={(e) =>
                          setForm({ ...form, chatBackgroundColor: e.target.checked ? "#f1f5f9" : "#ffffff" })
                        }
                        className="size-4 accent-primary"
                      />
                      Automático (segue o tema claro/escuro)
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chatBackgroundUrl">Imagem de fundo (opcional)</Label>
                    <Input
                      id="chatBackgroundUrl"
                      type="url"
                      value={form.chatBackgroundUrl}
                      onChange={(e) => setForm({ ...form, chatBackgroundUrl: e.target.value })}
                      placeholder="https://.../fundo.jpg"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <ImageUploadButton
                        folder="fundo-chat"
                        onUploaded={(url) => setForm({ ...form, chatBackgroundUrl: url })}
                      />
                      {form.chatBackgroundUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setForm({ ...form, chatBackgroundUrl: "" })}
                        >
                          Remover
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Importe um arquivo do computador ou cole um endereço seguro de imagem.
                    </p>
                  </div>
                </div>
                <div
                  className="min-h-40 rounded-lg border border-border bg-repeat bg-center p-4"
                  style={{
                    backgroundColor: form.chatBackgroundColor,
                    backgroundImage: form.chatBackgroundUrl
                      ? `url(${JSON.stringify(form.chatBackgroundUrl)})`
                      : undefined,
                  }}
                >
                  <div className="ml-auto w-fit max-w-[75%] rounded-2xl rounded-br-sm bg-message-sent px-3 py-2 text-sm text-message-sent-foreground shadow-sm">
                    Esta é uma prévia do fundo escolhido.
                  </div>
                  <div className="mt-3 w-fit max-w-[75%] rounded-2xl rounded-bl-sm border border-border bg-message-received px-3 py-2 text-sm text-message-received-foreground shadow-sm">
                    As mensagens continuam fáceis de ler.
                  </div>
                </div>
              </div>
            </ConfigSectionCard>

            <ConfigSectionCard
              icon={Headset}
              title="Logos"
              description="Logo da tela de entrada, dashboard, menu lateral e favicon."
              status={`${logosCount} logo(s) configurada(s)`}
              statusOk={logosCount > 0}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <LogoField
                  id="loginLogoUrl"
                  label="Logo da tela de início"
                  hint="Aparece na tela de entrada do sistema."
                  value={form.loginLogoUrl}
                  onChange={(v) => setForm({ ...form, loginLogoUrl: v })}
                />
                <LogoField
                  id="dashboardLogoUrl"
                  label="Logo do dashboard"
                  hint="Aparece no topo do dashboard."
                  value={form.dashboardLogoUrl}
                  onChange={(v) => setForm({ ...form, dashboardLogoUrl: v })}
                />
                <LogoField
                  id="logoUrl"
                  label="Logo do menu lateral"
                  hint="Ícone exibido ao lado do nome da central."
                  value={form.logoUrl}
                  onChange={(v) => setForm({ ...form, logoUrl: v })}
                />
                <LogoField
                  id="faviconUrl"
                  label="Ícone da aba do navegador"
                  hint="Favicon exibido na aba do navegador."
                  value={form.faviconUrl}
                  onChange={(v) => setForm({ ...form, faviconUrl: v })}
                />
              </div>
            </ConfigSectionCard>

            <GroupMessagesCard />
            <ButtonMenusCard />
            <MisticpayCard />
            <EfiCard />
            <AltispayCard />
            <WavoipCard />
            <OtimizacaoCard />
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar configurações visuais
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
