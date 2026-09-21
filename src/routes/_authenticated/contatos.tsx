import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Download, MessageSquarePlus, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  importWhatsappContacts,
  importWhatsappGroups,
  startConversationWithContact,
} from "@/lib/contacts.functions";
import { sendWhatsappMessage } from "@/lib/whatsapp.functions";
import {
  digitsOnly,
  formatBrPhone,
  isGroupJid,
  isRealPhone,
  isWhatsappLid,
} from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/contatos")({
  head: () => ({
    meta: [
      { title: "Contatos — Central de Atendimento" },
      {
        name: "description",
        content:
          "Cadastre contatos manualmente ou importe a lista de contatos direto do WhatsApp conectado.",
      },
      { property: "og:title", content: "Contatos — Central de Atendimento" },
      {
        property: "og:description",
        content: "Cadastro e importação de contatos da central de atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContatosPage,
});

type Contact = {
  id: string;
  name: string;
  phone: string;
  notes: string;
  wa_jid: string | null;
  avatar_url: string | null;
  created_at: string;
};

async function fetchContacts() {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, phone, notes, wa_jid, avatar_url, created_at")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Contact[];
}

type Device = {
  id: string;
  label: string;
  phone: string;
  status: string;
  is_default: boolean;
};

async function fetchDevices() {
  const { data, error } = await supabase
    .from("whatsapp_config")
    .select("id, label, phone, status, is_default")
    .order("is_default", { ascending: false })
    .order("label");
  if (error) throw new Error(error.message);
  return (data ?? []) as Device[];
}

function ContatosPage() {
  const queryClient = useQueryClient();
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: fetchContacts });
  const devices = useQuery({ queryKey: ["whatsapp-devices"], queryFn: fetchDevices });
  const [deviceId, setDeviceId] = useState<string>("");
  const runImport = useServerFn(importWhatsappContacts);
  const runGroupImport = useServerFn(importWhatsappGroups);
  const startConversation = useServerFn(startConversationWithContact);
  const sendMessage = useServerFn(sendWhatsappMessage);
  const navigate = useNavigate();
  const [target, setTarget] = useState<Contact | null>(null);
  const [message, setMessage] = useState("");

  const startChat = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Selecione um contato.");
      const text = message.trim();
      if (!text) throw new Error("Escreva a mensagem que será enviada.");
      const { conversationId } = await startConversation({
        data: { contactId: target.id, whatsappConfigId: deviceId || null },
      });
      await sendMessage({ data: { conversationId, body: text } });
      return conversationId;
    },
    onSuccess: () => {
      toast.success("Mensagem enviada", { description: "O atendimento foi aberto no painel." });
      setTarget(null);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/atendimento" });
    },
    onError: (e: Error) => toast.error("Não foi possível iniciar", { description: e.message }),
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["contacts"] });

  const create = useMutation({
    mutationFn: async () => {
      const digits = digitsOnly(phone);
      if (!name.trim()) throw new Error("Informe o nome do contato.");
      if (digits.length < 10) throw new Error("Informe o telefone com DDD.");
      // Regra: um telefone só pode existir em um contato.
      const duplicate = (contacts.data ?? []).find((c) => digitsOnly(c.phone) === digits);
      if (duplicate) {
        throw new Error(`Este telefone já está cadastrado para ${duplicate.name}.`);
      }
      const { error } = await supabase
        .from("contacts")
        .insert({ name: name.trim(), phone: digits, notes });
      if (error) {
        throw new Error(
          error.code === "23505" || error.message.includes("duplicate")
            ? "Este telefone já está cadastrado em outro contato."
            : error.message,
        );
      }
    },

    onSuccess: () => {
      toast.success("Contato adicionado");
      setName("");
      setPhone("");
      setNotes("");
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Contato removido");
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const importer = useMutation({
    mutationFn: async () => runImport({ data: undefined as never }),
    onSuccess: (result) => {
      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          `${result.imported} novo(s) contato(s) e ${result.updated} atualizado(s) de ${result.total} encontrados.`,
        );
      }
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha na importação", { description: e.message }),
  });

  const groupImporter = useMutation({
    mutationFn: async () => runGroupImport({ data: undefined as never }),
    onSuccess: (result) => {
      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          `${result.imported} novo(s) grupo(s) e ${result.updated} atualizado(s) de ${result.total} encontrados.`,
        );
      }
      invalidate();
    },
    onError: (e: Error) => toast.error("Falha na importação", { description: e.message }),
  });

  const [tab, setTab] = useState<"contatos" | "grupos">("contatos");

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = digitsOnly(search);
    // Só nome + telefone de verdade: IDs internos do WhatsApp (@lid) ficam de fora.
    const all = (contacts.data ?? []).filter(
      (c) => isGroupJid(c.wa_jid) || (!isWhatsappLid(c.wa_jid, c.phone) && isRealPhone(c.phone)),
    );
    const matches = (c: Contact) =>
      !term || c.name.toLowerCase().includes(term) || (digits.length > 0 && c.phone.includes(digits));
    return {
      grupos: all.filter((c) => isGroupJid(c.wa_jid) && matches(c)),
      contatos: all.filter((c) => !isGroupJid(c.wa_jid) && matches(c)),
    };
  }, [contacts.data, search]);

  const visible = tab === "grupos" ? list.grupos : list.contatos;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">
            Adicione contatos manualmente ou traga a lista completa do WhatsApp conectado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => importer.mutate()}
            disabled={importer.isPending}
            variant="outline"
            className="gap-2"
          >
            <Download className="size-4" />
            {importer.isPending ? "Importando..." : "Importar contatos"}
          </Button>
          <Button
            onClick={() => groupImporter.mutate()}
            disabled={groupImporter.isPending}
            variant="outline"
            className="gap-2"
          >
            <Users className="size-4" />
            {groupImporter.isPending ? "Importando..." : "Importar grupos"}
          </Button>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Novo contato</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="contact-name">Nome</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maria Silva"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-phone">Telefone (com DDD)</Label>
            <Input
              id="contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="5511999998888"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-notes">Observações</Label>
            <Textarea
              id="contact-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={1}
              placeholder="Cliente preferencial"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="gap-2">
            <Plus className="size-4" />
            Adicionar contato
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex items-center gap-2">
            <Button
              variant={tab === "contatos" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              onClick={() => setTab("contatos")}
            >
              Contatos <Badge variant="secondary">{list.contatos.length}</Badge>
            </Button>
            <Button
              variant={tab === "grupos" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              onClick={() => setTab("grupos")}
            >
              Grupos <Badge variant="secondary">{list.grupos.length}</Badge>
            </Button>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="pl-8"
            />
          </div>
        </div>

        {contacts.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando contatos...</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {tab === "grupos" ? "Nenhum grupo encontrado." : "Nenhum contato encontrado."}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((contact) => (
              <li key={contact.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt={`Foto de ${contact.name}`}
                      loading="lazy"
                      className="size-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {contact.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isGroupJid(contact.wa_jid) ? "Grupo do WhatsApp" : formatBrPhone(contact.phone)}
                    {contact.notes ? ` · ${contact.notes}` : ""}
                  </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setTarget(contact);
                    setMessage("");
                    const list = devices.data ?? [];
                    const preferred =
                      list.find((d) => d.is_default && d.status === "connected") ??
                      list.find((d) => d.status === "connected") ??
                      list[0];
                    setDeviceId(preferred?.id ?? "");
                  }}
                >
                  <MessageSquarePlus className="size-4" />
                  Iniciar mensagem
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(contact.id)}
                  aria-label={`Remover ${contact.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Iniciar mensagem</DialogTitle>
            <DialogDescription>
              {target ? `${target.name} · ${formatBrPhone(target.phone)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="first-device">Enviar pela conexão</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger id="first-device">
                <SelectValue placeholder="Escolha a conexão" />
              </SelectTrigger>
              <SelectContent>
                {(devices.data ?? []).map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.label}
                    {device.phone ? ` · ${formatBrPhone(device.phone)}` : ""}
                    {device.status === "connected" ? "" : " (desconectado)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(devices.data ?? []).length === 0 && !devices.isLoading && (
              <p className="text-xs text-muted-foreground">
                Nenhuma conexão cadastrada em Administração → Dispositivos.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="first-message">Mensagem</Label>
            <Textarea
              id="first-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Olá! Aqui é da central de atendimento..."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => startChat.mutate()} disabled={startChat.isPending}>
              {startChat.isPending ? "Enviando..." : "Enviar e abrir atendimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
