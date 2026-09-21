import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Save, Sparkles, Bot, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { useMe } from "@/hooks/use-session";
import { getAiStatus, saveAiConfig, testAi, saveAiKey, removeAiKey } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ia")({
  head: () => ({
    meta: [
      { title: "Inteligência artificial — Central" },
      {
        name: "description",
        content:
          "Conecte a central a agentes de IA (Google Gemini ou Manus) para sugerir e enviar respostas nos atendimentos do WhatsApp.",
      },
      { property: "og:title", content: "Inteligência artificial — Central" },
      {
        property: "og:description",
        content: "Escolha o provedor, ajuste as instruções do agente e ative a resposta automática.",
      },
    ],
  }),
  component: AiPage,
});

const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.6-pro", "gemini-3.1-flash-lite"];

function AiPage() {
  const { isAdmin } = useMe();
  const queryClient = useQueryClient();

  const statusFn = useServerFn(getAiStatus);
  const saveFn = useServerFn(saveAiConfig);
  const testFn = useServerFn(testAi);
  const saveKeyFn = useServerFn(saveAiKey);
  const removeKeyFn = useServerFn(removeAiKey);

  const status = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => statusFn({}),
    enabled: isAdmin,
  });

  const [provider, setProvider] = useState<"gemini" | "manus">("gemini");
  const [model, setModel] = useState("gemini-3.6-flash");
  const [agentProfile, setAgentProfile] = useState<"lite" | "standard" | "max">("lite");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoReply, setAutoReply] = useState(false);
  const [testPrompt, setTestPrompt] = useState("Olá, vocês entregam em Belo Horizonte?");
  const [testResult, setTestResult] = useState("");
  const [geminiToken, setGeminiToken] = useState("");
  const [manusToken, setManusToken] = useState("");

  useEffect(() => {
    const c = status.data?.config;
    if (!c) return;
    setProvider(c.provider === "manus" ? "manus" : "gemini");
    setModel(c.model || "gemini-3.6-flash");
    setAgentProfile(
      c.manusAgentProfile === "standard" || c.manusAgentProfile === "max"
        ? c.manusAgentProfile
        : "lite",
    );
    setSystemPrompt((v) => (v ? v : c.systemPrompt));
    setIsEnabled(c.isEnabled);
    setAutoReply(c.autoReply);
  }, [status.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          provider,
          model,
          systemPrompt,
          isEnabled,
          autoReply,
          manusAgentProfile: agentProfile,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração de IA salva");
      queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { prompt: testPrompt } }),
    onSuccess: (res) => setTestResult(res.text),
    onError: (e: Error) => toast.error("O teste falhou", { description: e.message }),
  });

  const saveKey = useMutation({
    mutationFn: (vars: { provider: "gemini" | "manus"; apiKey: string }) =>
      saveKeyFn({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success("Token salvo");
      if (vars.provider === "gemini") setGeminiToken("");
      else setManusToken("");
      queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar o token", {
      description: e.message,
    }),
  });

  const removeKey = useMutation({
    mutationFn: (provider: "gemini" | "manus") => removeKeyFn({ data: { provider } }),
    onSuccess: () => {
      toast.success("Token removido");
      queryClient.invalidateQueries({ queryKey: ["ai-status"] });
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  if (!isAdmin) {
    return (
      <div className="p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          Somente administradores podem configurar a inteligência artificial.
        </p>
      </div>
    );
  }

  const keyReady = provider === "manus" ? status.data?.hasManusKey : status.data?.hasGeminiKey;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:space-y-6 sm:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Sparkles className="size-5 text-primary" /> Inteligência artificial
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha o agente que vai ajudar nos atendimentos e defina como ele deve responder.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isEnabled ? "default" : "secondary"}>
            {isEnabled ? "IA ativada" : "IA desativada"}
          </Badge>
          <Badge variant={keyReady ? "default" : "destructive"}>
            {keyReady ? "Chave configurada" : "Chave pendente"}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as "gemini" | "manus")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="manus">Manus</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider === "gemini" ? (
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GEMINI_MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Perfil do agente Manus</Label>
              <Select
                value={agentProfile}
                onValueChange={(v) => setAgentProfile(v as "lite" | "standard" | "max")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lite">Lite (mais rápido)</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="max">Max (mais completo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Instruções para o agente</Label>
          <Textarea
            rows={5}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Ex.: Você atende a loja Central. Responda em português, seja breve e cordial."
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Ativar a IA na central</p>
              <p className="text-xs text-muted-foreground">
                Libera o botão de sugestão de resposta no atendimento.
              </p>
            </div>
            <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Responder automaticamente</p>
              <p className="text-xs text-muted-foreground">
                A IA responde novas mensagens enquanto a conversa ainda não tem atendente.
              </p>
            </div>
            <Switch checked={autoReply} onCheckedChange={setAutoReply} disabled={!isEnabled} />
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending || !systemPrompt.trim()}>
          <Save className="mr-2 size-4" /> Salvar configuração
        </Button>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
            <KeyRound className="size-4 text-primary" /> Tokens de acesso
          </h2>
          <p className="text-sm text-muted-foreground">
            Cole aqui o token de cada serviço. Ele fica guardado com segurança e nunca aparece de
            volta na tela.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Token do Google Gemini</Label>
            <Badge variant={status.data?.hasGeminiKey ? "default" : "secondary"}>
              {status.data?.hasGeminiKey ? "Salvo" : "Não configurado"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[240px] flex-1"
              type="password"
              autoComplete="off"
              value={geminiToken}
              onChange={(e) => setGeminiToken(e.target.value)}
              placeholder="AIza…"
            />
            <Button
              onClick={() => saveKey.mutate({ provider: "gemini", apiKey: geminiToken })}
              disabled={saveKey.isPending || geminiToken.trim().length < 8}
            >
              Salvar
            </Button>
            {status.data?.hasGeminiKey ? (
              <Button
                variant="outline"
                onClick={() => removeKey.mutate("gemini")}
                disabled={removeKey.isPending}
              >
                Remover
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Token do Manus</Label>
            <Badge variant={status.data?.hasManusKey ? "default" : "secondary"}>
              {status.data?.hasManusKey ? "Salvo" : "Não configurado"}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[240px] flex-1"
              type="password"
              autoComplete="off"
              value={manusToken}
              onChange={(e) => setManusToken(e.target.value)}
              placeholder="sk-…"
            />
            <Button
              onClick={() => saveKey.mutate({ provider: "manus", apiKey: manusToken })}
              disabled={saveKey.isPending || manusToken.trim().length < 8}
            >
              Salvar
            </Button>
            {status.data?.hasManusKey ? (
              <Button
                variant="outline"
                onClick={() => removeKey.mutate("manus")}
                disabled={removeKey.isPending}
              >
                Remover
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
          <Bot className="size-4 text-primary" /> Testar o agente
        </h2>
        <div className="space-y-2">
          <Label>Mensagem do cliente</Label>
          <Input value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending || !testPrompt.trim()}
        >
          {test.isPending ? "Consultando…" : "Enviar teste"}
        </Button>
        {testResult ? (
          <div className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm text-foreground">
            {testResult}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          O teste usa o provedor e o token salvos acima.
        </p>
      </section>
    </div>
  );
}
