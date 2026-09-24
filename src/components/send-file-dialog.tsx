import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { fetchConversations } from "@/lib/central";
import { sendWhatsappMessage } from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DownloadedFile = { url: string; name: string; mimeType: string };

export function SendFileDialog({
  file,
  onClose,
}: {
  file: DownloadedFile | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [text, setText] = useState("Segue a nota fiscal.");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);
  const isPdf = !!file && (file.mimeType.includes("pdf") || /\.pdf$/i.test(file.name));
  const send = useServerFn(sendWhatsappMessage);

  const convs = useQuery({
    queryKey: ["send-file-conversations"],
    queryFn: () => fetchConversations(),
    enabled: !!file,
  });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const seen = new Set<string>();
    return (convs.data ?? [])
      .filter((c) => {
        const key = c.contact_id;
        if (seen.has(key)) return false;
        seen.add(key);
        if (onlyActive && (c as { status?: string }).status === "closed") return false;
        const name = (c.contact?.name ?? "").toLowerCase();
        const phone = c.contact?.phone ?? "";
        return !q || name.includes(q) || phone.includes(q.replace(/\D/g, "") || "§");
      })
      .slice(0, 60);
  }, [convs.data, search, onlyActive]);

  const doSend = async (conversationId: string, name: string) => {
    if (!file) return;
    setSendingId(conversationId);
    try {
      await send({
        data: {
          conversationId,
          body: text,
          attachments: [{ url: file.url, name: file.name, mimeType: file.mimeType }],
        },
      });
      toast.success(`Nota enviada para ${name}`);
      onClose();
    } catch (e) {
      toast.error("Não foi possível enviar", { description: (e as Error).message });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={isPdf ? "max-w-6xl w-[95vw]" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>Arquivo baixado</DialogTitle>
        </DialogHeader>
        <div className={isPdf ? "grid gap-4 md:grid-cols-[1fr_360px]" : ""}>
        {isPdf && (
          <iframe
            title="Leitor de PDF"
            src={`${file!.url}#toolbar=1&view=FitH`}
            className="h-[70vh] w-full rounded-md border bg-muted"
          />
        )}
        <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
          <FileText className="size-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file?.name}</p>
            <p className="text-xs text-muted-foreground">{file?.mimeType}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={file?.url} download={file?.name} target="_blank" rel="noreferrer">
              <Download className="size-4" /> Baixar
            </a>
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Enviar para um contato:</p>
          <div className="flex gap-1">
            <Button size="sm" variant={onlyActive ? "default" : "outline"} onClick={() => setOnlyActive(true)}>Em atendimento</Button>
            <Button size="sm" variant={!onlyActive ? "default" : "outline"} onClick={() => setOnlyActive(false)}>Todos</Button>
          </div>
        </div>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem (opcional)" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contato por nome ou número" />
        <div className={(isPdf ? "max-h-[45vh]" : "max-h-80") + " overflow-y-auto rounded-md border"}>
          {convs.isLoading ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando contatos…
            </p>
          ) : list.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
          ) : (
            <ul className="divide-y">
              {list.map((c) => {
                const name = c.contact?.name || c.contact?.phone || "Contato";
                return (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{c.contact?.phone}</p>
                    </div>
                    <Button size="sm" disabled={!!sendingId} onClick={() => void doSend(c.id, name)}>
                      {sendingId === c.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      Enviar
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
