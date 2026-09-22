import type { ReactNode } from "react";
import { useState, useMemo } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  Plus,
  Search,
  Loader2,
  User,
  Phone,
  MessageSquarePlus,
} from "lucide-react";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { fetchContacts, fetchConnections, type Contact, type WaConnection } from "@/lib/central";
import { startNewAttendance } from "@/lib/contacts.functions";
import { toBrazilPhone, formatBrPhone } from "@/lib/phone";

const TITULOS: Record<string, string> = {
  dashboard: "Dashboard",
  atendimento: "Caixa de entrada",
  kanban: "Kanban",
  contatos: "Contatos",
  filas: "Filas",
  departamentos: "Departamentos",
  equipe: "Equipe",
  processos: "Processos judiciais",
  chatbot: "Automações",
  divulgazap: "DivulgaZap",
  divulgacao: "Divulgação em grupos",
  postagens: "Postagens e Stories",
  chamadas: "Chamadas",
  ia: "IA",
  "das-mei": "DAS MEI",
  nfse: "Emissão de NFS-e",
  banco: "Banco",
  "sistema-api": "Portal da Transparência",
  cobrancas: "Cobranças e acessos",
  estoque: "Estoque de logins",
  consultas: "Consultas",
  webview: "Sites",
  whatsapp: "Dispositivos",
  "api-conexao": "API de conexão",
  monitoramento: "Monitoramento",
  franquias: "Franquias",
  relatorios: "Relatórios",
  backup: "Backup",
  configuracoes: "Configurações",
};

function rotular(segmento: string) {
  return (
    TITULOS[segmento] ||
    segmento.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

function ContactRow({
  contact,
  selected,
  onClick,
}: {
  contact: Contact;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
        selected
          ? "border-primary/40 bg-primary/8 ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-accent/50",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {initials(contact.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {contact.name || contact.phone}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {formatBrPhone(contact.phone)}
        </p>
      </div>
      {selected && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
          ✓
        </span>
      )}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const segmentos = pathname.split("/").filter(Boolean);
  const titulo = segmentos[0] ? rotular(segmentos[0]) : "Operação principal";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const startFn = useServerFn(startNewAttendance);

  const contacts = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
    enabled: dialogOpen,
    staleTime: 60_000,
  });

  const connections = useQuery<WaConnection[]>({
    queryKey: ["connections"],
    queryFn: fetchConnections,
    enabled: dialogOpen,
    staleTime: 60_000,
  });

  const filteredContacts = useMemo(() => {
    const list = contacts.data ?? [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term.replace(/\D/g, "")),
    );
  }, [contacts.data, search]);

  const selectedConnection = useMemo(() => {
    const list = connections.data ?? [];
    if (connectionId) return list.find((c) => c.id === connectionId) || null;
    return list.find((c) => c.is_default) || list[0] || null;
  }, [connections.data, connectionId]);

  const canUseNewNumber = useMemo(() => {
    return !!toBrazilPhone(search);
  }, [search]);

  const mutation = useMutation({
    mutationFn: async (payload: {
      phone: string;
      name?: string | null;
      whatsappConfigId?: string | null;
    }) => {
      return startFn({ data: payload });
    },
    onSuccess: ({ conversationId }) => {
      setDialogOpen(false);
      setSearch("");
      setSelectedContact(null);
      setNewName("");
      toast.success("Atendimento iniciado");
      navigate({
        to: "/atendimento",
        search: { conversation: conversationId },
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível iniciar o atendimento.");
    },
  });

  function handleStart() {
    if (selectedContact) {
      mutation.mutate({
        phone: selectedContact.phone,
        name: selectedContact.name || null,
        whatsappConfigId: selectedConnection?.id ?? null,
      });
      return;
    }

    if (canUseNewNumber) {
      mutation.mutate({
        phone: search,
        name: newName.trim() || null,
        whatsappConfigId: selectedConnection?.id ?? null,
      });
    }
  }



  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "15.25rem",
          "--sidebar-width-icon": "3.25rem",
        } as React.CSSProperties
      }
    >
      <div className="flex min-h-svh w-full overflow-x-hidden bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 grid h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:gap-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {titulo}
                </p>
                <nav className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                  <span>Operação principal</span>
                  {segmentos.slice(0, 2).map((s) => (
                    <span key={s} className="flex items-center gap-1">
                      <ChevronRight className="size-3 shrink-0" />
                      <span className="truncate">{rotular(s)}</span>
                    </span>
                  ))}
                </nav>
              </div>
            </div>

            <div className="hidden min-w-0 justify-center md:flex">
              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar conversas, contatos…"
                  className="h-9 rounded-xl border-border/70 bg-secondary/60 pl-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate({ to: "/atendimento" });
                  }}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <NotificationBell />
              <ThemeToggle variant="icon" />
              <Button
                size="sm"
                className="h-9 rounded-xl bg-primary px-3 text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Novo atendimento</span>
              </Button>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="size-5 text-primary" />
              Iniciar novo atendimento
            </DialogTitle>
            <DialogDescription>
              Escolha um contato existente ou digite um número novo para abrir
              um atendimento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="contact-search">Buscar contato</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="contact-search"
                  placeholder="Nome ou telefone…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedContact(null);
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            {contacts.isLoading && dialogOpen && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Carregando contatos…
              </div>
            )}

            {!contacts.isLoading && filteredContacts.length > 0 && (
              <div className="grid gap-1.5">
                <Label>Contatos</Label>
                <ScrollArea className="h-56 rounded-md border border-border p-2">
                  <div className="grid gap-2 pr-2">
                    {filteredContacts.map((contact) => (
                      <ContactRow
                        key={contact.id}
                        contact={contact}
                        selected={selectedContact?.id === contact.id}
                        onClick={() => {
                          setSelectedContact(contact);
                          setSearch(contact.name || formatBrPhone(contact.phone));
                        }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {!contacts.isLoading && filteredContacts.length === 0 && search.trim() && (
              <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center">
                <Phone className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-sm text-foreground">
                  Nenhum contato encontrado
                </p>
                {canUseNewNumber ? (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-muted-foreground">
                      Deseja iniciar com{" "}
                      <strong>{formatBrPhone(toBrazilPhone(search) ?? "")}</strong>?
                    </p>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Nome do contato (opcional)"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Digite um número válido do Brasil para iniciar.
                  </p>
                )}
              </div>
            )}

            {(connections.data?.length ?? 0) > 1 && (
              <div className="grid gap-1.5">
                <Label>Conexão WhatsApp</Label>
                <Select
                  value={selectedConnection?.id ?? ""}
                  onValueChange={setConnectionId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma conexão" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.data?.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.label || conn.instance_name || conn.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleStart}
              disabled={
                mutation.isPending ||
                (!selectedContact && !canUseNewNumber)
              }
            >
              {mutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Iniciar atendimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
