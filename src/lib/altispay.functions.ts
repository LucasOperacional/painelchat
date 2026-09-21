import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AltispayStatus = {
  configured: boolean;
  environment: "producao" | "sandbox";
  baseUrl: string;
  apiKeyPreview: string;
  defaultPayerName: string;
  defaultPayerDocument: string;
  defaultPayerEmail: string;
  webhookConfigured: boolean;
};

/** Situação atual da integração AltisPay (sem expor a chave). */
export const getAltispayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AltispayStatus> => {
    const { loadAltispayCredentials, altispayDefaultBaseUrl } = await import(
      "@/lib/altispay.server"
    );
    const creds = await loadAltispayCredentials();
    if (!creds) {
      return {
        configured: false,
        environment: "producao",
        baseUrl: altispayDefaultBaseUrl("producao"),
        apiKeyPreview: "",
        defaultPayerName: "",
        defaultPayerDocument: "",
        defaultPayerEmail: "",
        webhookConfigured: false,
      };
    }

    return {
      configured: true,
      environment: creds.environment,
      baseUrl: creds.baseUrl,
      apiKeyPreview: `${creds.apiKey.slice(0, 10)}…${creds.apiKey.slice(-4)}`,
      defaultPayerName: creds.defaultPayerName,
      defaultPayerDocument: creds.defaultPayerDocument,
      defaultPayerEmail: creds.defaultPayerEmail,
      webhookConfigured: !!creds.webhookToken,
    };
  });

const settingsSchema = z.object({
  apiKey: z.string().trim().max(200).default(""),
  environment: z.enum(["producao", "sandbox"]).default("producao"),
  baseUrl: z.string().trim().max(200).default(""),
  defaultPayerName: z.string().trim().max(80).default(""),
  defaultPayerDocument: z.string().trim().max(20).default(""),
  defaultPayerEmail: z.string().trim().max(120).default(""),
  webhookToken: z.string().trim().max(200).default(""),
});

export const saveAltispaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveAltispayCredentials, loadAltispayCredentials } = await import(
      "@/lib/altispay.server"
    );
    if (!data.apiKey) {
      const existing = await loadAltispayCredentials();
      if (!existing) throw new Error("Informe a chave de API da AltisPay.");
    }
    await saveAltispayCredentials(data);
    return { ok: true };
  });

export const clearAltispaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { clearAltispayCredentials } = await import("@/lib/altispay.server");
    await clearAltispayCredentials();
    return { ok: true };
  });
