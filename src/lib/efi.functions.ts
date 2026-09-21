import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EfiStatus = {
  configured: boolean;
  clientId: string;
  environment: "producao" | "homologacao";
  pixKey: string;
  relayUrl: string;
  relayTokenSet: boolean;
  certificateName: string;
  certificateSet: boolean;
  expirationSeconds: number;
  connected: boolean;
  error: string | null;
};

/** Situação atual da integração Efí (sem expor a chave secreta). */
export const getEfiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<EfiStatus> => {
    const { loadEfiCredentials } = await import("@/lib/efi.server");
    const creds = await loadEfiCredentials();
    if (!creds) {
      return {
        configured: false,
        clientId: "",
        environment: "producao",
        pixKey: "",
        relayUrl: "",
        relayTokenSet: false,
        certificateName: "",
        certificateSet: false,
        expirationSeconds: 3600,
        connected: false,
        error: null,
      };
    }

    let connected = false;
    let error: string | null = null;
    try {
      const { efiRequest } = await import("@/lib/efi.server");
      await efiRequest("/v2/gn/config", { timeoutMs: 15_000 });
      connected = true;
    } catch (e) {
      error = (e as Error).message;
    }

    return {
      configured: true,
      clientId: creds.clientId,
      environment: creds.environment,
      pixKey: creds.pixKey,
      relayUrl: creds.relayUrl,
      relayTokenSet: !!creds.relayToken,
      certificateName: creds.certificateName,
      certificateSet: !!creds.certificateP12,
      expirationSeconds: creds.expirationSeconds,
      connected,
      error,
    };
  });

const settingsSchema = z.object({
  clientId: z.string().trim().min(3, "Informe o Client ID"),
  clientSecret: z.string().trim().min(3, "Informe o Client Secret"),
  environment: z.enum(["producao", "homologacao"]).default("producao"),
  pixKey: z.string().trim().max(120).default(""),
  relayUrl: z.string().trim().max(300).default(""),
  relayToken: z.string().trim().max(300).default(""),
  certificateP12: z.string().trim().max(400_000).default(""),
  certificateName: z.string().trim().max(200).default(""),
  certificatePassword: z.string().max(200).optional(),
  expirationSeconds: z.number().int().min(60).max(86_400).default(3600),
});

export const saveEfiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveEfiCredentials } = await import("@/lib/efi.server");
    await saveEfiCredentials(data);
    return { ok: true };
  });

export const clearEfiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { clearEfiCredentials } = await import("@/lib/efi.server");
    await clearEfiCredentials();
    return { ok: true };
  });
