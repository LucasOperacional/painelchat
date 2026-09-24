import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
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
        const name = (c.contact?.name ?? "").toLowerCase();
        const phone = c.contact?.phone ?? "";
        return !q || name.includes(q) || phone.includes(q.replace(/\D/g, "") || "§");
      })
      .slice(0, 60);
  }, [convs.data, search]);

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar "{file?.name}" para um contato</DialogTitle>
        </DialogHeader>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem (opcional)" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contato por nome ou número" />
        <div className="max-h-80 overflow-y-auto rounded-md border">
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
      </DialogContent>
    </Dialog>
  );
}
