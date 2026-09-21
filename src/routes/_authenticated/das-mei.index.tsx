import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, ExternalLink, FileText, Landmark, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { enviarDasParaContato } from "@/lib/das-mei.functions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
  DAS_MEI_BUCKET,
  DAS_MEI_FLUXO_KEY,
  DAS_STATUS_LABEL,
  PGMEI_URL,
  competenciaLabel,
  formatBRL,
  formatDate,
  formatDateTime,
  sanitizePdfName,
  validatePdfFile,
  type DasStatus,
} from "@/lib/das-mei";

type DasDoc = {
  id: string;
  nome_original: string;
  storage_path: string;
  competencia: string;
  data_vencimento: string | null;
  valor: number | null;
  status: string;
  tamanho_bytes: number;
  criado_em: string;
};

export const Route = createFileRoute("/_authenticated/das-mei/")({
  head: () => ({
    meta: [
      { title: "DAS MEI — Guias do Simples Nacional" },
      {
        name: "description",
        content:
          "Emita a DAS no portal oficial e guarde as guias em PDF com segurança, com competência, vencimento, valor e situação.",
      },
      { property: "og:title", content: "DAS MEI — Guias do Simples Nacional" },
      {
        property: "og:description",
        content: "Guarde suas guias DAS em PDF com acesso privado e organizado por ano e situação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DasMeiPage,
});

function statusVariant(status: string) {
  if (status === "pago") return "default" as const;
  if (status === "vencido") return "destructive" as const;
  return "secondary" as const;
}

function DasMeiPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [enviarId, setEnviarId] = useState<string | null>(null);
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const docs = useQuery({
    queryKey: ["das-mei-documentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("das_mei_documentos")
        .select(
          "id, nome_original, storage_path, competencia, data_vencimento, valor, status, tamanho_bytes, criado_em",
        )
        .order("criado_em", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as DasDoc[];
    },
  });

  // Volta do portal oficial: pede o PDF baixado, sem abrir o seletor sozinho.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (sessionStorage.getItem(DAS_MEI_FLUXO_KEY) === "true") setModalAberto(true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const emitirDas = useCallback(() => {
    sessionStorage.setItem(DAS_MEI_FLUXO_KEY, "true");
    window.open(PGMEI_URL, "_blank", "noopener,noreferrer");
  }, []);

  const encerrarFluxo = useCallback(() => {
    sessionStorage.removeItem(DAS_MEI_FLUXO_KEY);
    setModalAberto(false);
  }, []);

  const enviar = useMutation({
    mutationFn: async (file: File) => {
      const erro = await validatePdfFile(file);
      if (erro) throw new Error(erro);

      const [{ data: userData }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      const userId = userData.user?.id;
      const token = sessionData.session?.access_token;
      if (!userId || !token) throw new Error("Sessão expirada. Entre novamente.");

      const ano = new Date().getFullYear();
      const path = `${userId}/${ano}/${crypto.randomUUID()}.pdf`;
      const url = `${import.meta.env["VITE_SUPABASE_URL"]}/storage/v1/object/${DAS_MEI_BUCKET}/${path}`;

      setProgresso(0);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string);
        xhr.setRequestHeader("Content-Type", "application/pdf");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgresso(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error("Não foi possível enviar o PDF. Tente novamente."));
        xhr.onerror = () => reject(new Error("Falha de conexão ao enviar o PDF."));
        xhr.send(file);
      });
      setProgresso(100);

      const { data, error } = await supabase
        .from("das_mei_documentos")
        .insert({
          user_id: userId,
          nome_original: sanitizePdfName(file.name),
          storage_path: path,
          tamanho_bytes: file.size,
          status: "pendente",
        })
        .select("id")
        .single();
      if (error) {
        await supabase.storage.from(DAS_MEI_BUCKET).remove([path]);
        throw new Error(error.message);
      }
      return (data as { id: string }).id;
    },
    onSuccess: (id) => {
      setProgresso(null);
      encerrarFluxo();
      toast.success("Guia salva com segurança");
      void queryClient.invalidateQueries({ queryKey: ["das-mei-documentos"] });
      setDetalheId(id);
    },
    onError: (e: Error) => {
      setProgresso(null);
      toast.error("Não foi possível salvar a guia", { description: e.message });
    },
  });

  const remover = useMutation({
    mutationFn: async (doc: DasDoc) => {
      const { error } = await supabase.from("das_mei_documentos").delete().eq("id", doc.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from(DAS_MEI_BUCKET).remove([doc.storage_path]);
    },
    onSuccess: () => {
      toast.success("Guia excluída");
      void queryClient.invalidateQueries({ queryKey: ["das-mei-documentos"] });
    },
    onError: (e: Error) => toast.error("Não foi possível excluir", { description: e.message }),
  });

  async function assinar(path: string, download: boolean) {
    const { data, error } = await supabase.storage
      .from(DAS_MEI_BUCKET)
      .createSignedUrl(path, 60 * 5, download ? { download: true } : undefined);
    if (error || !data?.signedUrl) {
      toast.error("Não foi possível abrir o PDF", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const d of docs.data ?? []) set.add(d.criado_em.slice(0, 4));
    return Array.from(set).sort().reverse();
  }, [docs.data]);

  const lista = (docs.data ?? []).filter(
    (d) =>
      (filtroAno === "todos" || d.criado_em.slice(0, 4) === filtroAno) &&
      (filtroStatus === "todos" || d.status === filtroStatus),
  );

  const detalhe = (docs.data ?? []).find((d) => d.id === detalheId) ?? null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 sm:gap-6 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Landmark className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">DAS MEI</h1>
            <p className="text-sm text-muted-foreground">
              Emita a guia no portal oficial e guarde o PDF aqui, em área privada.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" onClick={emitirDas}>
            <ExternalLink className="size-4" />
            Emitir DAS
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            Enviar PDF
          </Button>
        </div>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) enviar.mutate(file);
        }}
      />

      {progresso !== null ? (
        <div className="max-w-md space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Enviando a guia… {progresso}%</p>
          <Progress value={progresso} />
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Minhas guias DAS</h2>
          <Badge variant="secondary">{lista.length}</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={filtroAno} onValueChange={setFiltroAno}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os anos</SelectItem>
                {anos.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as situações</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          {docs.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhuma guia guardada ainda. Clique em “Emitir DAS” e depois envie o PDF baixado.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-44 flex-1">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => setDetalheId(doc.id)}
                    >
                      {competenciaLabel(doc.competencia)}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">{doc.nome_original}</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Vence {formatDate(doc.data_vencimento)}
                  </div>
                  <div className="text-sm font-medium">{formatBRL(doc.valor)}</div>
                  <Badge variant={statusVariant(doc.status)}>
                    {DAS_STATUS_LABEL[doc.status as DasStatus] ?? doc.status}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    Enviado em {formatDateTime(doc.criado_em)}
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => void assinar(doc.storage_path, false)}
                    >
                      <Eye className="size-4" />
                      Visualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-2"
                      onClick={() => void assinar(doc.storage_path, true)}
                    >
                      <Download className="size-4" />
                      Baixar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-2"
                      onClick={() => setEnviarId(doc.id)}
                    >
                      <Send className="size-4" />
                      Enviar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Excluir guia"
                      onClick={() => {
                        if (window.confirm("Excluir esta guia definitivamente?")) remover.mutate(doc);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Dialog open={modalAberto} onOpenChange={(v) => (v ? setModalAberto(true) : encerrarFluxo())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar DAS no sistema</DialogTitle>
            <DialogDescription>
              Selecione o PDF da DAS que você acabou de baixar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={encerrarFluxo}>
              Fazer isso depois
            </Button>
            <Button
              className="gap-2"
              disabled={enviar.isPending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              Selecionar arquivo PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetalheDialog doc={detalhe} onClose={() => setDetalheId(null)} />

      <EnviarDialog
        doc={(docs.data ?? []).find((d) => d.id === enviarId) ?? null}
        onClose={() => setEnviarId(null)}
      />
    </div>
  );
}

function DetalheDialog({ doc, onClose }: { doc: DasDoc | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [competencia, setCompetencia] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [valor, setValor] = useState("");
  const [status, setStatus] = useState<DasStatus>("pendente");

  useEffect(() => {
    if (!doc) return;
    setCompetencia(doc.competencia ?? "");
    setVencimento(doc.data_vencimento ?? "");
    setValor(doc.valor === null ? "" : String(doc.valor));
    setStatus((doc.status as DasStatus) ?? "pendente");
  }, [doc]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!doc) return;
      const numero = valor.trim() ? Number(valor.replace(",", ".")) : null;
      if (numero !== null && (Number.isNaN(numero) || numero < 0)) {
        throw new Error("Informe um valor válido, como 76,90.");
      }
      const { error } = await supabase
        .from("das_mei_documentos")
        .update({
          competencia: competencia.trim(),
          data_vencimento: vencimento || null,
          valor: numero,
          status,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", doc.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Dados da guia salvos");
      void queryClient.invalidateQueries({ queryKey: ["das-mei-documentos"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  return (
    <Dialog open={!!doc} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dados da guia</DialogTitle>
          <DialogDescription>{doc?.nome_original}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="das-competencia">Competência</Label>
            <Input
              id="das-competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="das-vencimento">Data de vencimento</Label>
            <Input
              id="das-vencimento"
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="das-valor">Valor (R$)</Label>
            <Input
              id="das-valor"
              inputMode="decimal"
              placeholder="76,90"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Situação</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DasStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ContatoSimples = { id: string; name: string; phone: string };

/** Envia a guia em PDF para um contato do WhatsApp. */
function EnviarDialog({ doc, onClose }: { doc: DasDoc | null; onClose: () => void }) {
  const enviarFn = useServerFn(enviarDasParaContato);
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (doc) {
      setBusca("");
      setContatoId("");
      setMensagem(
        `Segue a guia DAS${doc.competencia ? ` da competência ${competenciaLabel(doc.competencia)}` : ""}.`,
      );
    }
  }, [doc]);

  const contatos = useQuery({
    queryKey: ["das-mei-contatos", busca],
    enabled: !!doc,
    queryFn: async () => {
      let q = supabase.from("contacts").select("id, name, phone").order("name").limit(30);
      if (busca.trim()) q = q.or(`name.ilike.%${busca.trim()}%,phone.ilike.%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as ContatoSimples[];
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!doc) return null;
      if (!contatoId) throw new Error("Escolha o contato que vai receber a guia.");
      const res = await enviarFn({
        data: { docId: doc.id, contactId: contatoId, mensagem: mensagem.trim() || undefined },
      });
      if (!res.ok) throw new Error(res.erro);
      return res;
    },
    onSuccess: (res) => {
      toast.success(`Guia enviada para ${res?.contato ?? "o contato"}`);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onClose();
    },
    onError: (e: Error) => toast.error("Não foi possível enviar a guia", { description: e.message }),
  });

  return (
    <Dialog open={!!doc} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar guia para um contato</DialogTitle>
          <DialogDescription>
            A guia vai pelo WhatsApp como PDF e fica registrada na conversa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="das-busca-contato">Buscar contato</Label>
            <Input
              id="das-busca-contato"
              placeholder="Nome ou número"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="das-contato">Contato</Label>
            <Select value={contatoId} onValueChange={setContatoId}>
              <SelectTrigger id="das-contato">
                <SelectValue placeholder={contatos.isLoading ? "Carregando…" : "Escolha o contato"} />
              </SelectTrigger>
              <SelectContent>
                {(contatos.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.phone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contatos.data && contatos.data.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum contato encontrado com essa busca.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="das-mensagem">Mensagem</Label>
            <Textarea
              id="das-mensagem"
              rows={3}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="gap-2"
            disabled={enviar.isPending || !contatoId}
            onClick={() => enviar.mutate()}
          >
            <Send className="size-4" />
            {enviar.isPending ? "Enviando…" : "Enviar pelo WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
