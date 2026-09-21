import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MINHAS = "Minhas figurinhas";

/** Guarda na galeria uma figurinha recebida na conversa. */
export const saveReceivedSticker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        url: z.string().url(),
        name: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const res = await fetch(data.url);
    if (!res.ok) throw new Error("Não foi possível baixar a figurinha.");
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error("A figurinha está vazia.");
    if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("A figurinha passa de 5 MB.");

    const type = res.headers.get("content-type") ?? "";
    const contentType = type.startsWith("image/") ? type.split(";")[0]! : "image/webp";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : contentType.includes("gif")
          ? "gif"
          : "webp";

    const path = `figurinhas/${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("anexos").upload(path, buffer, {
      contentType,
      upsert: false,
    });
    if (up.error) throw new Error(up.error.message);

    const name = (data.name ?? "").trim().slice(0, 40) || "Figurinha recebida";
    const { error } = await supabase
      .from("stickers")
      .insert({ user_id: userId, pack: MINHAS, name, storage_path: path });
    if (error) throw new Error(error.message);

    return { ok: true, path };
  });
