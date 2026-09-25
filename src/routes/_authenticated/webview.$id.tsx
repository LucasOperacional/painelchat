import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, Loader2, RefreshCw, Send } from "lucide-react";

import {
  listWebviewDocuments,
  listWebviews,
  type WebviewDocument,
  type WebviewSite,
} from "@/lib/webviews.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SendFileDialog, type DownloadedFile } from "@/components/send-file-dialog";

export const Route = createFileRoute("/_authenticated/webview/$id")({
  head: () => ({
    meta: [
      { title: "Site aberto na central — Webview" },
      {
        name: "description",
        content: "Abra o site cadastrado dentro da central, sem precisar trocar de janela.",
      },
      { property: "og:title", content: "Site aberto na central — Webview" },
      {
        property: "og:description",
        content: "Sistema externo carregado dentro da central de atendimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WebviewFramePage,
});

function WebviewFramePage() {
  const { id } = Route.useParams();
  const fetchSites = useServerFn(listWebviews);
  const fetchDocuments = useServerFn(listWebviewDocuments);
  const [reloadKey, setReloadKey] = useState(0);
  const [downloaded, setDownloaded] = useState<DownloadedFile | null>(null);
  const documents = useQuery({
    queryKey: ["webview-documents", id],
    queryFn: () => fetchDocuments({ data: { webviewId: id } }),
  });

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; url?: string; name?: string; mimeType?: string };
      if (d?.type === "webview-download" && d.url && d.name) {
        setDownloaded({ url: d.url, name: d.name, mimeType: d.mimeType ?? "application/pdf" });
        void documents.refetch();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [documents.refetch]);

  const sites = useQuery({ queryKey: ["webviews"], queryFn: () => fetchSites() });
  const site = (sites.data ?? []).find((s: WebviewSite) => s.id === id);

  if (sites.isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground sm:p-6">
        <Loader2 className="size-4 animate-spin" /> Carregando…
      </div>
    );
  }

  if (!site) {
    return (
      <div className="space-y-3 p-3 sm:p-6">
        <p className="text-sm text-muted-foreground">Esse site não está mais cadastrado.</p>
        <Button asChild variant="outline">
          <Link to="/webview">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Button asChild size="sm" variant="ghost">
          <Link to="/webview">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
        </Button>
        <span className="truncate text-sm font-medium">{site.title}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            <RefreshCw className="size-4" /> Recarregar
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={site.url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" /> Nova aba
            </a>
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <iframe
          key={reloadKey}
          src={site.use_proxy ? `/api/public/webview-proxy?id=${site.id}` : site.url}
          title={site.title}
          className="h-full min-h-[55vh] w-full bg-background"
          referrerPolicy="same-origin"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
        />
        <Card className="m-3 min-h-0 overflow-hidden lg:ml-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4" /> Documentos salvos
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto p-0 lg:max-h-none lg:h-[calc(100%-49px)]">
            {documents.isLoading ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando…
              </p>
            ) : (documents.data ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Os arquivos baixados aparecerão aqui automaticamente.</p>
            ) : (
              <ul className="divide-y">
                {(documents.data ?? []).map((doc: WebviewDocument) => (
                  <li key={doc.id} className="space-y-2 p-3">
                    <Button
                      variant="ghost"
                      className="h-auto w-full justify-start p-0 text-left"
                      onClick={() => setDownloaded({ url: doc.url, name: doc.file_name, mimeType: doc.mime_type })}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{doc.file_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(doc.created_at).toLocaleString("pt-BR")} · {formatBytes(doc.size_bytes)}
                        </span>
                      </span>
                    </Button>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline" title="Baixar documento">
                        <a href={doc.url} download={doc.file_name} target="_blank" rel="noreferrer">
                          <Download className="size-4" /> Baixar
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setDownloaded({ url: doc.url, name: doc.file_name, mimeType: doc.mime_type })}
                      >
                        <Send className="size-4" /> Enviar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {site.use_proxy
          ? "Este site abre pelo proxy da central, que remove o bloqueio de exibição. Se ainda assim falhar, use \"Nova aba\"."
          : "Se a página ficar em branco, ative o proxy na edição do site ou use \"Nova aba\"."}
      </p>
      <SendFileDialog file={downloaded} onClose={() => setDownloaded(null)} />
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
