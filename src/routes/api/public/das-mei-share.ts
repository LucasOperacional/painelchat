import { createFileRoute } from "@tanstack/react-router";

import { DAS_MEI_BUCKET, DAS_MEI_MAX_BYTES, isPdfSignature, sanitizePdfName, hasDangerousName } from "@/lib/das-mei";

/**
 * Alvo de compartilhamento do PWA (Android): recebe o PDF da DAS compartilhado
 * pelo celular, guarda em uma área temporária do bucket privado e redireciona
 * para a página autenticada que finaliza o envio.
 */
export const Route = createFileRoute("/api/public/das-mei-share")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.redirect(new URL("/das-mei?compartilhamento=erro", request.url), 303);
        }

        const file = form.get("arquivo") ?? form.get("file") ?? form.get("files");
        if (!(file instanceof File) || file.size === 0 || file.size > DAS_MEI_MAX_BYTES) {
          return Response.redirect(new URL("/das-mei?compartilhamento=erro", request.url), 303);
        }
        if (hasDangerousName(file.name) || (file.type && file.type !== "application/pdf")) {
          return Response.redirect(new URL("/das-mei?compartilhamento=erro", request.url), 303);
        }

        const buffer = new Uint8Array(await file.arrayBuffer());
        if (!isPdfSignature(buffer.slice(0, 5))) {
          return Response.redirect(new URL("/das-mei?compartilhamento=erro", request.url), 303);
        }

        const token = crypto.randomUUID();
        const nome = sanitizePdfName(file.name);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.storage
          .from(DAS_MEI_BUCKET)
          .upload(`_inbox/${token}.pdf`, buffer, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (error) {
          return Response.redirect(new URL("/das-mei?compartilhamento=erro", request.url), 303);
        }

        const destino = new URL("/das-mei/receber", request.url);
        destino.searchParams.set("token", token);
        destino.searchParams.set("nome", nome);
        return Response.redirect(destino, 303);
      },
    },
  },
});
