import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const RECORDING_WAVE = [8, 14, 21, 11, 18, 25, 15, 9, 20, 13, 23, 17, 10, 19, 26, 14, 8, 17];

/** Formatos aceitos pelo navegador, na ordem que o WhatsApp entende melhor. */
const FORMATOS = [
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

function escolherFormato(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return FORMATOS.find((t) => MediaRecorder.isTypeSupported(t));
}

function extensaoDe(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

function formatarTempo(segundos: number): string {
  const m = Math.floor(segundos / 60)
    .toString()
    .padStart(2, "0");
  const s = (segundos % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Gravador de áudio do chat: grava pelo microfone e devolve o arquivo pronto
 * para ser enviado na conversa (vale para conversas normais e grupos).
 */
export function AudioRecorder({
  disabled,
  enviando,
  onReady,
  className,
}: {
  disabled?: boolean;
  enviando?: boolean;
  onReady: (file: File) => void;
  className?: string;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelarRef = useRef(false);

  useEffect(() => {
    if (!gravando) return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [gravando]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function iniciar() {
    const mimeType = escolherFormato();
    if (!navigator.mediaDevices?.getUserMedia || !mimeType) {
      toast.error("Este navegador não permite gravar áudio");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelarRef.current = false;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setGravando(false);
        setSegundos(0);
        if (cancelarRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) {
          toast.warning("Áudio muito curto", { description: "Segure a gravação por mais tempo." });
          return;
        }
        const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
        onReady(
          new File([blob], `audio-${stamp}.${extensaoDe(mimeType)}`, { type: mimeType }),
        );
      };
      recorderRef.current = recorder;
      recorder.start();
      setSegundos(0);
      setGravando(true);
    } catch {
      toast.error("Não foi possível usar o microfone", {
        description: "Permita o acesso ao microfone no navegador e tente de novo.",
      });
    }
  }

  function parar(cancelar: boolean) {
    cancelarRef.current = cancelar;
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  if (gravando) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-full bg-destructive/10 px-2">
        <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span className="min-w-[34px] text-[11px] font-medium tabular-nums text-destructive">
          {formatarTempo(segundos)}
        </span>
        <span className="flex h-7 items-center gap-[2px]" aria-hidden>
          {RECORDING_WAVE.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="w-0.5 animate-pulse rounded-full bg-destructive/55"
              style={{ height, animationDelay: `${index * 70}ms` }}
            />
          ))}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          title="Descartar áudio"
          aria-label="Descartar áudio"
          onClick={() => parar(true)}
          className="size-8 rounded-full text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          title="Enviar áudio"
          aria-label="Enviar áudio"
          onClick={() => parar(false)}
          className="size-8 rounded-full"
        >
          <Send className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title="Gravar áudio"
      aria-label="Gravar áudio"
      onClick={() => void iniciar()}
      disabled={disabled || enviando}
      className={className ?? "size-8 rounded-full text-muted-foreground hover:text-foreground"}
    >
      {enviando ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
    </Button>
  );
}
