import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sticker, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-session";

export type StickerChoice = { path: string; name: string };

type StickerRow = {
  id: string;
  user_id: string | null;
  pack: string;
  name: string;
  storage_path: string;
  sort_order: number;
};

const MINHAS = "Minhas figurinhas";

/** Converte qualquer imagem em webp 512x512, o formato aceito pelo WhatsApp. */
async function paraFigurinha(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a figurinha.");
  const escala = Math.min(512 / bitmap.width, 512 / bitmap.height);
  const w = bitmap.width * escala;
  const h = bitmap.height * escala;
  ctx.drawImage(bitmap, (512 - w) / 2, (512 - h) / 2, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) throw new Error("Não foi possível converter a imagem em figurinha.");
  return blob;
}

export function StickerPicker({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (sticker: StickerChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useMe();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const stickers = useQuery({
    queryKey: ["stickers"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stickers")
        .select("id, user_id, pack, name, storage_path, sort_order")
        .order("pack", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as StickerRow[];
      const paths = rows.map((r) => r.storage_path);
      const urls = new Map<string, string>();
      if (paths.length) {
        const signed = await supabase.storage.from("anexos").createSignedUrls(paths, 60 * 60);
        for (const item of signed.data ?? []) {
          if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
        }
      }
      return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? "" }));
    },
  });

  const packs = useMemo(() => {
    const lista = stickers.data ?? [];
    const nomes = Array.from(new Set(lista.map((s) => s.pack)));
    const minhas = nomes.filter((n) => n === MINHAS);
    const outros = nomes.filter((n) => n !== MINHAS).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...outros, ...minhas];
  }, [stickers.data]);

  const adicionar = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Faça login novamente.");
      if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem.");
      if (file.size > 5 * 1024 * 1024) throw new Error("A imagem passa de 5 MB.");
      const blob = await paraFigurinha(file);
      const path = `figurinhas/${user.id}/${crypto.randomUUID()}.webp`;
      const up = await supabase.storage.from("anexos").upload(path, blob, {
        contentType: "image/webp",
        upsert: false,
      });
      if (up.error) throw new Error(up.error.message);
      const nome = file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Figurinha";
      const { error } = await supabase
        .from("stickers")
        .insert({ user_id: user.id, pack: MINHAS, name: nome, storage_path: path });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Figurinha adicionada");
      queryClient.invalidateQueries({ queryKey: ["stickers"] });
    },
    onError: (e: Error) => toast.error("Erro ao adicionar figurinha", { description: e.message }),
  });

  const remover = useMutation({
    mutationFn: async (s: { id: string; storage_path: string }) => {
      const { error } = await supabase.from("stickers").delete().eq("id", s.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from("anexos").remove([s.storage_path]);
    },
    onSuccess: () => {
      toast.success("Figurinha removida");
      queryClient.invalidateQueries({ queryKey: ["stickers"] });
    },
    onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Figurinhas"
          aria-label="Figurinhas"
          disabled={disabled}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Sticker className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={16}
        avoidCollisions
        className="max-h-[min(70vh,var(--radix-popover-available-height))] w-80 overflow-y-auto p-3"
      >
        {stickers.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : packs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma figurinha ainda. Adicione a primeira abaixo.
          </p>
        ) : (
          <Tabs defaultValue={packs[0] ?? MINHAS}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {packs.map((p) => (
                <TabsTrigger key={p} value={p} className="text-xs">
                  {p === MINHAS ? "Minhas" : p}
                </TabsTrigger>
              ))}
            </TabsList>
            {packs.map((p) => (
              <TabsContent key={p} value={p} className="mt-3">
                <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto">
                  {(stickers.data ?? [])
                    .filter((s) => s.pack === p)
                    .map((s) => (
                      <div key={s.id} className="group relative">
                        <button
                          type="button"
                          title={s.name}
                          className="flex size-16 items-center justify-center rounded-lg border border-border bg-muted/40 p-1 transition hover:bg-muted"
                          onClick={() => {
                            onPick({ path: s.storage_path, name: s.name });
                            setOpen(false);
                          }}
                        >
                          <img
                            src={s.url}
                            alt={s.name}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain"
                          />
                        </button>
                        {s.user_id ? (
                          <button
                            type="button"
                            title="Excluir figurinha"
                            aria-label="Excluir figurinha"
                            onClick={() => remover.mutate({ id: s.id, storage_path: s.storage_path })}
                            className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) adicionar.mutate(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          disabled={adicionar.isPending}
          onClick={() => fileRef.current?.click()}
        >
          {adicionar.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Upload className="mr-2 size-4" />
          )}
          Adicionar figurinha
        </Button>
      </PopoverContent>
    </Popover>
  );
}
