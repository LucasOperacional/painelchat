import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { fetchDepartments, type Department } from "@/lib/central";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/departamentos")({
  head: () => ({
    meta: [
      { title: "Departamentos — Central de Atendimento" },
      {
        name: "description",
        content: "Cadastre e organize os departamentos que recebem os atendimentos da equipe.",
      },
      { property: "og:title", content: "Departamentos — Central de Atendimento" },
      { property: "og:description", content: "Cadastro de departamentos da central." },
    ],
  }),
  component: DepartamentosPage,
});

const COLORS = ["#0f766e", "#1d4ed8", "#b45309", "#be123c", "#6d28d9", "#15803d"];

function DepartamentosPage() {
  const queryClient = useQueryClient();
  const departments = useQuery({ queryKey: ["departments"], queryFn: fetchDepartments });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [editing, setEditing] = useState<Department | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState(COLORS[0]!);

  const openEdit = (d: Department) => {
    setEditing(d);
    setEditName(d.name);
    setEditDescription(d.description ?? "");
    setEditColor(d.color || COLORS[0]!);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["departments"] });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("departments")
        .insert({ name, description, color });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Departamento criado");
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("departments")
        .update({ is_active: value })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("departments")
        .update({ name: editName, description: editDescription, color: editColor })
        .eq("id", editing.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Departamento atualizado");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Departamento removido");
      invalidate();
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-3 sm:space-y-8 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Departamentos</h1>
        <p className="text-sm text-muted-foreground">
          Agrupe as filas por área da empresa. Somente administradores podem alterar.
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
          <Label htmlFor="dept-nome">Nome</Label>
          <Input
            id="dept-nome"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Suporte"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dept-desc">Descrição</Label>
          <Input
            id="dept-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Atendimento técnico"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Cor</Label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                className="size-7 rounded-full border-2"
                style={{ backgroundColor: c, borderColor: color === c ? "currentColor" : c }}
              />
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            <Plus className="mr-1.5 size-4" /> Adicionar departamento
          </Button>
        </div>
      </form>

      <ul className="space-y-2">
        {(departments.data ?? []).map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">{d.description || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={d.is_active ? "secondary" : "outline"}>
                {d.is_active ? "ativo" : "inativo"}
              </Badge>
              <Switch
                checked={d.is_active}
                onCheckedChange={(v) => toggle.mutate({ id: d.id, value: v })}
              />
              <Button variant="ghost" size="icon" onClick={() => openEdit(d)} aria-label="Editar departamento">
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove.mutate(d.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar departamento</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-dept-nome">Nome</Label>
              <Input
                id="edit-dept-nome"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dept-desc">Descrição</Label>
              <Input
                id="edit-dept-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    aria-label={`Cor ${c}`}
                    className="size-7 rounded-full border-2"
                    style={{ backgroundColor: c, borderColor: editColor === c ? "currentColor" : c }}
                  />
                ))}
              </div>
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
