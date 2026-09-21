import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ContactRound,
  Download,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChatAudioPlayer } from "@/components/chat-audio-player";
import { saveReceivedSticker } from "@/lib/stickers.functions";
import { cn } from "@/lib/utils";

type Attachment = { name: string; url: string };

const ATTACH_RE = /📎\s*(.+?):\s*(https?:\/\/\S+)/g;
const CONTACT_RE = /👤\s*Contato:\s*([^\n]+)\n📞\s*(\+?[\d\s().-]+)/g;
const AUDIO_RE = /🎵\s*(?:Áudio|Audio):\s*(https?:\/\/\S+)/g;
const IMAGE_RE = /🖼\s*(Figurinha|Imagem):\s*(https?:\/\/\S+)/g;
const VIDEO_RE = /🎬\s*(?:Vídeo|Video):\s*(https?:\/\/\S+)/g;
const LOCATION_RE =
  /📍\s*Localização:\s*([^\n]+)(?:\n(?!https?:\/\/)([^\n]+))?\n(https?:\/\/\S+)/g;

type SharedContact = { name: string; phone: string };
type Visual = { url: string; sticker: boolean };
type SharedLocation = { name: string; address: string | null; url: string };

export type GroupMessageParticipant = {
  label: string;
  name: string;
  phone: string | null;
  body: string;
};

export function parseGroupMessage(body: string): GroupMessageParticipant | null {
  const match = body.match(/^([^\n:]{1,120}?)\s*:\s*\n?([\s\S]*)$/);
  if (!match) return null;

  const label = match[1]?.trim() ?? "";
  const messageBody = match[2]?.trim() ?? "";
  if (!label || !messageBody) return null;

  const identity = label.match(/^(.*?)\s*\((\+?[\d\s()-]+)\)$/);
  return {
    label,
    name: identity?.[1]?.trim() || label,
    phone: identity?.[2]?.trim() || null,
    body: messageBody,
  };
}

export function parseAttachments(body: string): {
  text: string;
  files: Attachment[];
  contacts: SharedContact[];
  audios: string[];
  visuals: Visual[];
  videos: string[];
  locations: SharedLocation[];
} {
  const files: Attachment[] = [];
  const contacts: SharedContact[] = [];
  const audios: string[] = [];
  const visuals: Visual[] = [];
  const videos: string[] = [];
  const locations: SharedLocation[] = [];
  const text = body
    .replace(LOCATION_RE, (_m, name: string, address: string | undefined, url: string) => {
      locations.push({ name: name.trim(), address: address?.trim() || null, url: url.trim() });
      return "";
    })
    .replace(VIDEO_RE, (_m, url: string) => {
      videos.push(url.trim());
      return "";
    })
    .replace(IMAGE_RE, (_m, kind: string, url: string) => {
      visuals.push({ url: url.trim(), sticker: kind.toLowerCase() === "figurinha" });
      return "";
    })
    .replace(AUDIO_RE, (_m, url: string) => {
      audios.push(url.trim());
      return "";
    })
    .replace(ATTACH_RE, (_m, name: string, url: string) => {
      files.push({ name: name.trim(), url: url.trim() });
      return "";
    })
    .replace(CONTACT_RE, (_m, name: string, phone: string) => {
      contacts.push({ name: name.trim(), phone: phone.trim() });
      return "";
    })
    .trim();
  return { text, files, contacts, audios, visuals, videos, locations };
}

function isPdf(a: Attachment) {
  return /\.pdf($|\?)/i.test(a.url) || /\.pdf$/i.test(a.name);
}

function SaveStickerButton({ url }: { url: string }) {
  const queryClient = useQueryClient();
  const salvar = useServerFn(saveReceivedSticker);
  const mutation = useMutation({
    mutationFn: async () => salvar({ data: { url, name: "Figurinha recebida" } }),
    onSuccess: () => {
      toast.success("Figurinha salva nas suas figurinhas");
      queryClient.invalidateQueries({ queryKey: ["stickers"] });
    },
    onError: (e: Error) => toast.error("Não deu para salvar", { description: e.message }),
  });

  return (
    <button
      type="button"
      title="Adicionar às minhas figurinhas"
      aria-label="Adicionar às minhas figurinhas"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition hover:bg-muted disabled:opacity-60"
    >
      {mutation.isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Plus className="size-3" />
      )}
    </button>
  );
}

export function MessageBody({
  body,
  mine,
  contactName,
  avatarUrl,
}: {
  body: string;
  mine: boolean;
  contactName?: string | null;
  avatarUrl?: string | null;
}) {
  // Reações antigas foram salvas como "[reagiu: 👍🏾]" — exibir apenas o emoji.
  // Links internos do WhatsApp (arquivo criptografado .enc) nunca abrem no navegador:
  // em vez de mostrar um link quebrado, avisamos que o arquivo não veio.
  const normalizedBody = body
    .replace(/\[reagiu:\s*([^\]]*)\]/g, "$1")
    .replace(/\[reação recebida\]/g, "")
    .replace(
      /(?:https?:)?\/\/\S*(?:\.enc(?:\?\S*)?|mmg\.whatsapp\.net\/\S*)/gi,
      "📎 Arquivo recebido — não foi possível baixar",
    );
  const { text, files, contacts, audios, visuals, videos, locations } = parseAttachments(normalizedBody);
  const [viewer, setViewer] = useState<Attachment | null>(null);



  return (
    <>
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.map((url) => (
            <video
              key={url}
              src={url}
              controls
              preload="metadata"
              className="max-h-72 w-64 max-w-full rounded-xl border border-border bg-black"
            />
          ))}
        </div>
      )}
      {visuals.length > 0 && (
        <div className="space-y-2">
          {visuals.map((v) => (
            <div key={v.url} className="relative inline-block">
              <a href={v.url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={v.url}
                  alt={v.sticker ? "Figurinha recebida" : "Imagem recebida"}
                  loading="lazy"
                  className={cn(
                    "max-w-full object-contain",
                    v.sticker ? "size-32" : "max-h-72 rounded-xl border border-border",
                  )}
                />
              </a>
              {v.sticker ? <SaveStickerButton url={v.url} /> : null}
            </div>
          ))}
        </div>
      )}
      {audios.length > 0 && (
        <div className="space-y-2">
          {audios.map((url) => (
            <ChatAudioPlayer
              key={url}
              src={url}
              mine={mine}
              contactName={contactName ?? null}
              avatarUrl={avatarUrl ?? null}
            />
          ))}
        </div>
      )}
      {text && (
        <p className={cn("whitespace-pre-wrap break-words", audios.length > 0 && "mt-2")}>{text}</p>
      )}
      {locations.length > 0 && (
        <div className="space-y-2">
          {locations.map((loc, i) => (
            <a
              key={`${loc.url}-${i}`}
              href={loc.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex w-64 max-w-full items-center gap-3 rounded-xl border p-2.5",
                mine
                  ? "border-message-sent-foreground/25 bg-message-sent-foreground/10"
                  : "border-border/60 bg-background/70",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  mine ? "bg-message-sent-foreground/15" : "bg-primary/10 text-primary",
                )}
              >
                <MapPin className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{loc.name}</span>
                <span
                  className={cn(
                    "block truncate text-[10px]",
                    mine ? "text-message-sent-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {loc.address ?? "Toque para abrir no mapa"}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
      {contacts.length > 0 && (
        <div className={cn("space-y-2", text && "mt-2")}>
          {contacts.map((c, i) => (
            <div
              key={`${c.phone}-${i}`}
              className={cn(
                "flex w-64 max-w-full items-center gap-3 rounded-xl border p-2.5",
                mine
                  ? "border-message-sent-foreground/25 bg-message-sent-foreground/10"
                  : "border-border/60 bg-background/70",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  mine ? "bg-message-sent-foreground/15" : "bg-primary/10 text-primary",
                )}
              >
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{c.name}</span>
                <span
                  className={cn(
                    "text-[10px]",
                    mine ? "text-message-sent-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {c.phone}
                </span>
              </span>
              <ContactRound
                className={cn("size-4 shrink-0", mine ? "text-message-sent-foreground/70" : "text-muted-foreground")}
              />
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={cn("space-y-2", text && "mt-2")}>
          {files.map((f) =>
            isPdf(f) ? (
              <div
                key={f.url}
                className={cn(
                  "flex w-64 max-w-full items-center gap-3 rounded-xl border p-2.5",
                  mine
                    ? "border-message-sent-foreground/25 bg-message-sent-foreground/10"
                    : "border-border/60 bg-background/70",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg",
                    mine ? "bg-message-sent-foreground/15" : "bg-destructive/10",
                  )}
                >
                  <FileText className={cn("size-5", mine ? "" : "text-destructive")} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{f.name}</span>
                  <span className={cn("text-[10px] uppercase", mine ? "text-message-sent-foreground/70" : "text-muted-foreground")}>
                    PDF
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Visualizar ${f.name}`}
                    onClick={() => setViewer(f)}
                  >
                    <Eye className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Baixar ${f.name}`}
                    asChild
                  >
                    <a href={f.url} target="_blank" rel="noreferrer" download={f.name}>
                      <Download className="size-4" />
                    </a>
                  </Button>
                </span>
              </div>
            ) : (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "flex w-64 max-w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-xs underline-offset-2 hover:underline",
                  mine
                    ? "border-message-sent-foreground/25 bg-message-sent-foreground/10"
                    : "border-border/60 bg-background/70",
                )}
              >
                <Paperclip className="size-4 shrink-0" />
                <span className="truncate">{f.name}</span>
              </a>
            ),
          )}
        </div>
      )}

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="flex h-[85vh] max-w-4xl flex-col p-0">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4 text-destructive" />
              <span className="truncate">{viewer?.name}</span>
            </DialogTitle>
          </DialogHeader>
          {viewer && (
            <iframe
              src={viewer.url}
              title={viewer.name}
              className="min-h-0 flex-1 rounded-b-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
