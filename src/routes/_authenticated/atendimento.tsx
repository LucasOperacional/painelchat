import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  ArrowRightLeft,
  CheckCircle2,
  RotateCcw,
  Search,
  UserPlus,
  Sparkles,
  PanelRightOpen,
  PanelRightClose,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowLeft,
  Paperclip,
  Smile,
  ContactRound,
  WandSparkles,
  Loader2,
  Plus,
  Pencil,
  Bold,
  Italic,
  Quote,
  ImageDown,
  MessageSquare,
  ListOrdered,
  Trash2,
  QrCode,
  ShoppingBag,
  Forward,
  Reply,
  X,
  PhoneCall,
  Archive,
  Check,
} from "lucide-react";
import { toast } from "sonner";


import { supabase } from "@/integrations/supabase/client";
import { MessageBody, parseAttachments, parseGroupMessage } from "@/components/message-body";
import { deleteWhatsappMessage, sendWhatsappMessage } from "@/lib/whatsapp.functions";
import {
  listButtonMenus,
  formatButtonMenuText,
  sendButtonMenu,
  MENU_KIND_LABELS,
} from "@/lib/button-menus.functions";
import { suggestReply, correctText } from "@/lib/ai.functions";
import { deleteConversation } from "@/lib/conversations.functions";
import {
  sendPixCard,
  sendMisticpayCharge,
  sendEfiCharge,
  sendAltispayCharge,
  checkPendingPixCharges,
  PIX_KEY_TYPES,
  type PixKeyType,
} from "@/lib/pix.functions";
import { syncContactPhotos } from "@/lib/contacts.functions";
import { getWavoipCallLink } from "@/lib/wavoip.functions";
import { ContactBilling } from "@/components/contact-billing";
import { listarCategoriasAtivas } from "@/lib/estoque.functions";
import { enviarLoja, produtosDaLoja } from "@/lib/loja.functions";
import { useMe } from "@/hooks/use-session";
import { useProjectBranding } from "@/hooks/use-project";
import { useTheme } from "@/hooks/use-theme";
import {
  fetchConversations,
  fetchDepartments,
  fetchMessages,
  fetchProfiles,
  fetchQueues,
  fetchTransfers,
  fetchConnections,
  claimConversation,
  closeConversation,
  reopenConversation,
  transferConversation,
  previewMensagem,
  type Conversation,
} from "@/lib/central";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StickerPicker } from "@/components/sticker-picker";
import { AudioRecorder } from "@/components/audio-recorder";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { markConversationRead, setActiveConversation, useUnreadMap } from "@/lib/unread-store";

const DEFAULT_CHAT_BG = "#f1f5f9";
const LIGHT_CHAT_BG = "#f1f5f9";
const DARK_CHAT_BG = "#0b141a";

const EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😉","🙂","😎",
  "🤔","😴","😭","😢","😡","🥰","🤝","👍","👎","🙏",
  "👏","💪","🔥","✅","❌","⚠️","🎉","❤️","💚","💙",
  "📞","📱","💬","📄","📎","💰","🕒","📅","🚀","⭐",
];


function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

const GROUP_PARTICIPANT_STYLES = [
  "bg-primary/12 text-primary ring-primary/20",
  "bg-success/12 text-success ring-success/20",
  "bg-purple/12 text-purple-foreground ring-purple/20",
  "bg-destructive/10 text-destructive ring-destructive/20",
];

function participantStyle(name: string) {
  const index = Array.from(name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return GROUP_PARTICIPANT_STYLES[index % GROUP_PARTICIPANT_STYLES.length];
}

function parseSignedMessage(body: string) {
  const match = body.match(/^\*([^*\n]{1,80})\*\s*\n([\s\S]*)$/);
  const name = match?.[1]?.trim();
  const rest = match?.[2]?.trim();
  if (!name || !rest) return null;
  return { label: name, name, phone: null as string | null, body: rest };
}

function ContactAvatar({
  url,
  name,
  className = "size-9",
}: {
  url: string | null;
  name: string | null;
  className?: string;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt={`Foto de ${name ?? "contato"}`}
        loading="lazy"
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground`}
    >
      {initials(name)}
    </span>
  );
}

import { z } from "zod";

export const Route = createFileRoute("/_authenticated/atendimento")({
  validateSearch: z.object({
    conversation: z.string().optional(),
  }).parse,
  head: () => ({
    meta: [
      { title: "Painel de atendimento — Central" },
      {
        name: "description",
        content:
          "Responda conversas de WhatsApp, assuma atendimentos da fila e transfira para colegas ou departamentos.",
      },
      { property: "og:title", content: "Painel de atendimento — Central" },
      {
        property: "og:description",
        content: "Conversas, filas e transferências em uma única tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtendimentoPage,
});


function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

function AtendimentoPage() {
  const { user, profile, isAdmin } = useMe();
  const { project } = useProjectBranding();
  const theme = useTheme();
  const chatBackground = useMemo(() => {
    const custom = project?.chatBackgroundColor?.trim();
    // Cor padrão do sistema = "automática": segue o tema claro/escuro.
    if (!custom || custom.toLowerCase() === DEFAULT_CHAT_BG) {
      return theme === "dark" ? DARK_CHAT_BG : LIGHT_CHAT_BG;
    }
    return custom;
  }, [project?.chatBackgroundColor, theme]);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"todas" | "minhas" | "fila" | "encerradas" | "grupos">("fila");
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [forwardBody, setForwardBody] = useState<string | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardTargets, setForwardTargets] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<{
    messageId: string;
    externalId: string;
    mine: boolean;
    body: string;
  } | null>(null);
  const [menuPickerOpen, setMenuPickerOpen] = useState(false);
  const loadButtonMenus = useServerFn(listButtonMenus);
  const buttonMenus = useQuery({
    queryKey: ["button-menus"],
    queryFn: () => loadButtonMenus({}),
    enabled: menuPickerOpen,
  });
  const sendMenuFn = useServerFn(sendButtonMenu);
  const sendMenuMutation = useMutation({
    mutationFn: (menuId: string) =>
      sendMenuFn({ data: { conversationId: selectedId!, menuId } }),
    onSuccess: async (res) => {
      setMenuPickerOpen(false);
      if (res.sent) toast.success("Menu enviado no WhatsApp");
      else
        toast.warning("Menu registrado, mas não enviado", {
          description: res.deliveryError ?? undefined,
        });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível enviar o menu", { description: error.message }),
  });

  // ---- Card de Pix -------------------------------------------------------
  const [pixOpen, setPixOpen] = useState(false);
  // Categoria do estoque que será entregue sozinha quando o pagamento cair.
  const [estoqueCategoria, setEstoqueCategoria] = useState("nenhum");
  const listarCategoriasFn = useServerFn(listarCategoriasAtivas);
  const categoriasEstoque = useQuery({
    queryKey: ["estoque-categorias-ativas"],
    queryFn: () => listarCategoriasFn({}),
    staleTime: 60_000,
  });
  const estoqueCategoriaId = estoqueCategoria === "nenhum" ? null : estoqueCategoria;

  // ---- Loja (catálogo de logins) ----------------------------------------
  const [lojaOpen, setLojaOpen] = useState(false);
  const [lojaModo, setLojaModo] = useState<"botoes" | "lista" | "link">("lista");
  const [lojaTitulo, setLojaTitulo] = useState("Nossa loja");
  const produtosLojaFn = useServerFn(produtosDaLoja);
  const lojaProdutos = useQuery({
    queryKey: ["loja-produtos"],
    queryFn: () => produtosLojaFn({}),
    staleTime: 60_000,
  });
  const enviarLojaFn = useServerFn(enviarLoja);
  const enviarLojaMutation = useMutation({
    mutationFn: () =>
      enviarLojaFn({
        data: { conversationId: selectedId!, modo: lojaModo, titulo: lojaTitulo },
      }),
    onSuccess: async (res) => {
      setLojaOpen(false);
      if (res.enviado) {
        toast.success(
          res.formato === "botoes"
            ? "Loja enviada com botões"
            : res.formato === "lista"
              ? "Loja enviada em lista"
              : "Loja enviada em texto com o link",
        );
      } else {
        toast.warning("Não foi possível enviar a loja", { description: res.erro ?? undefined });
      }
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível enviar a loja", { description: error.message }),
  });
  const [pixForm, setPixForm] = useState({
    title: "Pagamento via Pix",
    description: "",
    buttonText: "Pagar com Pix",
    keyType: "random" as PixKeyType,
    key: "",
    name: "",
    city: "SAO PAULO",
    amount: "",
  });
  const sendPixFn = useServerFn(sendPixCard);
  const sendPixMutation = useMutation({
    mutationFn: () => sendPixFn({ data: { conversationId: selectedId!, ...pixForm, estoqueCategoriaId } }),
    onSuccess: async (res) => {
      setPixOpen(false);
      if (res.sent) toast.success("Pix enviado no WhatsApp");
      else
        toast.warning("Pix registrado, mas não enviado", {
          description: res.deliveryError ?? undefined,
        });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível enviar o Pix", { description: error.message }),
  });

  // ---- Cobrança Pix pela MisticPay --------------------------------------
  const [pixProvider, setPixProvider] = useState<
    "misticpay" | "efi" | "altispay" | "manual"
  >("misticpay");
  const [misticForm, setMisticForm] = useState({
    amount: "",
    description: "Pagamento via Pix",
    payerName: "",
    payerDocument: "",
  });
  const sendMisticFn = useServerFn(sendMisticpayCharge);
  const sendMisticMutation = useMutation({
    mutationFn: () => sendMisticFn({ data: { conversationId: selectedId!, ...misticForm, estoqueCategoriaId } }),
    onSuccess: async (res) => {
      setPixOpen(false);
      if (res.sent) toast.success("Cobrança Pix enviada no WhatsApp");
      else
        toast.warning("Cobrança gerada, mas não enviada", {
          description: res.deliveryError ?? undefined,
        });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível gerar a cobrança", { description: error.message }),
  });

  // ---- Cobrança Pix pela Efí Bank ---------------------------------------
  const sendEfiFn = useServerFn(sendEfiCharge);
  const sendEfiMutation = useMutation({
    mutationFn: () => sendEfiFn({ data: { conversationId: selectedId!, ...misticForm, estoqueCategoriaId } }),
    onSuccess: async (res) => {
      setPixOpen(false);
      if (res.sent) toast.success("Cobrança Pix enviada no WhatsApp");
      else
        toast.warning("Cobrança gerada, mas não enviada", {
          description: res.deliveryError ?? undefined,
        });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível gerar a cobrança", { description: error.message }),
  });
  // ---- Cobrança Pix pela AltisPay ---------------------------------------
  const sendAltispayFn = useServerFn(sendAltispayCharge);
  const sendAltispayMutation = useMutation({
    mutationFn: () => sendAltispayFn({ data: { conversationId: selectedId!, ...misticForm, estoqueCategoriaId } }),
    onSuccess: async (res) => {
      setPixOpen(false);
      if (res.sent) toast.success("Cobrança Pix enviada no WhatsApp");
      else
        toast.warning("Cobrança gerada, mas não enviada", {
          description: res.deliveryError ?? undefined,
        });
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error: Error) =>
      toast.error("Não foi possível gerar a cobrança", { description: error.message }),
  });

  // ---- Ligação de WhatsApp pela Wavoip ----------------------------------
  const wavoipLinkFn = useServerFn(getWavoipCallLink);
  const callMutation = useMutation({
    mutationFn: (input: { phone: string; name: string }) => wavoipLinkFn({ data: input }),
    onSuccess: (res) => {
      window.open(res.url, "wavoip", "width=380,height=620");
    },
    onError: (error: Error) =>
      toast.error("Não foi possível iniciar a ligação", { description: error.message }),
  });


  const gatewayMutation =
    pixProvider === "efi"
      ? sendEfiMutation
      : pixProvider === "altispay"
        ? sendAltispayMutation
        : sendMisticMutation;


  // Confere na MisticPay, a cada 20s, se alguma cobrança Pix já foi paga.
  const checkPixFn = useServerFn(checkPendingPixCharges);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  useQuery({
    queryKey: ["pix-pending-check"],
    enabled: hasSession,
    retry: false,
    queryFn: async () => {
      const res = await checkPixFn({ data: undefined });
      if (res.confirmed > 0) {
        await queryClient.invalidateQueries({ queryKey: ["messages"] });
        await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
      return res;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,

  });



  const [showContactPanel, setShowContactPanel] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("atendimento-list-collapsed") === "true";
  });

  // O tempo real entrega alterações na hora; a conferência curta garante que
  // mensagens da Evolution apareçam mesmo quando o navegador perde um evento.
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  const queues = useQuery({ queryKey: ["queues"], queryFn: fetchQueues });
  const departments = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("atendimento-list-collapsed", String(listCollapsed));
    }
  }, [listCollapsed]);

  // Usado pelo aviso de menção: descobre o nome do grupo sem refazer o canal.
  const conversationsRef = useRef<typeof conversations.data>(undefined);
  conversationsRef.current = conversations.data;

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("central-mention-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        // Marcaram o número da central (@) dentro de um grupo: avisa na hora.
        const row = payload.new as
          | { mentions_me?: boolean; conversation_id?: string; body?: string }
          | undefined;
        if (!row?.mentions_me) return;
        const group =
          conversationsRef.current?.find((c) => c.id === row.conversation_id)?.contact?.name ??
          "um grupo";
        const title = `Marcaram você em ${group}`;
        const description = (row.body ?? "").slice(0, 120) || "Você foi mencionado com @.";
        toast(title, {
          description,
          action: row.conversation_id
            ? { label: "Abrir", onClick: () => setSelectedId(row.conversation_id!) }
            : undefined,
        });
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(title, { body: description });
          } catch {
            /* o navegador pode bloquear a notificação */
          }
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const list = useMemo(() => {
    const all = conversations.data ?? [];
    return all.filter((c) => {
      const isGroup = !!c.contact?.wa_jid?.includes("@g.us");
      // Grupos ficam separados: só aparecem na aba "Grupos".
      if (tab === "grupos") {
        if (!isGroup) return false;
      } else if (isGroup) {
        return false;
      }
      // Admin: aba "Todas" mostra tudo que está em andamento, de qualquer atendente.
      if (tab === "todas" && c.status === "closed") return false;
      if (tab === "minhas" && !(c.status === "open" && c.assigned_to === user?.id)) return false;
      if (tab === "fila" && c.status !== "waiting") return false;
      if (tab === "encerradas" && c.status !== "closed") return false;
      if (queueFilter !== "all" && c.queue_id !== queueFilter) return false;
      if (isAdmin && agentFilter !== "all") {
        if (agentFilter === "none" ? !!c.assigned_to : c.assigned_to !== agentFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const hit =
          c.contact?.name.toLowerCase().includes(q) || c.contact?.phone.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [conversations.data, tab, user?.id, queueFilter, search, isAdmin, agentFilter]);

  const groupCount = useMemo(
    () => (conversations.data ?? []).filter((c) => c.contact?.wa_jid?.includes("@g.us")).length,
    [conversations.data],
  );

  const counts = useMemo(() => {
    const nonGroup = (conversations.data ?? []).filter(
      (c) => !c.contact?.wa_jid?.includes("@g.us"),
    );
    return {
      todas: nonGroup.filter((c) => c.status !== "closed").length,
      minhas: nonGroup.filter((c) => c.status === "open" && c.assigned_to === user?.id).length,
      fila: nonGroup.filter((c) => c.status === "waiting").length,
      encerradas: nonGroup.filter((c) => c.status === "closed").length,
    };
  }, [conversations.data, user?.id]);

  const selected = (conversations.data ?? []).find((c) => c.id === selectedId) ?? null;
  const unreadMap = useUnreadMap();

  // Abrir a conversa marca as mensagens dela como lidas.
  useEffect(() => {
    setActiveConversation(selectedId);
    setReplyTo(null);
    if (selectedId) markConversationRead(selectedId);
    return () => setActiveConversation(null);
  }, [selectedId, unreadMap[selectedId ?? ""]]);

  const messages = useQuery({
    queryKey: ["messages", selectedId],
    enabled: !!selectedId,
    queryFn: () => fetchMessages(selectedId!),
    // A Evolution pode entregar várias mensagens em sequência; esta conferência
    // curta recupera qualquer evento perdido sem esperar minutos.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    placeholderData: (prev: any) => prev,
  });

  const transfers = useQuery({
    queryKey: ["transfers", selectedId],
    enabled: !!selectedId,
    queryFn: () => fetchTransfers(selectedId!),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["transfers", selectedId] });
    // A conexão, a fila e o responsável mudam juntos: recarrega tudo que a
    // tela mostra sobre o atendimento, sem esperar a próxima conferência.
    queryClient.invalidateQueries({ queryKey: ["wa-connections"] });
    queryClient.invalidateQueries({ queryKey: ["queues"] });
    queryClient.invalidateQueries({ queryKey: ["agents"] });
  };


  const myProfile = useQuery({
    queryKey: ["my-signature", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, signature_enabled")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const saveSignature = useMutation({
    mutationFn: async (patch: { signature_enabled?: boolean }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-signature", user?.id] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar assinatura", { description: e.message }),
  });

  const sendFn = useServerFn(sendWhatsappMessage);
  const suggestFn = useServerFn(suggestReply);
  const suggest = useMutation({
    mutationFn: () => {
      if (!selectedId) return Promise.resolve(null);
      return suggestFn({ data: { conversationId: selectedId } });
    },
    onSuccess: (res) => {
      if (res?.text) setDraft(res.text);
    },
    onError: (e: Error) =>
      toast.error("A IA não conseguiu sugerir uma resposta", { description: e.message }),
  });

  const correctFn = useServerFn(correctText);
  const correct = useMutation({
    mutationFn: () => {
      if (!draft.trim()) return Promise.resolve(null);
      return correctFn({ data: { text: draft.trim() } });
    },
    onSuccess: (res) => {
      if (res?.text) {
        setDraft(res.text);
        toast.success("Texto corrigido pela IA");
      }
    },
    onError: (e: Error) =>
      toast.error("A IA não conseguiu corrigir o texto", { description: e.message }),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState<{ url: string; name: string; mimeType: string }[]>([]);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const contactOptions = useQuery({
    queryKey: ["contact-options"],
    enabled: contactPickerOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone")
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredContactOptions = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = contactOptions.data ?? [];
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, "")),
    );
  }, [contactOptions.data, contactSearch]);
  const MAX_FILE_BYTES = 200 * 1024 * 1024;

  const attach = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: { url: string; name: string; mimeType: string }[] = [];
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`"${file.name}" passa de 200 MB.`);
        }
        const rawExt = file.name.includes(".") ? file.name.split(".").pop()! : "bin";
        const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const path = `${selectedId ?? "geral"}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("anexos").upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (error) throw new Error(error.message);
        const { data, error: signError } = await supabase.storage
          .from("anexos")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signError || !data?.signedUrl) {
          throw new Error(signError?.message ?? "Não foi possível gerar o link do anexo.");
        }
        uploaded.push({
          url: data.signedUrl,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
        });
      }
      return uploaded;
    },
    onSuccess: (res) => {
      setPending((p) => [...p, ...res]);
      toast.success(res.length > 1 ? `${res.length} anexos prontos` : "Anexo pronto", {
        description: "Clique em enviar para mandar no WhatsApp.",
      });
    },
    onError: (e: Error) => toast.error("Erro ao anexar arquivo", { description: e.message }),
  });


  function insertEmoji(emoji: string) {
    setDraft((d) => d + emoji);
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const el = textareaRef.current;
    if (!el) {
      setDraft((d) => `${d}${prefix}${suffix}`);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const selected = draft.slice(start, end);
    const next = `${draft.slice(0, start)}${prefix}${selected}${suffix}${draft.slice(end)}`;
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + prefix.length + selected.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function prefixLine(marker: string) {
    setDraft((d) => (d.trim() ? `${marker} ${d}` : marker + " "));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }


  const send = useMutation({
    mutationFn: async (payload: {
      conversationId: string;
      body: string;
      attachments: { url: string; name: string; mimeType: string }[];
      sticker?: { path: string; name: string } | null;
      reply?: { externalId: string; mine: boolean; body: string } | null;
    }) =>
      sendFn({ data: payload }),
    onMutate: (payload) => {
      setDraft("");
      setPending([]);
      setReplyTo(null);
      // A bolha aparece na hora: grava no cache antes de qualquer espera.
      const previous = queryClient.getQueryData<any[]>(["messages", payload.conversationId]);
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        conversation_id: payload.conversationId,
        direction: "outbound",
        body:
          payload.body +
          payload.attachments.map((a) => `\n📎 ${a.name}: ${a.url}`).join(""),
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<any[]>(["messages", payload.conversationId], (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      queryClient.cancelQueries({ queryKey: ["messages", payload.conversationId] });
      return { previous, conversationId: payload.conversationId };
    },
    onSuccess: (result, _payload, context) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", context?.conversationId] });
      if (result && !result.sent) {
        toast.warning("Mensagem salva, mas não enviada pelo WhatsApp", {
          description: result.deliveryError ?? "Conecte o WhatsApp na aba WhatsApp.",
        });
      }
    },
    onError: (e: Error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["messages", context.conversationId], context.previous);
      }
      toast.error("Erro ao enviar", { description: e.message });
    },
  });

  // Áudio gravado no chat: sobe o arquivo e já envia na conversa ou no grupo.
  const sendAudio = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedId) throw new Error("Selecione uma conversa.");
      const ext = (file.name.split(".").pop() ?? "ogg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${selectedId}/${crypto.randomUUID()}.${ext || "ogg"}`;
      const { error } = await supabase.storage.from("anexos").upload(path, file, {
        contentType: file.type || "audio/ogg",
        upsert: false,
      });
      if (error) throw new Error(error.message);
      const { data, error: signError } = await supabase.storage
        .from("anexos")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signError || !data?.signedUrl) {
        throw new Error(signError?.message ?? "Não foi possível gerar o link do áudio.");
      }
      return {
        url: data.signedUrl,
        name: file.name,
        mimeType: file.type || "audio/ogg",
      };
    },
    onSuccess: (audio) => {
      if (!selectedId) return;
      send.mutate({
        conversationId: selectedId,
        body: "",
        attachments: [audio],
        reply: replyTo
          ? { externalId: replyTo.externalId, mine: replyTo.mine, body: replyTo.body }
          : null,
      });
    },
    onError: (e: Error) => toast.error("Erro ao enviar o áudio", { description: e.message }),
  });

  const forward = useMutation({
    mutationFn: async (payload: { body: string; targets: string[] }) => {
      let ok = 0;
      for (const conversationId of payload.targets) {
        await sendFn({
          data: { conversationId, body: payload.body, attachments: [], contact: null },
        });
        ok += 1;
      }
      return ok;
    },
    onSuccess: (count) => {
      setForwardBody(null);
      setForwardTargets([]);
      setForwardSearch("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      toast.success(
        count === 1 ? "Mensagem encaminhada" : `Mensagem encaminhada para ${count} conversas`,
      );
    },
    onError: (e: Error) => toast.error("Erro ao encaminhar", { description: e.message }),
  });

  const forwardOptions = useMemo(() => {
    const term = forwardSearch.trim().toLowerCase();
    return (conversations.data ?? [])
      .filter((c) => c.id !== selectedId)
      .filter((c) =>
        !term
          ? true
          : (c.contact?.name ?? "").toLowerCase().includes(term) ||
            (c.contact?.phone ?? "").includes(term),
      )
      .slice(0, 50);
  }, [conversations.data, forwardSearch, selectedId]);

  const sendContact = useMutation({
    mutationFn: async (c: { name: string; phone: string }) => {
      if (!selectedId) return null;
      return sendFn({
        data: { conversationId: selectedId, body: "", attachments: [], contact: c },
      });
    },
    onSuccess: (result) => {
      setContactPickerOpen(false);
      setContactSearch("");
      refresh();
      if (result && !result.sent) {
        toast.warning("Contato salvo, mas não enviado pelo WhatsApp", {
          description: result.deliveryError ?? "Conecte o WhatsApp na aba WhatsApp.",
        });
      } else {
        toast.success("Contato enviado");
      }
    },
    onError: (e: Error) => toast.error("Erro ao enviar contato", { description: e.message }),
  });

  // A linha que voltou gravada do banco entra na lista na hora: o cartão
  // mostra o estado real mesmo antes da próxima conferência.
  const applyConversation = (row: Conversation) => {
    queryClient.setQueryData<Conversation[]>(["conversations"], (prev) =>
      (prev ?? []).map((c) => (c.id === row.id ? { ...c, ...row } : c)),
    );
  };

  const claim = useMutation({
    mutationFn: async () => claimConversation(selectedId!, user!.id),
    onSuccess: (row) => {
      applyConversation(row);
      toast.success("Atendimento assumido");
      refresh();
    },
    onError: (e: Error) => toast.error("Erro ao assumir", { description: e.message }),
  });

  const close = useMutation({
    mutationFn: async () => closeConversation(selectedId!),
    onSuccess: (row) => {
      applyConversation(row);
      toast.success("Atendimento encerrado");
      refresh();
    },
    onError: (e: Error) => toast.error("Erro ao encerrar", { description: e.message }),
  });

  const reopen = useMutation({
    mutationFn: async () => reopenConversation(selectedId!, user!.id),
    onSuccess: (row) => {
      applyConversation(row);
      toast.success("Atendimento reaberto");
      refresh();
    },
    onError: (e: Error) => toast.error("Erro ao reabrir", { description: e.message }),
  });

  const deleteConversationFn = useServerFn(deleteConversation);
  const removeConversation = useMutation({
    mutationFn: async (conversationId: string) =>
      deleteConversationFn({ data: { conversationId } }),
    onSuccess: (_res, conversationId) => {
      toast.success("Conversa apagada");
      if (selectedId === conversationId) setSelectedId(null);
      refresh();
    },
    onError: (e: Error) => toast.error("Erro ao apagar", { description: e.message }),
  });

  const deleteMessageFn = useServerFn(deleteWhatsappMessage);
  const removeMessage = useMutation({
    mutationFn: async (messageId: string) => deleteMessageFn({ data: { messageId } }),
    onSuccess: (res) => {
      if (res.warning) {
        toast.warning("Mensagem apagada só aqui", { description: res.warning });
      } else {
        toast.success("Mensagem apagada aqui e no WhatsApp");
      }
      queryClient.invalidateQueries({ queryKey: ["messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error("Erro ao apagar a mensagem", { description: e.message }),
  });



  const loadPhotos = useMutation({
    mutationFn: async () => syncContactPhotos(),
    onSuccess: (res) => {
      if (res.warning) {
        toast.warning("Fotos não carregadas", { description: res.warning });
      } else {
        toast.success(
          res.updated > 0 ? `${res.updated} foto(s) atualizadas` : "Todas as fotos já estavam aqui",
        );
      }
      refresh();
    },
    onError: (e: Error) => toast.error("Erro ao buscar as fotos", { description: e.message }),
  });

  const agentName = (id: string | null) =>
    (profiles.data ?? []).find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col overflow-hidden bg-background md:h-screen md:flex-row">
      {/* Lista */}
      <section
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col border-border bg-card transition-[width] duration-200 ease-in-out md:flex-none md:border-r",
          listCollapsed ? "hidden md:flex md:w-16" : "w-full md:w-[288px] lg:w-[320px]",
        )}
      >
        <div className={cn(listCollapsed ? "p-2" : "space-y-2 border-b border-border p-3")}>
          <div className="flex items-center justify-between gap-2">
            {!listCollapsed && (
              <h1 className="text-sm font-semibold tracking-tight text-foreground">
                Atendimentos
              </h1>
            )}
            {!listCollapsed && (
              <Button
                variant={tab === "encerradas" ? "secondary" : "ghost"}
                size="icon"
                className="shrink-0"
                title={`Conversas encerradas${counts.encerradas ? ` (${counts.encerradas})` : ""}`}
                aria-label="Conversas encerradas"
                onClick={() => setTab("encerradas")}
              >
                <Archive className="size-4" />
              </Button>
            )}
            {!listCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto shrink-0"
                title="Trazer fotos dos contatos e grupos"
                disabled={loadPhotos.isPending}
                onClick={() => loadPhotos.mutate()}
              >
                {loadPhotos.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageDown className="size-4" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              title={listCollapsed ? "Expandir conversas" : "Encolher conversas"}
              onClick={() => setListCollapsed((v) => !v)}
            >
              {listCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          </div>
          {!listCollapsed && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar nome ou telefone"
                  className="h-9 rounded-[8px] pl-8 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={queueFilter} onValueChange={setQueueFilter}>
                <SelectTrigger className="h-9 rounded-[8px] text-xs">
                  <SelectValue placeholder="Todas as filas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filas</SelectItem>
                  {(queues.data ?? []).map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="h-9 rounded-[8px] text-xs">
                    <SelectValue placeholder="Todos os atendentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os atendentes</SelectItem>
                    <SelectItem value="none">Sem atendente</SelectItem>
                    {(profiles.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                  <TabsList
                    className="flex h-auto w-full flex-nowrap items-center justify-start gap-1 overflow-x-auto rounded-[8px] bg-muted/70 p-1 scrollbar-hide"
                  >
                    <TabsTrigger value="minhas" className="h-7 shrink-0 whitespace-nowrap px-2 text-[10px] leading-none">
                      Minhas{counts.minhas > 0 ? ` (${counts.minhas})` : ""}
                    </TabsTrigger>
                    {isAdmin && (
                      <TabsTrigger value="todas" className="h-7 shrink-0 whitespace-nowrap px-2 text-[10px] leading-none">
                        Todas{counts.todas > 0 ? ` (${counts.todas})` : ""}
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="fila" className="h-7 shrink-0 whitespace-nowrap px-2 text-[10px] leading-none">
                      Aguardando{counts.fila > 0 ? ` (${counts.fila})` : ""}
                    </TabsTrigger>
                    <TabsTrigger value="grupos" className="h-7 shrink-0 whitespace-nowrap px-2 text-[10px] leading-none">
                      Grupos{groupCount > 0 ? ` (${groupCount})` : ""}
                    </TabsTrigger>
                  </TabsList>

              </Tabs>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && !listCollapsed && (
            <p className="p-4 text-sm text-muted-foreground">
              {tab === "grupos" ? "Nenhum grupo por aqui." : "Nenhuma conversa nesta aba."}
            </p>
          )}
          {listCollapsed ? (
            <div className="flex flex-col items-center gap-3 p-2">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setListCollapsed(true);
                  }}
                  className={cn(
                    "rounded-full p-1 transition-colors hover:bg-accent",
                    selectedId === c.id && "bg-primary/10 ring-1 ring-primary",
                  )}
                  title={c.contact?.name ?? c.contact?.phone}
                >
                  <span className="relative block">
                    <ContactAvatar
                      className="size-9"
                      url={c.contact?.avatar_url ?? null}
                      name={c.contact?.name ?? null}
                    />
                    {(unreadMap[c.id] ?? 0) > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                        {unreadMap[c.id]! > 99 ? "99+" : unreadMap[c.id]}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            list.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedId(c.id);
                  setListCollapsed(true);
                }}
                className={cn(
                  "mx-2 mb-1 flex w-[calc(100%-1rem)] items-start gap-2.5 rounded-[8px] border border-transparent px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
                  selectedId === c.id && "border-primary/30 bg-primary/10",
                )}
              >
                <ContactAvatar
                  className="mt-0.5 size-9 shrink-0"
                  url={c.contact?.avatar_url ?? null}
                  name={c.contact?.name ?? null}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "truncate text-sm text-foreground",
                        (unreadMap[c.id] ?? 0) > 0 ? "font-bold" : "font-medium",
                      )}
                    >
                      {c.contact?.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {timeAgo(c.last_message_at)}
                      {(unreadMap[c.id] ?? 0) > 0 && (
                        <span className="flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                          {unreadMap[c.id]! > 99 ? "99+" : unreadMap[c.id]}
                        </span>
                      )}
                      {c.status === "closed" && (
                        <span
                          role="button"
                          aria-label="Apagar conversa"
                          title="Apagar conversa"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                `Apagar a conversa com ${c.contact?.name ?? "este contato"}? Essa ação não pode ser desfeita.`,
                              )
                            ) {
                              removeConversation.mutate(c.id);
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.contact?.wa_jid?.includes("@g.us")
                      ? `Grupo · ${c.contact?.name ?? ""}`
                      : c.contact?.phone}
                  </span>
                  {previewMensagem(c.last_message) && (
                    <span
                      className={cn(
                        "flex min-w-0 items-center gap-1 text-xs",
                        (unreadMap[c.id] ?? 0) > 0
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {c.last_message?.direction === "outbound" && (
                        <Check className="size-3 shrink-0 text-primary" />
                      )}
                      <span className="truncate">
                        {c.last_message?.direction === "outbound" ? "Você: " : ""}
                        {previewMensagem(c.last_message)}
                      </span>
                    </span>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.contact?.wa_jid?.includes("@g.us") && (
                      <Badge variant="secondary" className="text-[10px]">
                        grupo
                      </Badge>
                    )}
                    {c.queue && (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-[10px]"
                        style={{
                          backgroundColor: `${c.queue.color}1f`,
                          color: c.queue.color,
                        }}
                      >
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: c.queue.color }}
                        />
                        {c.queue.name}
                      </Badge>
                    )}
                    {c.connection && (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-[10px]"
                        style={{
                          backgroundColor: `${c.connection.color}1f`,
                          color: c.connection.color,
                        }}
                      >
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: c.connection.color }}
                        />
                        {c.connection.label || c.connection.instance_name}
                      </Badge>
                    )}
                    {c.status === "waiting" && (
                      <Badge className="bg-accent text-[10px] text-accent-foreground">
                        aguardando
                      </Badge>
                    )}
                    {c.status === "open" && (
                      <Badge variant="outline" className="text-[10px]">
                        {agentName(c.assigned_to)}
                      </Badge>
                    )}
                    {c.status === "closed" && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        encerrado
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Conversa */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="size-9 text-primary/40" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                Central de atendimento
              </h2>
              <p className="max-w-xs text-sm text-muted-foreground">
                Selecione uma conversa ao lado para ver as mensagens e começar o atendimento.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-card px-2 py-2 sm:px-4 sm:py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {listCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 md:hidden"
                    title="Voltar às conversas"
                    onClick={() => setListCollapsed(false)}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                )}
                <ContactAvatar
                  className="size-8 shrink-0 sm:size-9"
                  url={selected.contact?.avatar_url ?? null}
                  name={selected.contact?.name ?? null}
                />
                <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selected.contact?.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.contact?.wa_jid?.includes("@g.us")
                    ? "Grupo do WhatsApp"
                    : selected.contact?.phone}{" "}
                  · {selected.queue?.name ?? "sem fila"}
                </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {!selected.contact?.wa_jid?.includes("@g.us") && selected.contact?.phone && (
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={callMutation.isPending}
                    aria-label="Ligar pelo WhatsApp"
                    title="Ligar pelo WhatsApp"
                    onClick={() =>
                      callMutation.mutate({
                        phone: selected.contact?.phone ?? "",
                        name: selected.contact?.name ?? "",
                      })
                    }
                  >
                    {callMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PhoneCall className="size-4" />
                    )}

                  </Button>
                )}
                {selected.status !== "closed" && selected.assigned_to !== user?.id && (
                  <Button size="icon" aria-label="Assumir atendimento" title="Assumir atendimento" onClick={() => claim.mutate()}>
                    <UserPlus className="size-4" />
                  </Button>
                )}

                {selected.status !== "closed" && (
                  <>
                    <Button size="icon" variant="outline" aria-label="Transferir" title="Transferir" onClick={() => setTransferOpen(true)}>
                      <ArrowRightLeft className="size-4" />
                    </Button>
                    <Button size="icon" variant="outline" aria-label="Encerrar" title="Encerrar" onClick={() => close.mutate()}>
                      <CheckCircle2 className="size-4" />
                    </Button>
                  </>
                )}
                {selected.status === "closed" && (
                  <Button size="icon" variant="outline" aria-label="Reabrir" title="Reabrir" onClick={() => reopen.mutate()}>
                    <RotateCcw className="size-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  title={showContactPanel ? "Ocultar painel do contato" : "Mostrar painel do contato"}
                  onClick={() => setShowContactPanel((v) => !v)}
                >
                  {showContactPanel ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </Button>
              </div>
            </header>

            <div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/40 bg-repeat bg-center p-3 sm:space-y-4 sm:p-5"
              style={{
                backgroundColor: chatBackground,
                backgroundImage: project?.chatBackgroundUrl
                  ? `url(${JSON.stringify(project.chatBackgroundUrl)})`
                  : undefined,
              }}
            >
              {(messages.data ?? []).map((m) => {
                if (m.direction === "system") {
                  return (
                    <p
                      key={m.id}
                      className="mx-auto w-fit max-w-md rounded-full border border-border bg-card px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-sm"
                    >
                      {m.body}
                    </p>
                  );
                }
                const mine = m.direction === "outbound";
                const isGroupChat = !!selected.contact?.wa_jid?.includes("@g.us");
                const signature = mine ? parseSignedMessage(m.body) : null;
                const groupParticipant =
                  (!mine && isGroupChat ? parseGroupMessage(m.body) : null) ??
                  signature;
                const displayedBody = groupParticipant?.body ?? m.body;
                const hasAudio = parseAttachments(displayedBody).audios.length > 0;
                return (
                  <div
                    key={m.id}
                    className={cn(
                        "group flex items-end gap-2 px-1",
                      mine ? "justify-end" : "justify-start",
                    )}
                  >
                    {mine && (
                      <>
                        <button
                          type="button"
                          title="Encaminhar mensagem"
                          aria-label="Encaminhar mensagem"
                          className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setForwardBody(m.body);
                            setForwardTargets([]);
                            setForwardSearch("");
                          }}
                        >
                          <Forward className="size-4" />
                        </button>
                        {m.external_id && (
                          <button
                            type="button"
                            title="Responder esta mensagem"
                            aria-label="Responder esta mensagem"
                            className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setReplyTo({
                                messageId: m.id,
                                externalId: m.external_id!,
                                mine,
                                body: m.body,
                              });
                              requestAnimationFrame(() => textareaRef.current?.focus());
                            }}
                          >
                            <Reply className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Apagar mensagem (aqui e no WhatsApp)"
                          aria-label="Apagar mensagem"
                          disabled={removeMessage.isPending}
                          className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive disabled:opacity-40"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Apagar esta mensagem aqui e no WhatsApp do contato?",
                              )
                            ) {
                              removeMessage.mutate(m.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                    {groupParticipant && !mine && !hasAudio ? (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-2 shadow-sm",
                          participantStyle(groupParticipant.name),
                        )}
                      >
                        {initials(groupParticipant.name)}
                      </span>
                    ) : (
                      !mine && !hasAudio && (
                        <ContactAvatar
                          url={selected.contact?.avatar_url ?? null}
                          name={selected.contact?.name ?? null}
                          className="mb-0.5 size-8 text-[10px] ring-2 ring-primary/15 shadow-sm"
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "w-fit min-w-[10rem] max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[68%]",
                        mine
                          ? "rounded-br-md bg-message-sent text-message-sent-foreground"
                          : "rounded-bl-md border border-border/60 bg-message-received text-message-received-foreground",
                      )}
                    >
                      {groupParticipant && (
                         <div className="mb-1 flex min-w-0 items-baseline gap-1.5">
                           <span
                             className={cn(
                               "truncate text-xs font-semibold",
                               mine ? "text-message-sent-foreground" : "text-primary",
                             )}
                           >
                            {groupParticipant.name}
                          </span>
                          {groupParticipant.phone && (
                            <span
                              className={cn(
                                "shrink-0 text-[10px] font-medium",
                                mine
                                  ? "text-message-sent-foreground/70"
                                  : "text-muted-foreground",
                              )}
                            >
                              {groupParticipant.phone}
                            </span>
                          )}
                        </div>
                      )}
                      {m.reply_body && (
                        <div
                          className={cn(
                            "mb-1.5 flex items-start gap-1.5 rounded-lg border-l-[3px] px-2.5 py-1.5 text-xs leading-snug",
                            mine
                              ? "border-message-sent-foreground/50 bg-message-sent-foreground/10"
                              : "border-primary/60 bg-primary/5",
                          )}
                        >
                          <Quote className="mt-0.5 size-3 shrink-0 opacity-70" />
                          <span className="line-clamp-2 break-words opacity-90">
                            {m.reply_body.length > 160
                              ? `${m.reply_body.slice(0, 160)}…`
                              : m.reply_body}
                          </span>
                        </div>
                      )}
                      <MessageBody
                        body={displayedBody}
                        mine={mine}
                        contactName={groupParticipant?.name ?? selected.contact?.name ?? null}
                        avatarUrl={groupParticipant ? null : selected.contact?.avatar_url ?? null}
                      />
                      <p
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px] leading-none tabular-nums",
                          mine
                            ? "text-message-sent-foreground/70"
                            : "text-message-received-foreground/60",
                        )}
                      >
                        {m.edited_at ? <span className="italic">editada</span> : null}
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {!mine && (
                      <>
                        <button
                          type="button"
                          title="Encaminhar mensagem"
                          aria-label="Encaminhar mensagem"
                          className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setForwardBody(m.body);
                            setForwardTargets([]);
                            setForwardSearch("");
                          }}
                        >
                          <Forward className="size-4" />
                        </button>
                        {m.external_id && (
                          <button
                            type="button"
                            title="Responder esta mensagem"
                            aria-label="Responder esta mensagem"
                            className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setReplyTo({
                                messageId: m.id,
                                externalId: m.external_id!,
                                mine,
                                body: m.body,
                              });
                              requestAnimationFrame(() => textareaRef.current?.focus());
                            }}
                          >
                            <Reply className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title="Apagar mensagem (aqui e no WhatsApp)"
                          aria-label="Apagar mensagem"
                          disabled={removeMessage.isPending}
                          className="opacity-0 transition group-hover:opacity-100 text-muted-foreground hover:text-destructive disabled:opacity-40"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Apagar esta mensagem aqui e no WhatsApp do contato?",
                              )
                            ) {
                              removeMessage.mutate(m.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border px-3 pt-3">
                {pending.map((f) => (
                  <span
                    key={f.url}
                    className="flex max-w-[240px] items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                  >
                    <Paperclip className="size-3 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remover ${f.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPending((p) => p.filter((x) => x.url !== f.url))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {replyTo && (
              <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-4 py-2">
                <Quote className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    Respondendo {replyTo.mine ? "sua mensagem" : "o cliente"}
                  </p>
                  <p className="truncate">{replyTo.body}</p>
                </div>
                <button
                  type="button"
                  aria-label="Cancelar resposta"
                  title="Cancelar resposta"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setReplyTo(null)}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            <form
              className="flex shrink-0 items-start gap-2 border-t border-border bg-card px-2 py-2 sm:px-3 sm:py-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedId || (!draft.trim() && pending.length === 0)) return;
                send.mutate({
                  conversationId: selectedId,
                  body: draft.trim(),
                  attachments: pending,
                  reply: replyTo
                    ? {
                        externalId: replyTo.externalId,
                        mine: replyTo.mine,
                        body: replyTo.body,
                      }
                    : null,
                });
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) attach.mutate(files);
                  e.target.value = "";
                }}
              />

              <div className="hidden flex-col gap-2 sm:flex">
                <button
                  type="button"
                  title="Anexar arquivos (PDF e outros)"
                  aria-label="Anexar arquivos"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selected.status === "closed" || attach.isPending}
                  className="flex size-9 items-center justify-center rounded-[8px] border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {attach.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  title="Enviar contato"
                  aria-label="Enviar contato"
                  onClick={() => setContactPickerOpen(true)}
                  disabled={selected.status === "closed" || sendContact.isPending}
                  className="flex size-9 items-center justify-center rounded-[8px] border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {sendContact.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ContactRound className="size-4" />
                  )}
                </button>
              </div>

              <div className="min-w-0 flex-1 rounded-[10px] border border-border bg-background transition-colors focus-within:border-primary/50 focus-within:bg-card">
                <Textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    selected.status === "closed"
                      ? "Reabra o atendimento para responder"
                      : "Digite aqui..."
                  }
                  disabled={selected.status === "closed"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if ((draft.trim() || pending.length) && selectedId)
                        send.mutate({
                          conversationId: selectedId,
                          body: draft.trim(),
                          attachments: pending,
                          reply: replyTo
                            ? {
                                externalId: replyTo.externalId,
                                mine: replyTo.mine,
                                body: replyTo.body,
                              }
                            : null,
                        });
                    }
                  }}
                  onPaste={(e) => {
                    const items = Array.from(e.clipboardData?.items ?? []);
                    const imageFiles = items
                      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                      .map((item) => item.getAsFile())
                      .filter((f): f is File => !!f)
                      .map((f, i) => {
                        const ext = (f.type.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "") || "png";
                        const stamp = new Date()
                          .toISOString()
                          .replace(/[:T]/g, "-")
                          .slice(0, 19);
                        const suffix = i > 0 ? `-${i + 1}` : "";
                        return new File([f], `captura-${stamp}${suffix}.${ext}`, { type: f.type });
                      });
                    if (imageFiles.length === 0) return;
                    if (selected.status === "closed") return;
                    e.preventDefault();
                    attach.mutate(imageFiles);
                  }}
                  rows={2}
                  className="min-h-[46px] resize-none border-0 bg-transparent px-3 py-2.5 text-sm shadow-none focus-visible:ring-0"
                />

                <div className="flex items-center gap-1 overflow-x-auto border-t border-border px-2 py-1.5">
                  <button
                    type="button"
                    title="Correção automática com IA"
                    aria-label="Correção automática com IA"
                    onClick={() => correct.mutate()}
                    disabled={selected.status === "closed" || !draft.trim() || correct.isPending}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {correct.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Pencil className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    title="Negrito"
                    aria-label="Negrito"
                    onClick={() => wrapSelection("*")}
                    disabled={selected.status === "closed"}
                    className="flex size-8 items-center justify-center rounded-md font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Bold className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Itálico"
                    aria-label="Itálico"
                    onClick={() => wrapSelection("_")}
                    disabled={selected.status === "closed"}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Italic className="size-4" />
                  </button>

                  <button
                    type="button"
                    title="Menu de botões"
                    aria-label="Menu de botões"
                    onClick={() => setMenuPickerOpen(true)}
                    disabled={selected.status === "closed"}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <ListOrdered className="size-4" />
                  </button>

                  <button
                    type="button"
                    title="Enviar a loja"
                    aria-label="Enviar a loja"
                    onClick={() => setLojaOpen(true)}
                    disabled={selected.status === "closed"}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <ShoppingBag className="size-4" />
                  </button>

                  <button
                    type="button"
                    title="Enviar card de Pix"
                    aria-label="Enviar card de Pix"
                    onClick={() => setPixOpen(true)}
                    disabled={selected.status === "closed"}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <QrCode className="size-4" />
                  </button>


                  <div className="mx-1 hidden shrink-0 items-center gap-2 sm:flex">
                    <Label htmlFor="signature-toggle" className="text-xs text-muted-foreground">
                      Assinar
                    </Label>
                    <Switch
                      id="signature-toggle"
                      checked={!!myProfile.data?.signature_enabled}
                      onCheckedChange={(v) => saveSignature.mutate({ signature_enabled: v })}
                    />
                  </div>

                  <button
                    type="button"
                    title="Citação"
                    aria-label="Citação"
                    onClick={() => prefixLine(">")}
                    disabled={selected.status === "closed"}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Quote className="size-4" />
                  </button>

                   <div className="ml-auto flex shrink-0 items-center gap-1">
                     <StickerPicker
                      disabled={selected.status === "closed" || send.isPending}
                      onPick={(sticker) =>
                        send.mutate({
                          conversationId: selected.id,
                          body: "",
                          attachments: [],
                          sticker,
                        })
                      }
                    />
                    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          title="Emojis"
                          aria-label="Emojis"
                          disabled={selected.status === "closed"}
                          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          <Smile className="size-4" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 p-2">
                        <div className="grid grid-cols-8 gap-1">
                          {EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className="rounded-md p-1 text-lg transition hover:bg-muted"
                              onClick={() => insertEmoji(emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <button
                      type="button"
                      title="Sugerir resposta com IA"
                      aria-label="Sugerir resposta com IA"
                      onClick={() => suggest.mutate()}
                      disabled={selected.status === "closed" || suggest.isPending}
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {suggest.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                    </button>
                    {!draft.trim() && pending.length === 0 ? (
                      <AudioRecorder
                        disabled={selected.status === "closed"}
                        enviando={sendAudio.isPending}
                        onReady={(file) => sendAudio.mutate(file)}
                        className="size-8 rounded-md bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                      />
                    ) : (
                      <Button
                        type="submit"
                        size="icon"
                        className="size-8 rounded-md"
                        title="Enviar"
                        aria-label="Enviar"
                        disabled={selected.status === "closed"}
                      >
                        <Send className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </form>

          </>
        )}

        <Dialog open={menuPickerOpen} onOpenChange={setMenuPickerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Menu de botões</DialogTitle>
            </DialogHeader>
            {buttonMenus.isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (buttonMenus.data ?? []).length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhum menu criado. Peça a um administrador para cadastrar em Configurações →
                Menus de botão.
              </p>
            ) : (
              <ul className="space-y-2">
                {(buttonMenus.data ?? []).map((menu) => (
                  <li
                    key={menu.id}
                    className="rounded-lg border border-border px-3 py-2 transition hover:border-primary/50"
                  >
                    <p className="text-sm font-medium">{menu.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {MENU_KIND_LABELS[menu.kind ?? "text"]} ·{" "}
                      {menu.options.map((o, i) => `${i + 1} - ${o}`).join(" · ")}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        disabled={!selectedId || sendMenuMutation.isPending}
                        onClick={() => sendMenuMutation.mutate(menu.id)}
                      >
                        {sendMenuMutation.isPending && (
                          <Loader2 className="size-3.5 animate-spin" />
                        )}
                        Enviar agora
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDraft((current) =>
                            current.trim()
                              ? `${current}\n${formatButtonMenuText(menu)}`
                              : formatButtonMenuText(menu),
                          );
                          setMenuPickerOpen(false);
                          requestAnimationFrame(() => textareaRef.current?.focus());
                        }}
                      >
                        Inserir como texto
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={lojaOpen} onOpenChange={setLojaOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar a loja</DialogTitle>
              <DialogDescription>
                O contato escolhe o produto direto no WhatsApp e você gera o Pix em seguida.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="loja-titulo">Título da loja</Label>
                <Input
                  id="loja-titulo"
                  value={lojaTitulo}
                  onChange={(e) => setLojaTitulo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Formato</Label>
                <Select
                  value={lojaModo}
                  onValueChange={(v) => setLojaModo(v as "botoes" | "lista" | "link")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lista">Lista de produtos (menu do WhatsApp)</SelectItem>
                    <SelectItem value="botoes">Botões (até 2 produtos + link)</SelectItem>
                    <SelectItem value="link">Texto com o link da loja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-1 font-medium">Produtos que serão enviados</p>
                {(lojaProdutos.data?.produtos ?? []).length ? (
                  <ul className="space-y-1 text-muted-foreground">
                    {(lojaProdutos.data?.produtos ?? []).map((p) => (
                      <li key={p.id}>
                        {p.nome} — {p.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        {p.disponiveis ? "" : " (esgotado)"}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    Cadastre categorias em Estoque de logins para montar a loja.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLojaOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!selectedId || enviarLojaMutation.isPending}
                onClick={() => enviarLojaMutation.mutate()}
              >
                {enviarLojaMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Enviar loja
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={pixOpen} onOpenChange={setPixOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar Pix</DialogTitle>
              <DialogDescription>
                O contato recebe o QR Code e o código Pix copia e cola para pagar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Forma de cobrança</Label>
              <Select
                value={pixProvider}
                onValueChange={(v) =>
                  setPixProvider(v as "misticpay" | "efi" | "altispay" | "manual")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="misticpay">MisticPay (cobrança com valor)</SelectItem>
                  <SelectItem value="efi">Efí Bank (cobrança com valor)</SelectItem>
                  <SelectItem value="altispay">AltisPay (cobrança com valor)</SelectItem>
                  <SelectItem value="manual">Chave Pix própria</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Entregar do estoque quando pagar</Label>
              <Select value={estoqueCategoria} onValueChange={setEstoqueCategoria}>
                <SelectTrigger>
                  <SelectValue placeholder="Não entregar nada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Não entregar nada</SelectItem>
                  {(categoriasEstoque.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assim que o pagamento for confirmado, o login é enviado sozinho para o cliente.
              </p>
            </div>
            {pixProvider !== "manual" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mp-amount">Valor do pagamento</Label>
                    <Input
                      id="mp-amount"
                      value={misticForm.amount}
                      onChange={(e) => setMisticForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="99,90"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mp-doc">
                      {pixProvider === "efi" || pixProvider === "altispay"
                        ? "CPF/CNPJ do pagador (opcional)"
                        : "CPF do pagador (opcional)"}
                    </Label>
                    <Input
                      id="mp-doc"
                      inputMode="numeric"
                      maxLength={14}
                      value={misticForm.payerDocument}
                      onChange={(e) =>
                        setMisticForm((f) => ({ ...f, payerDocument: e.target.value }))
                      }
                      placeholder="12345678909"
                    />
                    {pixProvider !== "efi" &&
                      pixProvider !== "altispay" &&
                      misticForm.payerDocument.trim() &&
                      misticForm.payerDocument.replace(/\D/g, "").length !== 11 && (
                        <p className="text-xs text-destructive">
                          O CPF precisa ter 11 dígitos.
                        </p>
                      )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mp-payer">Nome do pagador</Label>
                  <Input
                    id="mp-payer"
                    value={misticForm.payerName}
                    onChange={(e) => setMisticForm((f) => ({ ...f, payerName: e.target.value }))}
                    placeholder="Nome do cliente"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mp-desc">Descrição</Label>
                  <Input
                    id="mp-desc"
                    value={misticForm.description}
                    onChange={(e) => setMisticForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Mensalidade de setembro"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {pixProvider === "efi"
                    ? "A cobrança é gerada na Efí Bank e enviada com QR Code e Pix copia e cola."
                    : pixProvider === "altispay"
                      ? "A cobrança é gerada na AltisPay e enviada com QR Code e Pix copia e cola."
                      : "A cobrança é gerada na MisticPay e enviada com QR Code e Pix copia e cola."}
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPixOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={
                      !selectedId ||
                      !misticForm.amount.trim() ||
                      (pixProvider !== "efi" &&
                        pixProvider !== "altispay" &&
                        !!misticForm.payerDocument.trim() &&
                        misticForm.payerDocument.replace(/\D/g, "").length !== 11) ||
                      gatewayMutation.isPending
                    }
                    onClick={() => gatewayMutation.mutate()}
                  >
                    {gatewayMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                    Gerar e enviar cobrança
                  </Button>
                </DialogFooter>
              </div>
            ) : (
            <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pix-name">Nome do recebedor</Label>
                <Input
                  id="pix-name"
                  value={pixForm.name}
                  onChange={(e) => setPixForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: NXS Telecom"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de chave</Label>
                  <Select
                    value={pixForm.keyType}
                    onValueChange={(v) => setPixForm((f) => ({ ...f, keyType: v as PixKeyType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIX_KEY_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pix-amount">Valor (opcional)</Label>
                  <Input
                    id="pix-amount"
                    value={pixForm.amount}
                    onChange={(e) => setPixForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="99,90"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pix-key">Chave Pix</Label>
                <Input
                  id="pix-key"
                  value={pixForm.key}
                  onChange={(e) => setPixForm((f) => ({ ...f, key: e.target.value }))}
                  placeholder="chave@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pix-city">Cidade do recebedor</Label>
                <Input
                  id="pix-city"
                  value={pixForm.city}
                  onChange={(e) => setPixForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="SAO PAULO"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pix-title">Título</Label>
                <Input
                  id="pix-title"
                  value={pixForm.title}
                  onChange={(e) => setPixForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pix-desc">Mensagem</Label>
                <Input
                  id="pix-desc"
                  value={pixForm.description}
                  onChange={(e) => setPixForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Segue o Pix para pagamento."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pix-button">Texto do botão</Label>
                <Input
                  id="pix-button"
                  maxLength={20}
                  value={pixForm.buttonText}
                  onChange={(e) => setPixForm((f) => ({ ...f, buttonText: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPixOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  !selectedId ||
                  !pixForm.key.trim() ||
                  !pixForm.name.trim() ||
                  sendPixMutation.isPending
                }
                onClick={() => sendPixMutation.mutate()}
              >
                {sendPixMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Enviar Pix
              </Button>
            </DialogFooter>
            </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={forwardBody !== null}
          onOpenChange={(v) => {
            if (!v) setForwardBody(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Encaminhar mensagem</DialogTitle>
              <DialogDescription>
                Escolha as conversas que vão receber esta mensagem.
              </DialogDescription>
            </DialogHeader>
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {forwardBody}
            </p>
            <Input
              placeholder="Buscar conversa por nome ou telefone"
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {forwardOptions.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma conversa encontrada.
                </p>
              )}
              {forwardOptions.map((c) => {
                const checked = forwardTargets.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-muted",
                      checked && "bg-muted",
                    )}
                    onClick={() =>
                      setForwardTargets((t) =>
                        t.includes(c.id) ? t.filter((x) => x !== c.id) : [...t, c.id],
                      )
                    }
                  >
                    <ContactAvatar
                      className="size-9"
                      url={c.contact?.avatar_url ?? null}
                      name={c.contact?.name ?? null}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {c.contact?.name ?? "Sem nome"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.contact?.phone}
                      </span>
                    </span>
                    {checked && <CheckCircle2 className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button
                disabled={forwardTargets.length === 0 || forward.isPending}
                onClick={() =>
                  forward.mutate({ body: forwardBody ?? "", targets: forwardTargets })
                }
              >
                {forward.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <Forward className="mr-1.5 size-4" />
                )}
                Encaminhar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar contato</DialogTitle>
              <DialogDescription>
                Escolha um contato cadastrado para enviar nesta conversa.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Buscar por nome ou telefone"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              autoFocus
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {contactOptions.isLoading && (
                <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
              )}
              {!contactOptions.isLoading && filteredContactOptions.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum contato encontrado.
                </p>
              )}
              {filteredContactOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={sendContact.isPending}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-muted disabled:opacity-50"
                  onClick={() => sendContact.mutate({ name: c.name, phone: c.phone })}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">+{c.phone}</span>
                  </span>
                  <Send className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </section>

      {/* Contato */}
      {selected && showContactPanel && (
        <>
        <button
          type="button"
          aria-label="Fechar dados do contato"
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          onClick={() => setShowContactPanel(false)}
        />
        <aside className="fixed inset-y-0 right-0 z-40 w-[85%] max-w-[320px] space-y-3 overflow-y-auto border-l border-border bg-card p-3 shadow-[0_8px_24px_rgba(16,24,40,0.12)] lg:static lg:z-auto lg:w-[300px] lg:max-w-none lg:shrink-0 lg:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Dados do Contato</p>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              title="Recolher painel do contato"
              onClick={() => setShowContactPanel(false)}
            >
              <PanelRightClose className="size-4" />
            </Button>
          </div>
          <div className="rounded-[8px] border border-border p-3">
            <div className="flex items-center gap-3">
              <ContactAvatar
                className="size-12"
                url={selected.contact?.avatar_url ?? null}
                name={selected.contact?.name ?? null}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {selected.contact?.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selected.contact?.wa_jid?.includes("@g.us")
                    ? "Grupo do WhatsApp"
                    : selected.contact?.phone}
                </p>
              </div>
            </div>
          </div>
          <dl className="space-y-1.5 rounded-[8px] border border-border p-3 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Departamento</dt>
              <dd className="text-foreground">{selected.department?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Fila</dt>
              <dd className="text-foreground">{selected.queue?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Responsável</dt>
              <dd className="text-foreground">{agentName(selected.assigned_to)}</dd>
            </div>
          </dl>
          <ContactBilling
            telefone={selected.contact?.phone ?? ""}
            nome={selected.contact?.name ?? ""}
          />
          <div className="rounded-[8px] border border-border p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Transferências
            </p>
            <ul className="mt-2 space-y-2">
              {(transfers.data ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhuma até agora.</li>
              )}
              {(transfers.data ?? []).map((t) => (
                <li key={t.id} className="rounded-md border border-border p-2 text-xs">
                  <p className="text-foreground">
                    {agentName(t.from_user)} →{" "}
                    {t.to_user
                      ? agentName(t.to_user)
                      : ((queues.data ?? []).find((q) => q.id === t.to_queue)?.name ?? "fila")}
                  </p>
                  {t.note && <p className="mt-1 text-muted-foreground">{t.note}</p>}
                  <p className="mt-1 text-muted-foreground">
                    {new Date(t.created_at).toLocaleString("pt-BR")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
        </>
      )}

      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        conversation={selected}
        onDone={refresh}
        agents={(profiles.data ?? []).filter((p) => p.id !== user?.id)}
        queues={queues.data ?? []}
        departments={departments.data ?? []}
        workload={(conversations.data ?? []).reduce<Record<string, number>>((acc, c) => {
          if (c.status !== "closed" && c.assigned_to) acc[c.assigned_to] = (acc[c.assigned_to] ?? 0) + 1;
          return acc;
        }, {})}
        meId={user?.id ?? ""}
        meName={profile?.full_name ?? "Atendente"}
      />
    </div>
  );
}

const AGENT_STATUS: Record<string, { label: string; dot: string }> = {
  available: { label: "Disponível", dot: "bg-emerald-500" },
  away: { label: "Ausente", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-muted-foreground/40" },
};

function TransferDialog({
  open,
  onOpenChange,
  conversation,
  onDone,
  agents,
  queues,
  departments,
  workload,
  meId,
  meName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: Conversation | null;
  onDone: () => void;
  agents: { id: string; full_name: string; status?: string | null }[];
  queues: { id: string; name: string; department_id: string | null }[];
  departments: { id: string; name: string }[];
  workload: Record<string, number>;
  meId: string;
  meName: string;
}) {
  const [mode, setMode] = useState<"user" | "queue" | "connection">("user");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [agentSearch, setAgentSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setTarget("");
    setNote("");
    setAgentSearch("");
    setMode("user");
  }, [open, conversation?.id]);

  const connections = useQuery({
    queryKey: ["wa-connections"],
    enabled: open,
    queryFn: fetchConnections,
  });

  const rank = (s?: string | null) => (s === "available" ? 0 : s === "away" ? 1 : 2);
  const visibleAgents = useMemo(() => {
    const term = agentSearch.trim().toLowerCase();
    return agents
      .filter((a) => !term || a.full_name.toLowerCase().includes(term))
      .sort(
        (a, b) =>
          rank(a.status) - rank(b.status) ||
          (workload[a.id] ?? 0) - (workload[b.id] ?? 0) ||
          a.full_name.localeCompare(b.full_name),
      );
  }, [agents, agentSearch, workload]);

  const alreadyAssigned = mode === "user" && !!target && conversation?.assigned_to === target;

  const transferQueryClient = useQueryClient();
  const submit = useMutation({
    mutationFn: async () => {
      if (!conversation || !target) return null;
      const suffix = note.trim() ? ` Observação: ${note.trim()}` : "";
      if (mode === "connection") {
        const conn = (connections.data ?? []).find((c) => c.id === target);
        const label = conn?.label || conn?.instance_name || "outra conexão";
        return await transferConversation({
          conversationId: conversation.id,
          fromUser: meId,
          toConnection: target,
          note,
          systemLabel: `${meName} transferiu o atendimento para a conexão ${label}${
            conn?.phone ? ` (${conn.phone})` : ""
          }.${suffix}`,
        });
      } else if (mode === "user") {
        const name = agents.find((a) => a.id === target)?.full_name ?? "outro atendente";
        return await transferConversation({
          conversationId: conversation.id,
          fromUser: meId,
          toUser: target,
          note,
          systemLabel: `${meName} transferiu o atendimento para ${name}.${suffix}`,
        });
      } else {
        const queue = queues.find((q) => q.id === target);
        const deptName =
          departments.find((d) => d.id === queue?.department_id)?.name ?? "sem departamento";
        return await transferConversation({
          conversationId: conversation.id,
          fromUser: meId,
          toQueue: target,
          departmentId: queue?.department_id ?? null,
          note,
          systemLabel: `${meName} devolveu o atendimento para a fila ${queue?.name} (${deptName}).${suffix}`,
        });
      }
    },
    onSuccess: (row) => {
      // O novo responsável, a fila e a conexão aparecem na lista na hora.
      if (row) {
        transferQueryClient.setQueryData<Conversation[]>(["conversations"], (prev) =>
          (prev ?? []).map((c) => (c.id === row.id ? { ...c, ...row } : c)),
        );
      }
      toast.success("Atendimento transferido");
      setTarget("");
      setNote("");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error("Erro ao transferir", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir atendimento</DialogTitle>
          <DialogDescription>
            Escolha um colega, devolva a conversa para uma fila ou mude a conexão que atende.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as typeof mode);
            setTarget("");
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="user" className="flex-1">
              Usuário
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex-1">
              Fila
            </TabsTrigger>
            <TabsTrigger value="connection" className="flex-1">
              Conexão
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-3">
          {mode === "user" ? (
            <div className="space-y-2">
              <Label htmlFor="transfer-search">Atendente</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="transfer-search"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Procurar atendente"
                  className="h-9 pl-8"
                />
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-[8px] border border-border p-1">
                {visibleAgents.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">Nenhum atendente encontrado.</p>
                )}
                {visibleAgents.map((a) => {
                  const st = AGENT_STATUS[a.status ?? "offline"] ?? AGENT_STATUS["offline"]!;
                  const count = workload[a.id] ?? 0;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setTarget(a.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                        target === a.id && "bg-primary/10 ring-1 ring-primary/30",
                      )}
                    >
                      <span className={cn("size-2 shrink-0 rounded-full", st.dot)} />
                      <span className="min-w-0 flex-1 truncate text-foreground">{a.full_name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {st.label} · {count} em aberto
                      </span>
                    </button>
                  );
                })}
              </div>
              {alreadyAssigned && (
                <p className="text-xs text-destructive">
                  Este atendente já é o responsável pela conversa.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{mode === "queue" ? "Fila" : "Conexão"}</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {mode === "queue"
                    ? queues.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.name}
                        </SelectItem>
                      ))
                    : (connections.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label || c.instance_name}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              {mode === "connection" && (connections.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma conexão cadastrada.</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Textarea
              id="obs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contexto para quem vai continuar o atendimento"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={!target || alreadyAssigned || submit.isPending}
          >
            {submit.isPending ? "Transferindo…" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
