import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";

import { listWebviews, type WebviewSite } from "@/lib/webviews.functions";
import { Button } from "@/components/ui/button";
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
  const [reloadKey, setReloadKey] = useState(0);
  const [downloaded, setDownloaded] = useState<DownloadedFile | null>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; url?: string; name?: string; mimeType?: string };
      if (d?.type === "webview-download" && d.url && d.name) {
        setDownloaded({ url: d.url, name: d.name, mimeType: d.mimeType ?? "application/pdf" });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

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
      <iframe
        key={reloadKey}
        src={site.use_proxy ? `/api/public/webview-proxy?id=${site.id}` : site.url}
        title={site.title}
        className="min-h-0 flex-1 w-full bg-background"
        referrerPolicy="no-referrer"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals"
      />
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {site.use_proxy
          ? "Este site abre pelo proxy da central, que remove o bloqueio de exibição. Se ainda assim falhar, use \"Nova aba\"."
          : "Se a página ficar em branco, ative o proxy na edição do site ou use \"Nova aba\"."}
      </p>
      <SendFileDialog file={downloaded} onClose={() => setDownloaded(null)} />
    </div>
  );
}
