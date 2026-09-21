import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MisticpayStatus = {
  configured: boolean;
  clientId: string;
  baseUrl: string;
  authMode: "basic" | "cics";
  defaultPayerName: string;
  defaultPayerDocument: string;
  account: { name?: string; email?: string; availableBalance?: number } | null;
  error: string | null;
};

/** Situação atual da integração MisticPay (sem expor a chave secreta). */
export const getMisticpayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<MisticpayStatus> => {
    const { loadMisticpayCredentials, misticpayRequest } = await import("@/lib/misticpay.server");
    const creds = await loadMisticpayCredentials();
    if (!creds) {
      return {
        configured: false,
        clientId: "",
        baseUrl: "https://api.misticpay.com/api",
        authMode: "basic",
        defaultPayerName: "",
        defaultPayerDocument: "",
        account: null,
        error: null,
      };
    }

    let account: MisticpayStatus["account"] = null;
    let error: string | null = null;
    if (creds.authMode === "basic") {
      try {
        const res = await misticpayRequest<{
          data?: { name?: string; email?: string; availableBalance?: number };
        }>("/users/info");
        account = res?.data ?? null;
      } catch (e) {
        error = (e as Error).message;
      }
    }

    return {
      configured: true,
      clientId: creds.clientId,
      baseUrl: creds.baseUrl,
      authMode: creds.authMode,
      defaultPayerName: creds.defaultPayerName,
      defaultPayerDocument: creds.defaultPayerDocument,
      account,
      error,
    };
  });

const settingsSchema = z.object({
  clientId: z.string().trim().min(3, "Informe o Client ID"),
  clientSecret: z.string().trim().min(3, "Informe o Client Secret"),
  baseUrl: z.string().trim().default("https://api.misticpay.com/api"),
  authMode: z.enum(["basic", "cics"]).default("basic"),
  defaultPayerName: z.string().trim().max(80).default(""),
  defaultPayerDocument: z.string().trim().max(20).default(""),
});

export const saveMisticpaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveMisticpayCredentials } = await import("@/lib/misticpay.server");
    await saveMisticpayCredentials(data);
    return { ok: true };
  });

export const clearMisticpaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { clearMisticpayCredentials } = await import("@/lib/misticpay.server");
    await clearMisticpayCredentials();
    return { ok: true };
  });
