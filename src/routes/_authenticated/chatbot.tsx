import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteChatbotOption,
  getChatbot,
  saveChatbot,
  saveChatbotOption,
  simulateChatbot,
} from "@/lib/chatbot.functions";
import { lojaConfig, salvarLojaConfig } from "@/lib/loja.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/chatbot")({
  head: () => ({
    meta: [
      { title: "Chatbot de auto atendimento — Central" },
      {
        name: "description",
        content:
          "Configure o robô de atendimento automático no WhatsApp: menu de opções, respostas com IA, horário de funcionamento e transferência para atendentes.",
      },
      { property: "og:title", content: "Chatbot de auto atendimento — Central" },
      {
        property: "og:description",
        content: "Menu numérico, respostas com IA e transferência automática para a equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatbotPage,
});

const DAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const ACTIONS = [
  { value: "transfer_queue", label: "Transferir para uma fila" },
  { value: "transfer_department", label: "Transferir para um departamento" },
  { value: "ai", label: "Responder com a IA" },
  { value: "message", label: "Enviar mensagem e voltar ao menu" },
  { value: "close", label: "Encerrar o atendimento" },
  { value: "loja", label: "Enviar a loja de acessos" },
] as const;

type Hours = { day: number; enabled: boolean; start: string; end: string };

function ChatbotPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getChatbot);
  const save = useServerFn(saveChatbot);
  const saveOption = useServerFn(saveChatbotOption);
  const removeOption = useServerFn(deleteChatbotOption);
  const simulate = useServerFn(simulateChatbot);

  const data = useQuery({ queryKey: ["chatbot"], queryFn: () => load() });

  const [form, setForm] = useState({
    name: "Atendimento automático",
    isActive: false,
    welcomeMessage: "",
    menuFooter: "",
    invalidOptionMessage: "",
    fallbackMessage: "",
    attemptLimit: "3",
    keywords: "",
    aiEnabled: true,
    aiInstructions: "",
    aiTransferOnUnknown: true,
    hoursEnabled: true,
    timezone: "America/Sao_Paulo",
    outsideHoursMessage: "",
  });
  const [hours, setHours] = useState<Hours[]>([]);

  useEffect(() => {
    const bot = data.data?.bot as Record<string, any> | null | undefined;
    if (!bot) return;
    setForm({
      name: bot["name"] ?? "",
      isActive: !!bot["is_active"],
      welcomeMessage: bot["welcome_message"] ?? "",
      menuFooter: bot["menu_footer"] ?? "",
      invalidOptionMessage: bot["invalid_option_message"] ?? "",
      fallbackMessage: bot["fallback_message"] ?? "",
      attemptLimit: String(bot["attempt_limit"] ?? 3),
      keywords: (bot["transfer_keywords"] ?? []).join(", "),
      aiEnabled: !!bot["ai_enabled"],
      aiInstructions: bot["ai_instructions"] ?? "",
      aiTransferOnUnknown: !!bot["ai_transfer_on_unknown"],
      hoursEnabled: !!bot["hours_enabled"],
      timezone: bot["timezone"] ?? "America/Sao_Paulo",
      outsideHoursMessage: bot["outside_hours_message"] ?? "",
    });
    const list = Array.isArray(bot["business_hours"]) ? (bot["business_hours"] as Hours[]) : [];
    setHours(
      DAYS.map((_, day) => {
        const found = list.find((h) => Number(h.day) === day);
        return {
          day,
          enabled: found?.enabled ?? (day >= 1 && day <= 5),
          start: found?.start ?? "08:00",
          end: found?.end ?? "18:00",
        };
      }),
    );
  }, [data.data]);

  const persist = useMutation({
    mutationFn: async (overrides?: Partial<{ isActive: boolean }>) =>
      save({
        data: {
          name: form.name.trim() || "Atendimento automático",
          isActive: overrides?.isActive ?? form.isActive,
          welcomeMessage: form.welcomeMessage,
          menuFooter: form.menuFooter,
          invalidOptionMessage: form.invalidOptionMessage,
          fallbackMessage: form.fallbackMessage,
          attemptLimit: Number(form.attemptLimit) || 3,
          transferKeywords: form.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          aiEnabled: form.aiEnabled,
          aiInstructions: form.aiInstructions,
          aiTransferOnUnknown: form.aiTransferOnUnknown,
          hoursEnabled: form.hoursEnabled,
          timezone: form.timezone,
          businessHours: hours,
          outsideHoursMessage: form.outsideHoursMessage,
        },
      }),
    onSuccess: () => {
      toast.success("Chatbot salvo");
      queryClient.invalidateQueries({ queryKey: ["chatbot"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  // Nova opção do menu
  const [optionKey, setOptionKey] = useState("");
  const [label, setLabel] = useState("");
  const [response, setResponse] = useState("");
  const [action, setAction] = useState<string>("transfer_queue");
  const [queueId, setQueueId] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const addOption = useMutation({
    mutationFn: async () =>
      saveOption({
        data: {
          id: null,
          optionKey: optionKey.trim(),
          label: label.trim(),
          response,
          action: action as "message",
          queueId: queueId || null,
          departmentId: departmentId || null,
          sortOrder: (data.data?.options?.length ?? 0) + 1,
          isActive: true,
        },
      }),
    onSuccess: () => {
      toast.success("Opção adicionada");
      setOptionKey("");
      setLabel("");
      setResponse("");
      queryClient.invalidateQueries({ queryKey: ["chatbot"] });
    },
    onError: (e: Error) => toast.error("Não foi possível adicionar", { description: e.message }),
  });

  const dropOption = useMutation({
    mutationFn: async (id: string) => removeOption({ data: { id } }),
    onSuccess: () => {
      toast.success("Opção removida");
      queryClient.invalidateQueries({ queryKey: ["chatbot"] });
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  // Mensagens da loja enviada pelo chatbot
  const loadLoja = useServerFn(lojaConfig);
  const saveLoja = useServerFn(salvarLojaConfig);
  const loja = useQuery({ queryKey: ["loja-config"], queryFn: () => loadLoja() });
  const [lojaForm, setLojaForm] = useState({
    botAtivo: true,
    botPrimeiroContato: true,
    botPalavras: "",
    botTitulo: "",
    botModo: "lista",
    botSaudacao: "",
    mensagemCobranca: "",
  });

  useEffect(() => {
    const cfg = loja.data as Record<string, any> | undefined;
    if (!cfg) return;
    setLojaForm({
      botAtivo: !!cfg["botAtivo"],
      botPrimeiroContato: !!cfg["botPrimeiroContato"],
      botPalavras: cfg["botPalavras"] ?? "",
      botTitulo: cfg["botTitulo"] ?? "",
      botModo: cfg["botModo"] ?? "lista",
      botSaudacao: cfg["botSaudacao"] ?? "",
      mensagemCobranca: cfg["mensagemCobranca"] ?? "",
    });
  }, [loja.data]);

  const persistLoja = useMutation({
    mutationFn: async () => {
      const cfg = (loja.data ?? {}) as Record<string, any>;
      return saveLoja({
        data: {
          autoPix: cfg["autoPix"] ?? true,
          provider: cfg["provider"] ?? "auto",
          pixKey: cfg["pixKey"] ?? "",
          pixKeyType: cfg["pixKeyType"] ?? "random",
          recebedorNome: cfg["recebedorNome"] ?? "",
          recebedorCidade: cfg["recebedorCidade"] ?? "SAO PAULO",
          mensagemCobranca: lojaForm.mensagemCobranca,
          botAtivo: lojaForm.botAtivo,
          botPrimeiroContato: lojaForm.botPrimeiroContato,
          botPalavras: lojaForm.botPalavras,
          botTitulo: lojaForm.botTitulo || "Nossa loja de acessos",
          botModo: lojaForm.botModo as "lista",
          botSaudacao: lojaForm.botSaudacao,
        },
      });
    },
    onSuccess: () => {
      toast.success("Mensagens da loja salvas");
      queryClient.invalidateQueries({ queryKey: ["loja-config"] });
    },
    onError: (e: Error) =>
      toast.error("Não foi possível salvar a loja", { description: e.message }),
  });

  // Simulador
  const [testMessage, setTestMessage] = useState("");
  const [testState, setTestState] = useState<"menu" | "ai">("menu");
  const [chat, setChat] = useState<{ from: "cliente" | "robo"; text: string }[]>([]);

  const runTest = useMutation({
    mutationFn: async () => simulate({ data: { message: testMessage.trim(), state: testState } }),
    onSuccess: (res) => {
      setChat((prev) => [
        ...prev,
        { from: "cliente", text: testMessage.trim() },
        { from: "robo", text: res.reply },
      ]);
      setTestMessage("");
      setTestState(res.nextState === "ai" ? "ai" : "menu");
    },
    onError: (e: Error) => toast.error("Falha na simulação", { description: e.message }),
  });

  const queues = (data.data?.queues ?? []) as { id: string; name: string }[];
  const departments = (data.data?.departments ?? []) as { id: string; name: string }[];
  const options = (data.data?.options ?? []) as Record<string, any>[];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bot className="size-6 text-primary" /> Chatbot de auto atendimento
          </h1>
          <p className="text-sm text-muted-foreground">
            O robô recebe as conversas do WhatsApp, apresenta o menu, responde com IA e transfere
            para a equipe quando necessário.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={form.isActive ? "default" : "secondary"}>
            {form.isActive ? "Ativo" : "Desativado"}
          </Badge>
          {data.data?.bot ? (
            <Badge variant="outline">
              {data.data.isOpenNow ? "Dentro do horário" : "Fora do horário"}
            </Badge>
          ) : null}
          <div className="flex items-center gap-2">
            <Switch
              id="bot-active"
              checked={form.isActive}
              onCheckedChange={(v) => {
                setForm((f) => ({ ...f, isActive: v }));
                persist.mutate({ isActive: v });
              }}
            />
            <Label htmlFor="bot-active">Ligar robô</Label>
          </div>
        </div>
      </header>

      <Tabs defaultValue="geral">
        <TabsList>
          <TabsTrigger value="geral">Mensagens</TabsTrigger>
          <TabsTrigger value="menu">Menu de opções</TabsTrigger>
          <TabsTrigger value="loja">Loja</TabsTrigger>
          <TabsTrigger value="ia">IA</TabsTrigger>
          <TabsTrigger value="horario">Horário</TabsTrigger>
          <TabsTrigger value="teste">Testar</TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bot-name">Nome do robô</Label>
              <Input
                id="bot-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-attempts">Tentativas antes de chamar um atendente</Label>
              <Input
                id="bot-attempts"
                type="number"
                min={1}
                max={10}
                value={form.attemptLimit}
                onChange={(e) => setForm((f) => ({ ...f, attemptLimit: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bot-welcome">Mensagem de boas-vindas</Label>
            <Textarea
              id="bot-welcome"
              rows={3}
              value={form.welcomeMessage}
              onChange={(e) => setForm((f) => ({ ...f, welcomeMessage: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bot-footer">Rodapé do menu</Label>
              <Textarea
                id="bot-footer"
                rows={2}
                value={form.menuFooter}
                onChange={(e) => setForm((f) => ({ ...f, menuFooter: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-invalid">Quando o cliente digita algo fora do menu</Label>
              <Textarea
                id="bot-invalid"
                rows={2}
                value={form.invalidOptionMessage}
                onChange={(e) => setForm((f) => ({ ...f, invalidOptionMessage: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bot-fallback">Mensagem ao transferir para um atendente</Label>
              <Textarea
                id="bot-fallback"
                rows={2}
                value={form.fallbackMessage}
                onChange={(e) => setForm((f) => ({ ...f, fallbackMessage: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bot-keywords">
                Palavras que chamam um atendente (separadas por vírgula)
              </Label>
              <Textarea
                id="bot-keywords"
                rows={2}
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              />
            </div>
          </div>
          <Button onClick={() => persist.mutate(undefined)} disabled={persist.isPending}>
            {persist.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </TabsContent>

        <TabsContent value="menu" className="space-y-6 pt-4">
          <div className="rounded-xl border p-4">
            <p className="mb-3 text-sm font-medium">Nova opção</p>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="opt-key">Tecla</Label>
                <Input
                  id="opt-key"
                  placeholder="1"
                  value={optionKey}
                  onChange={(e) => setOptionKey(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="opt-label">Texto da opção</Label>
                <Input
                  id="opt-label"
                  placeholder="Falar com o Comercial"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {action === "transfer_queue" ? (
                <div className="space-y-2">
                  <Label>Fila</Label>
                  <Select value={queueId} onValueChange={setQueueId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a fila" />
                    </SelectTrigger>
                    <SelectContent>
                      {queues.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {action === "transfer_queue" || action === "transfer_department" ? (
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha o departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="opt-response">Resposta enviada ao escolher</Label>
                <Textarea
                  id="opt-response"
                  rows={2}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                />
              </div>
            </div>
            <Button
              className="mt-3"
              onClick={() => addOption.mutate()}
              disabled={addOption.isPending || !optionKey.trim() || !label.trim()}
            >
              <Plus className="mr-2 size-4" /> Adicionar opção
            </Button>
          </div>

          <div className="space-y-2">
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma opção cadastrada ainda.</p>
            ) : null}
            {options.map((o) => (
              <div
                key={o["id"]}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="mr-2 rounded bg-muted px-2 py-0.5 text-xs">
                      {o["option_key"]}
                    </span>
                    {o["label"]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ACTIONS.find((a) => a.value === o["action"])?.label} · {o["response"] || "sem resposta"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => dropOption.mutate(o["id"])}
                  aria-label="Remover opção"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {data.data?.preview ? (
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-medium">Como o cliente vê o menu</p>
              <pre className="whitespace-pre-wrap text-sm">{data.data.preview}</pre>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="loja" className="space-y-4 pt-4">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-medium">Enviar a loja de acessos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No menu de opções, escolha a ação “Enviar a loja de acessos”: quando o cliente
              escolher essa opção, o robô manda o catálogo numerado. A pessoa responde o número,
              recebe o Pix e o login é entregue sozinho depois do pagamento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="loja-ativo"
                checked={lojaForm.botAtivo}
                onCheckedChange={(v) => setLojaForm((f) => ({ ...f, botAtivo: v }))}
              />
              <Label htmlFor="loja-ativo">Loja pode ser enviada automaticamente</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="loja-primeiro"
                checked={lojaForm.botPrimeiroContato}
                onCheckedChange={(v) => setLojaForm((f) => ({ ...f, botPrimeiroContato: v }))}
              />
              <Label htmlFor="loja-primeiro">Enviar já no primeiro contato</Label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="loja-titulo">Título da loja</Label>
              <Input
                id="loja-titulo"
                value={lojaForm.botTitulo}
                placeholder="Nossa loja de acessos"
                onChange={(e) => setLojaForm((f) => ({ ...f, botTitulo: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Formato do envio</Label>
              <Select
                value={lojaForm.botModo}
                onValueChange={(v) => setLojaForm((f) => ({ ...f, botModo: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lista">Lista de produtos</SelectItem>
                  <SelectItem value="botoes">Botões</SelectItem>
                  <SelectItem value="texto">Texto numerado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loja-saudacao">Mensagem antes do catálogo</Label>
            <Textarea
              id="loja-saudacao"
              rows={3}
              placeholder="Olá! Veja os acessos disponíveis hoje:"
              value={lojaForm.botSaudacao}
              onChange={(e) => setLojaForm((f) => ({ ...f, botSaudacao: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="loja-palavras">
                Palavras que chamam a loja (separadas por vírgula)
              </Label>
              <Textarea
                id="loja-palavras"
                rows={2}
                placeholder="loja, comprar, preço, login"
                value={lojaForm.botPalavras}
                onChange={(e) => setLojaForm((f) => ({ ...f, botPalavras: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loja-cobranca">Mensagem enviada com o Pix</Label>
              <Textarea
                id="loja-cobranca"
                rows={2}
                value={lojaForm.mensagemCobranca}
                onChange={(e) => setLojaForm((f) => ({ ...f, mensagemCobranca: e.target.value }))}
              />
            </div>
          </div>

          <Button onClick={() => persistLoja.mutate()} disabled={persistLoja.isPending}>
            {persistLoja.isPending ? "Salvando..." : "Salvar mensagens da loja"}
          </Button>
        </TabsContent>

        <TabsContent value="ia" className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <Switch
              id="ai-enabled"
              checked={form.aiEnabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, aiEnabled: v }))}
            />
            <Label htmlFor="ai-enabled">Responder perguntas abertas com a IA</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="ai-transfer"
              checked={form.aiTransferOnUnknown}
              onCheckedChange={(v) => setForm((f) => ({ ...f, aiTransferOnUnknown: v }))}
            />
            <Label htmlFor="ai-transfer">Chamar um atendente quando a IA não souber responder</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-instructions">Instruções do assistente</Label>
            <Textarea
              id="ai-instructions"
              rows={7}
              value={form.aiInstructions}
              onChange={(e) => setForm((f) => ({ ...f, aiInstructions: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Escreva as regras do seu atendimento: produtos, prazos, formas de pagamento e o que o
              robô nunca deve prometer.
            </p>
          </div>
          <Button onClick={() => persist.mutate(undefined)} disabled={persist.isPending}>
            {persist.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </TabsContent>

        <TabsContent value="horario" className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <Switch
              id="hours-enabled"
              checked={form.hoursEnabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, hoursEnabled: v }))}
            />
            <Label htmlFor="hours-enabled">Usar horário de funcionamento</Label>
          </div>
          <div className="space-y-2 md:max-w-xs">
            <Label htmlFor="tz">Fuso horário</Label>
            <Input
              id="tz"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            {hours.map((h) => (
              <div key={h.day} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <Switch
                  checked={h.enabled}
                  onCheckedChange={(v) =>
                    setHours((prev) =>
                      prev.map((x) => (x.day === h.day ? { ...x, enabled: v } : x)),
                    )
                  }
                  aria-label={DAYS[h.day]}
                />
                <span className="w-24 text-sm font-medium">{DAYS[h.day]}</span>
                <Input
                  type="time"
                  className="w-32"
                  value={h.start}
                  onChange={(e) =>
                    setHours((prev) =>
                      prev.map((x) => (x.day === h.day ? { ...x, start: e.target.value } : x)),
                    )
                  }
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="time"
                  className="w-32"
                  value={h.end}
                  onChange={(e) =>
                    setHours((prev) =>
                      prev.map((x) => (x.day === h.day ? { ...x, end: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="outside">Mensagem fora do horário</Label>
            <Textarea
              id="outside"
              rows={3}
              value={form.outsideHoursMessage}
              onChange={(e) => setForm((f) => ({ ...f, outsideHoursMessage: e.target.value }))}
            />
          </div>
          <Button onClick={() => persist.mutate(undefined)} disabled={persist.isPending}>
            {persist.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </TabsContent>

        <TabsContent value="teste" className="space-y-4 pt-4">
          <div className="min-h-40 space-y-2 rounded-xl border bg-muted/30 p-4">
            {chat.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Escreva uma mensagem como se fosse o cliente para ver a resposta do robô.
              </p>
            ) : null}
            {chat.map((m, i) => (
              <div
                key={i}
                className={
                  m.from === "cliente"
                    ? "ml-auto max-w-[80%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "mr-auto max-w-[80%] whitespace-pre-wrap rounded-xl bg-background px-3 py-2 text-sm"
                }
              >
                {m.text}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (testMessage.trim()) runTest.mutate();
            }}
          >
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Ex.: 1"
            />
            <Button type="submit" disabled={runTest.isPending || !testMessage.trim()}>
              <Send className="mr-2 size-4" /> Enviar
            </Button>
            <Button type="button" variant="outline" onClick={() => setChat([])}>
              Limpar
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
