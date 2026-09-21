import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  fetchAgentConnections,
  fetchConnections,
  fetchProfiles,
  fetchQueueAgents,
  fetchQueues,
  fetchRoles,
} from "@/lib/central";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMe } from "@/hooks/use-session";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeamUser, updateTeamUser } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Central de Atendimento" },
      {
        name: "description",
        content:
          "Veja quem está disponível para atender e defina quem é administrador da central de atendimento.",
      },
      { property: "og:title", content: "Equipe — Central de Atendimento" },
      { property: "og:description", content: "Atendentes cadastrados e permissões." },
    ],
  }),
  component: EquipePage,
});

const STATUS_LABEL: Record<string, string> = {
  available: "disponível",
  away: "ausente",
  offline: "offline",
};

function EquipePage() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useMe();
  const createUser = useServerFn(createTeamUser);
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    role: "agent" as "admin" | "agent",
    queueIds: [] as string[],
    connectionIds: [] as string[],
  });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const roles = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });
  const queues = useQuery({ queryKey: ["queues"], queryFn: fetchQueues });
  const queueAgents = useQuery({ queryKey: ["queue-agents"], queryFn: fetchQueueAgents });
  const connections = useQuery({ queryKey: ["connections"], queryFn: fetchConnections });
  const agentConnections = useQuery({
    queryKey: ["agent-connections"],
    queryFn: fetchAgentConnections,
  });

  const updateUser = useServerFn(updateTeamUser);
  const [editing, setEditing] = useState<null | {
    userId: string;
    fullName: string;
    username: string;
    phone: string;
    password: string;
    role: "admin" | "agent";
    queueIds: string[];
    connectionIds: string[];
  }>(null);

  const toggleEditQueue = (id: string) =>
    setEditing((e) =>
      e
        ? {
            ...e,
            queueIds: e.queueIds.includes(id)
              ? e.queueIds.filter((q) => q !== id)
              : [...e.queueIds, id],
          }
        : e,
    );

  const toggleEditConnection = (id: string) =>
    setEditing((e) =>
      e
        ? {
            ...e,
            connectionIds: e.connectionIds.includes(id)
              ? e.connectionIds.filter((c) => c !== id)
              : [...e.connectionIds, id],
          }
        : e,
    );

  const saveUser = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await updateUser({ data: editing });
    },
    onSuccess: () => {
      toast.success("Usuário atualizado");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["my-role"] });
      queryClient.invalidateQueries({ queryKey: ["queue-agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent-connections"] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const toggleQueue = (id: string) =>
    setForm((f) => ({
      ...f,
      queueIds: f.queueIds.includes(id)
        ? f.queueIds.filter((q) => q !== id)
        : [...f.queueIds, id],
    }));

  const toggleConnection = (id: string) =>
    setForm((f) => ({
      ...f,
      connectionIds: f.connectionIds.includes(id)
        ? f.connectionIds.filter((c) => c !== id)
        : [...f.connectionIds, id],
    }));

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "agent" }) => {
      const del = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (del.error) throw new Error(del.error.message);
      const ins = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (ins.error) throw new Error(ins.error.message);
    },
    onSuccess: () => {
      toast.success("Permissão atualizada");
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["my-role"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const addUser = useMutation({
    mutationFn: async () => {
      const username = form.username.trim().toLowerCase();
      const email =
        form.email.trim() ||
        `${username.replace(/[^a-z0-9._-]/g, "")}@nxs.local`;
      return createUser({ data: { ...form, username, email } });
    },
    onSuccess: () => {
      toast.success("Usuário cadastrado");
      setForm({
        fullName: "",
        username: "",
        email: "",
        phone: "",
        password: "",
        role: "agent",
        queueIds: [],
        connectionIds: [],
      });
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["queue-agents"] });
      queryClient.invalidateQueries({ queryKey: ["agent-connections"] });
    },
    onError: (e: Error) => toast.error("Não foi possível cadastrar", { description: e.message }),
  });

  const roleOf = (id: string) =>
    (roles.data ?? []).some((r) => r.user_id === id && r.role === "admin") ? "admin" : "agent";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 sm:space-y-6 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Equipe</h1>
        <p className="text-sm text-muted-foreground">
          Todos que criam conta aparecem aqui e podem receber transferências.
        </p>
      </header>

      {isAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addUser.mutate();
          }}
          className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
          <div>
            <h2 className="text-sm font-medium text-foreground">Cadastrar usuário</h2>
            <p className="text-xs text-muted-foreground">
                A pessoa entra com o usuário (ou e-mail) e a senha definidos aqui.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="ex.: joao.silva"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Permissão</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as "admin" | "agent" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Atendente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Filas que vai atender</Label>
            {(queues.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma fila cadastrada ainda. Crie uma fila para poder vincular.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(queues.data ?? []).map((q) => {
                  const active = form.queueIds.includes(q.id);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => toggleQueue(q.id)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {q.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Conexões que vai atender</Label>
            {(connections.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma conexão cadastrada ainda.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(connections.data ?? []).map((c) => {
                  const active = form.connectionIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleConnection(c.id)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {c.label || c.instance_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button type="submit" disabled={addUser.isPending}>
            {addUser.isPending ? "Cadastrando..." : "Cadastrar usuário"}
          </Button>
        </form>
      )}

      <ul className="space-y-2">
        {(profiles.data ?? []).map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {p.full_name || "Sem nome"}
                {p.id === user?.id && " (você)"}
              </p>
              <p className="text-xs text-muted-foreground">
                entrou em {new Date(p.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{STATUS_LABEL[p.status] ?? p.status}</Badge>
              <Select
                value={roleOf(p.id)}
                onValueChange={(v) =>
                  setRole.mutate({ userId: p.id, role: v as "admin" | "agent" })
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="agent">Atendente</SelectItem>
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditing({
                      userId: p.id,
                      fullName: p.full_name ?? "",
                      username: (p as { username?: string }).username ?? "",
                      phone: p.phone ?? "",
                      password: "",
                      role: roleOf(p.id),
                      queueIds: (queueAgents.data ?? [])
                        .filter((qa) => qa.agent_id === p.id)
                        .map((qa) => qa.queue_id),
                      connectionIds: (agentConnections.data ?? [])
                        .filter((ac) => ac.agent_id === p.id)
                        .map((ac) => ac.whatsapp_config_id),
                    })
                  }
                >
                  Editar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Altere o nome, o telefone, a senha, a permissão e as filas deste usuário.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input
                  id="edit-name"
                  value={editing.fullName}
                  onChange={(e) => setEditing({ ...editing, fullName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-username">Usuário</Label>
                <Input
                  id="edit-username"
                  value={editing.username}
                  onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                  placeholder="ex.: joao.silva"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Nova senha</Label>
                <Input
                  id="edit-password"
                  type="password"
                  minLength={6}
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  placeholder="deixe em branco para manter a atual"
                />
              </div>
              <div className="space-y-2">
                <Label>Permissão</Label>
                <Select
                  value={editing.role}
                  onValueChange={(v) => setEditing({ ...editing, role: v as "admin" | "agent" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Atendente</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Filas que vai atender</Label>
                {(queues.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma fila cadastrada ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(queues.data ?? []).map((q) => {
                      const active = editing.queueIds.includes(q.id);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => toggleEditQueue(q.id)}
                          aria-pressed={active}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {q.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Conexões que vai atender</Label>
                {(connections.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma conexão cadastrada ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(connections.data ?? []).map((c) => {
                      const active = editing.connectionIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleEditConnection(c.id)}
                          aria-pressed={active}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {c.label || c.instance_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saveUser.isPending} onClick={() => saveUser.mutate()}>
              {saveUser.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
