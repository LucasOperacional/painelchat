import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Phone } from "lucide-react";

import {
  claimConversation,
  closeConversation,
  fetchConversations,
  fetchProfiles,
  type Conversation,
  type ConversationStatus,
} from "@/lib/central";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-session";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({
    meta: [
      { title: "Kanban — Central de Atendimento" },
      {
        name: "description",
        content:
          "Acompanhe os atendimentos do WhatsApp em um quadro kanban e arraste as conversas entre aguardando, em atendimento e encerradas.",
      },
      { property: "og:title", content: "Kanban — Central de Atendimento" },
      {
        property: "og:description",
        content: "Quadro visual dos atendimentos por etapa, com arrastar e soltar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KanbanPage,
});

const COLUMNS: { status: ConversationStatus; label: string; hint: string }[] = [
  { status: "waiting", label: "Aguardando", hint: "Sem atendente" },
  { status: "open", label: "Em atendimento", hint: "Com atendente" },
  { status: "closed", label: "Encerradas", hint: "Finalizadas" },
];

function KanbanPage() {
  const { user } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<ConversationStatus | null>(null);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
    refetchInterval: 180_000,
  });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });


  const nameOf = (id: string | null) =>
    id ? (profiles.data ?? []).find((p) => p.id === id)?.full_name || "Atendente" : null;

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ConversationStatus }) => {
      if (!user) throw new Error("Sessão expirada");
      if (status === "open") {
        await claimConversation(id, user.id);
        return;
      }
      if (status === "closed") {
        await closeConversation(id);
        return;
      }
      const { error } = await supabase
        .from("conversations")
        .update({ status: "waiting", assigned_to: null, closed_at: null })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error("Não foi possível mover", { description: e.message }),
  });

  function drop(status: ConversationStatus) {
    setOver(null);
    const id = dragging;
    setDragging(null);
    if (!id) return;
    const current = (conversations.data ?? []).find((c) => c.id === id);
    if (!current || current.status === status) return;
    move.mutate({ id, status });
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Kanban</h1>
        <p className="text-sm text-muted-foreground">
          Arraste um cartão para mudar a etapa do atendimento. Clique no cartão para abrir a
          conversa.
        </p>
      </header>

      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-3 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-1 sm:px-0 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const cards = (conversations.data ?? []).filter((c) => c.status === column.status);
          return (
            <section
              key={column.status}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(column.status);
              }}
              onDragLeave={() => setOver((s) => (s === column.status ? null : s))}
              onDrop={() => drop(column.status)}
              className={cn(
                "flex min-h-64 w-[calc(100vw-2rem)] shrink-0 snap-center flex-col rounded-xl border border-border bg-muted/30 p-3 transition-colors sm:w-auto",
                over === column.status && "border-primary bg-primary/5",
              )}
            >
              <div className="mb-3 flex items-baseline justify-between px-1">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{column.label}</h2>
                  <p className="text-xs text-muted-foreground">{column.hint}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{cards.length}</span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {cards.map((c: Conversation) => (
                  <article
                    key={c.id}
                    draggable
                    onDragStart={() => setDragging(c.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onClick={() => navigate({ to: "/atendimento" })}
                    className={cn(
                      "cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-opacity active:cursor-grabbing",
                      dragging === c.id && "opacity-50",
                    )}
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.contact?.name ?? "Contato"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="size-3" />
                      {c.contact?.phone ?? ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {c.department && <Badge variant="secondary">{c.department.name}</Badge>}
                      {c.queue && <Badge variant="outline">{c.queue.name}</Badge>}
                      {nameOf(c.assigned_to) && (
                        <Badge variant="outline">{nameOf(c.assigned_to)}</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      atualizado em{" "}
                      {new Date(c.last_message_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </article>
                ))}
                {cards.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Solte um cartão aqui
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
