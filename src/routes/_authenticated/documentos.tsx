import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useDeferredValue } from "react";
import { Download, FileText, FolderDown, Loader2, RefreshCw, Search, Send } from "lucide-react";

import { listSavedDocuments, type SavedDocument } from "@/lib/webviews.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendFileDialog, type DownloadedFile } from "@/components/send-file-dialog";

export const Route = createFileRoute("/_authenticated/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos salvos — Central" },
      {
        name: "description",
        content:
          "Todos os arquivos baixados dentro da central, com site de origem, data e hora, para abrir, baixar ou enviar no WhatsApp.",
      },
      { property: "og:title", content: "Documentos salvos — Central" },
      {
        property: "og:description",
        content: "Arquivos capturados automaticamente ao navegar pelos sites cadastrados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentosSalvosPage,
});

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentosSalvosPage() {
  const listar = useServerFn(listSavedDocuments);
  const [busca, setBusca] = useState("");
  const [arquivo, setArquivo] = useState<DownloadedFile | null>(null);
  const termo = useDeferredValue(busca);

  const lista = useQuery({
    queryKey: ["documentos-salvos", termo.trim()],
    queryFn: () => listar({ data: { search: termo.trim() } }),
    refetchInterval: 60_000,
  });

  const documentos = lista.data ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FolderDown className="size-6 text-primary" /> Documentos salvos
          </h1>
          <p className="text-sm text-muted-foreground">
            Arquivos baixados dentro da central. Abra, baixe ou envie para um contato do atendimento.
          </p>
        </div>
        <Button variant="outline" onClick={() => void lista.refetch()} disabled={lista.isFetching}>
          <RefreshCw className={`size-4 ${lista.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do arquivo"
          className="pl-9"
        />
      </div>

      {lista.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando documentos…
        </p>
      ) : documentos.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            {termo.trim() ? "Nenhum arquivo com esse nome." : "Nenhum documento salvo ainda."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Os arquivos baixados nos sites cadastrados aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {documentos.map((doc: SavedDocument) => (
            <li key={doc.id} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex min-w-0 items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={doc.file_name}>
                    {doc.file_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{doc.site_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {quando(doc.created_at)} · {formatBytes(doc.size_bytes)}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={doc.url} download={doc.file_name} target="_blank" rel="noreferrer" title="Baixar arquivo">
                    <Download className="size-4" /> Baixar
                  </a>
                </Button>
                <Button size="sm" onClick={() => setArquivo({ url: doc.url, name: doc.file_name, mimeType: doc.mime_type })}>
                  <Send className="size-4" /> Enviar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <SendFileDialog file={arquivo} onClose={() => setArquivo(null)} />
    </div>
  );
}
