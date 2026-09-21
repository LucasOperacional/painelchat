import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Landmark,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const PGMEI_URL =
  "https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao";


const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

type MeiClient = {
  id: string;
  name: string;
  cnpj: string | null;
  notes: string | null;
};

type MeiDas = {
  id: string;
  client_id: string;
  competencia: string;
  status: string;
  paid_at: string | null;
  file_path: string | null;
  file_name: string | null;
};

function currentCompetencia() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function competenciaOptions() {
  const out: string[] = [];
  const now = new Date();
  for (let i = -12; i <= 2; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out.reverse();
}

function labelCompetencia(value: string) {
  const [year, month] = value.split("-");
  const idx = Number(month) - 1;
  return `${MESES[idx] ?? month}/${year}`;
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCnpj(value: string | null) {
  const d = onlyDigits(value ?? "");
  if (d.length !== 14) return value ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export const Route = createFileRoute("/_authenticated/contabilidade")({
  head: () => ({
    meta: [
      { title: "Contabilidade — Controle de DAS do MEI" },
      {
        name: "description",
        content:
          "Controle mensal do DAS de cada MEI: status pago ou pendente, guias em PDF e acesso ao PGMEI da Receita Federal.",
      },
      { property: "og:title", content: "Contabilidade — Controle de DAS do MEI" },
      {
        property: "og:description",
        content:
          "Controle mensal do DAS de cada MEI: status pago ou pendente, guias em PDF e acesso ao PGMEI da Receita Federal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContabilidadePage,
});

function ContabilidadePage() {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState(currentCompetencia);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const clients = useQuery({
    queryKey: ["mei-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mei_clients")
        .select("id, name, cnpj, notes")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as MeiClient[];
    },
  });

  const das = useQuery({
    queryKey: ["mei-das", competencia],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mei_das")
        .select("id, client_id, competencia, status, paid_at, file_path, file_name")
        .eq("competencia", competencia);
      if (error) throw new Error(error.message);
      return (data ?? []) as MeiDas[];
    },
  });

  const byClient = useMemo(() => {
    const map = new Map<string, MeiDas>();
    for (const row of das.data ?? []) map.set(row.client_id, row);
    return map;
  }, [das.data]);

  const pagos = (das.data ?? []).filter((d) => d.status === "pago").length;
  const total = clients.data?.length ?? 0;

  const addClient = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (!clean) throw new Error("Informe o nome do MEI.");
      const { error } = await supabase
        .from("mei_clients")
        .insert({ name: clean, cnpj: onlyDigits(cnpj) || null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setName("");
      setCnpj("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["mei-clients"] });
      toast.success("MEI cadastrado");
    },
    onError: (e: Error) => toast.error("Não foi possível cadastrar", { description: e.message }),
  });

  const removeClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mei_clients").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mei-clients"] });
      void queryClient.invalidateQueries({ queryKey: ["mei-das"] });
      toast.success("MEI removido");
    },
    onError: (e: Error) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const saveDas = useMutation({
    mutationFn: async (input: {
      clientId: string;
      status?: string;
      filePath?: string | null;
      fileName?: string | null;
    }) => {
      const existing = byClient.get(input.clientId);
      const status = input.status ?? existing?.status ?? "pendente";
      const payload = {
        client_id: input.clientId,
        competencia,
        status,
        paid_at: status === "pago" ? new Date().toISOString().slice(0, 10) : null,
        file_path: input.filePath !== undefined ? input.filePath : (existing?.file_path ?? null),
        file_name: input.fileName !== undefined ? input.fileName : (existing?.file_name ?? null),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("mei_das")
        .upsert(payload, { onConflict: "client_id,competencia" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["mei-das", competencia] });
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const uploadGuia = useMutation({
    mutationFn: async (input: { clientId: string; file: File }) => {
      const { file, clientId } = input;
      if (file.size > 20 * 1024 * 1024) throw new Error("O arquivo passa de 20 MB.");
      const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `mei/${clientId}/${competencia}-${crypto.randomUUID()}.${ext || "pdf"}`;
      const { error } = await supabase.storage.from("anexos").upload(path, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
      if (error) throw new Error(error.message);
      await saveDas.mutateAsync({ clientId, filePath: path, fileName: file.name });
    },
    onSuccess: () => toast.success("Guia anexada"),
    onError: (e: Error) => toast.error("Erro ao anexar a guia", { description: e.message }),
  });

  const openGuia = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("anexos")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir a guia", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 sm:gap-6 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Landmark className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Contabilidade</h1>
            <p className="text-sm text-muted-foreground">
              Controle do DAS de cada MEI, mês a mês, com as guias em PDF.
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-xl">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Landmark className="size-5" />
            </span>
            <div>
              <h2 className="font-semibold">PGMEI — Simples Nacional</h2>
              <p className="text-xs text-muted-foreground">
                Receita Federal · emissão do DAS do MEI
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Gere a guia do DAS de cada MEI, volte aqui, marque como paga e guarde o PDF no
            cliente correspondente.
          </p>
          <div className="mt-auto">
            <a
              href={PGMEI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ExternalLink className="size-4" />
              Abrir o PGMEI
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Competência</Label>
          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {competenciaOptions().map((c) => (
                <SelectItem key={c} value={c}>
                  {labelCompetencia(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Badge variant="secondary" className="gap-1">
          {pagos} de {total} pagos
        </Badge>

        <div className="ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="size-4" />
                Novo MEI
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar MEI</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mei-nome">Nome</Label>
                  <Input
                    id="mei-nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do cliente"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mei-cnpj">CNPJ (opcional)</Label>
                  <Input
                    id="mei-cnpj"
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => addClient.mutate()}
                  disabled={addClient.isPending}
                >
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {clients.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : (clients.data?.length ?? 0) === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhum MEI cadastrado ainda. Clique em “Novo MEI” para começar.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {clients.data!.map((client) => {
              const row = byClient.get(client.id);
              const pago = row?.status === "pago";
              return (
                <li
                  key={client.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">{client.name}</p>
                    {client.cnpj ? (
                      <p className="text-xs text-muted-foreground">
                        {formatCnpj(client.cnpj)}
                      </p>
                    ) : null}
                  </div>

                  <Badge
                    variant={pago ? "default" : "secondary"}
                    className="gap-1"
                  >
                    {pago ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <Clock className="size-3.5" />
                    )}
                    {pago ? "DAS pago" : "Pendente"}
                  </Badge>

                  <Button
                    size="sm"
                    variant={pago ? "outline" : "default"}
                    onClick={() =>
                      saveDas.mutate({
                        clientId: client.id,
                        status: pago ? "pendente" : "pago",
                      })
                    }
                  >
                    {pago ? "Marcar pendente" : "Marcar como pago"}
                  </Button>

                  {row?.file_path ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void openGuia(row.file_path!)}
                    >
                      <FileText className="size-4" />
                      Ver guia
                    </Button>
                  ) : null}

                  <input
                    ref={(el) => {
                      uploadRefs.current[client.id] = el;
                    }}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) uploadGuia.mutate({ clientId: client.id, file });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-2"
                    onClick={() => uploadRefs.current[client.id]?.click()}
                  >
                    <Upload className="size-4" />
                    {row?.file_path ? "Trocar PDF" : "Anexar PDF"}
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover ${client.name}`}
                    onClick={() => removeClient.mutate(client.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
