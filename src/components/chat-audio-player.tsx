import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/contact-avatar";
import { cn } from "@/lib/utils";

const WAVEFORM = [8, 14, 20, 11, 18, 24, 16, 9, 21, 14, 19, 26, 12, 17, 22, 10, 15, 25, 18, 12, 20, 27, 14, 9, 18, 23, 16, 11, 20, 14, 25, 18, 10, 16, 21, 13];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function ChatAudioPlayer({
  src,
  mine,
  contactName,
  avatarUrl,
}: {
  src: string;
  mine: boolean;
  contactName?: string | null;
  avatarUrl?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const progress = duration > 0 ? currentTime / duration : 0;
  const activeBars = useMemo(() => Math.round(progress * WAVEFORM.length), [progress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const stop = () => setPlaying(false);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("ended", stop);
    audio.addEventListener("pause", stop);
    const start = () => setPlaying(true);
    audio.addEventListener("play", start);
    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("play", start);
    };
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play();
    else audio.pause();
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = value * duration;
    setCurrentTime(audio.currentTime);
  }

  return (
    <div className="flex w-[17.5rem] max-w-full items-center gap-2.5 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={() => void togglePlayback()}
        aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"}
        className={cn(
          "size-9 shrink-0 rounded-full hover:bg-transparent",
          mine ? "text-message-sent-foreground" : "text-message-received-foreground",
        )}
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
      </Button>

      <div className="min-w-0 flex-1">
        <label className="relative flex h-8 cursor-pointer items-center gap-[2px]" aria-label="Progresso do áudio">
          {WAVEFORM.map((height, index) => (
            <span
              key={`${height}-${index}`}
              className={cn(
                "w-[3px] shrink-0 rounded-full transition-colors",
                index < activeBars
                  ? mine ? "bg-message-sent-foreground" : "bg-primary"
                  : mine ? "bg-message-sent-foreground/35" : "bg-message-received-foreground/30",
              )}
              style={{ height }}
            />
          ))}
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={progress}
            onChange={(event) => seek(Number(event.target.value))}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label="Avançar ou voltar no áudio"
          />
        </label>
        <span
          className={cn(
            "block text-[10px] tabular-nums",
            mine ? "text-message-sent-foreground/70" : "text-muted-foreground",
          )}
        >
          {formatTime(playing || currentTime > 0 ? currentTime : duration)}
        </span>
      </div>

      <span className="relative shrink-0">
        <ContactAvatar
          name={mine ? "Você" : (contactName ?? null)}
          avatarUrl={mine ? null : (avatarUrl ?? null)}
          size="md"
          className={cn("ring-2", mine ? "ring-message-sent-foreground/25" : "ring-primary/20")}
        />
        <span
          className={cn(
            "absolute -bottom-1 -left-1 flex size-5 items-center justify-center rounded-full ring-2",
            mine
              ? "bg-message-sent-foreground text-message-sent ring-message-sent"
              : "bg-primary text-primary-foreground ring-message-received",
          )}
        >
          <Mic className="size-3" />
        </span>
      </span>
    </div>
  );
}