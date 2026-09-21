import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { fetchDepartments, fetchProfiles, fetchQueueAgents, fetchQueues } from "@/lib/central";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/filas")({
  head: () => ({
    meta: [
      { title: "Filas de atendimento — Central" },
      {
        name: "description",
        content:
          "Crie filas de atendimento, defina prioridade, saudação e vincule os atendentes responsáveis.",
      },
      { property: "og:title", content: "Filas de atendimento — Central" },
      { property: "og:description", content: "Cadastro de filas e atendentes vinculados." },
    ],
  }),
  component: FilasPage,
});

function FilasPage() {
  const queryClient = useQueryClient();
  const queues = useQuery({ queryKey: ["queues"], queryFn: fetchQueues });
  const departments = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const links = useQuery({ queryKey: ["queue-agents"], queryFn: fetchQueueAgents });

  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [greeting, setGreeting] = useState("");
  const [priority, setPriority] = useState("1");
  const [color, setColor] = useState("#0ea5e9");

  // Edição de uma fila existente.
  type QueueRow = NonNullable<typeof queues.data>[number];
  const [editing, setEditing] = useState<QueueRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editGreeting, setEditGreeting] = useState("");
  const [editPriority, setEditPriority] = useState("1");
  const [editColor, setEditColor] = useState("#0ea5e9");
  const [editActive, setEditActive] = useState(true);

  const openEdit = (q: QueueRow) => {
    setEditing(q);
    setEditName(q.name);
    setEditDepartmentId(q.department_id ?? "");
    setEditGreeting(q.greeting ?? "");
    setEditPriority(String(q.priority ?? 1));
    setEditColor(q.color ?? "#0ea5e9");
    setEditActive(q.is_active ?? true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["queues"] });
    queryClient.invalidateQueries({ queryKey: ["queue-agents"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("queues").insert({
        name,
        department_id: departmentId || null,
        greeting,
        priority: Number(priority) || 1,
        color,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Fila criada");
      setName("");
      setGreeting("");
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("queues").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Fila removida");
      invalidate();
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("queues")
        .update({
          name: editName.trim(),
          department_id: editDepartmentId || null,
          greeting: editGreeting,
          priority: Number(editPriority) || 1,
          color: editColor,
          is_active: editActive,
        })
        .eq("id", editing.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Fila atualizada");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const addAgent = useMutation({
    mutationFn: async ({ queueId, agentId }: { queueId: string; agentId: string }) => {
      const { error } = await supabase
        .from("queue_agents")
        .insert({ queue_id: queueId, agent_id: agentId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const removeAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("queue_agents").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const setQueueColor = useMutation({
    mutationFn: async ({ id, newColor }: { id: string; newColor: string }) => {
      const { error } = await supabase.from("queues").update({ color: newColor }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Cor atualizada");
      invalidate();
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const agentName = (id: string) =>
    (profiles.data ?? []).find((p) => p.id === id)?.full_name ?? "Atendente";

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-3 sm:space-y-8 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Filas</h1>
        <p className="text-sm text-muted-foreground">
          Cada conversa nova entra em uma fila e aguarda até um atendente assumir.
        </p>
      </header>

      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="fila-nome">Nome</Label>
          <Input
            id="fila-nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Suporte N1"
          />
        </div>
        <div className="space-y-2">
          <Label>Departamento</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(departments.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fila-prio">Prioridade</Label>
          <Input
            id="fila-prio"
            type="number"
            min={1}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fila-cor">Cor da fila</Label>
          <div className="flex items-center gap-2">
            <input
              id="fila-cor"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded-md border border-border bg-card p-1"
            />
            <span className="text-xs text-muted-foreground">{color}</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fila-saud">Mensagem de saudação</Label>
          <Input
            id="fila-saud"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Olá! Como podemos ajudar?"
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="mr-1.5 size-4" /> Adicionar fila
          </Button>
        </div>
      </form>

      <ul className="space-y-3">
        {(queues.data ?? []).map((q) => {
          const queueLinks = (links.data ?? []).filter((l) => l.queue_id === q.id);
          const available = (profiles.data ?? []).filter(
            (p) => !queueLinks.some((l) => l.agent_id === p.id),
          );
          return (
            <li key={q.id} className="space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <label
                    className="relative block size-5 shrink-0 cursor-pointer rounded-full border border-border"
                    style={{ backgroundColor: q.color }}
                    title="Alterar cor da fila"
                  >
                    <input
                      type="color"
                      value={q.color}
                      onChange={(e) =>
                        setQueueColor.mutate({ id: q.id, newColor: e.target.value })
                      }
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                      aria-label={`Cor da fila ${q.name}`}
                    />
                  </label>
                  <div>
                    <p className="text-sm font-medium text-foreground">{q.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(departments.data ?? []).find((d) => d.id === q.department_id)?.name ??
                        "sem departamento"}{" "}
                      · prioridade {q.priority}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {q.is_active === false && (
                    <Badge variant="outline" className="text-xs">
                      inativa
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(q)}
                    aria-label={`Editar fila ${q.name}`}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => remove.mutate(q.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              {q.greeting && <p className="text-xs text-muted-foreground">“{q.greeting}”</p>}
              <div className="flex flex-wrap items-center gap-2">
                {queueLinks.map((l) => (
                  <Badge key={l.id} variant="secondary" className="gap-1">
                    {agentName(l.agent_id)}
                    <button onClick={() => removeAgent.mutate(l.id)} aria-label="Remover">
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                {available.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(agentId) => addAgent.mutate({ queueId: q.id, agentId })}
                  >
                    <SelectTrigger className="h-8 w-48">
                      <SelectValue placeholder="Vincular atendente" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar fila</DialogTitle>
            <DialogDescription>Altere os dados desta fila de atendimento.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome</Label>
              <Input
                id="edit-nome"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select
                value={editDepartmentId || "none"}
                onValueChange={(v) => setEditDepartmentId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem departamento</SelectItem>
                  {(departments.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-prio">Prioridade</Label>
                <Input
                  id="edit-prio"
                  type="number"
                  min={1}
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cor">Cor da fila</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="edit-cor"
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded-md border border-border bg-card p-1"
                  />
                  <span className="text-xs text-muted-foreground">{editColor}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-saud">Mensagem de saudação</Label>
              <Input
                id="edit-saud"
                value={editGreeting}
                onChange={(e) => setEditGreeting(e.target.value)}
                placeholder="Olá! Como podemos ajudar?"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Fila ativa</p>
                <p className="text-xs text-muted-foreground">
                  Filas inativas não recebem novas conversas.
                </p>
              </div>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={update.isPending}>
                Salvar alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
