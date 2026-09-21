import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WavoipStatus = {
  configured: boolean;
  deviceTokenPreview: string;
  email: string;
  baseUrl: string;
  callUrl: string;
  startIfReady: boolean;
  closeAfterCall: boolean;
  historyReady: boolean;
};

/** Situação atual da integração Wavoip (sem expor token nem senha). */
export const getWavoipStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<WavoipStatus> => {
    const { loadWavoipCredentials, wavoipDefaults } = await import("@/lib/wavoip.server");
    const creds = await loadWavoipCredentials();
    if (!creds) {
      return {
        configured: false,
        deviceTokenPreview: "",
        email: "",
        baseUrl: wavoipDefaults.baseUrl,
        callUrl: wavoipDefaults.callUrl,
        startIfReady: true,
        closeAfterCall: true,
        historyReady: false,
      };
    }
    return {
      configured: !!creds.deviceToken,
      deviceTokenPreview: creds.deviceToken
        ? `${creds.deviceToken.slice(0, 8)}…${creds.deviceToken.slice(-4)}`
        : "",
      email: creds.email,
      baseUrl: creds.baseUrl,
      callUrl: creds.callUrl,
      startIfReady: creds.startIfReady,
      closeAfterCall: creds.closeAfterCall,
      historyReady: !!creds.email && !!creds.password,
    };
  });

const settingsSchema = z.object({
  deviceToken: z.string().trim().max(120).default(""),
  email: z.string().trim().max(120).default(""),
  password: z.string().max(200).default(""),
  baseUrl: z.string().trim().max(200).default(""),
  callUrl: z.string().trim().max(200).default(""),
  startIfReady: z.boolean().default(true),
  closeAfterCall: z.boolean().default(true),
});

export const saveWavoipSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data }) => {
    const { saveWavoipCredentials } = await import("@/lib/wavoip.server");
    if (!data.deviceToken && !data.email) {
      throw new Error("Informe o token do dispositivo da Wavoip.");
    }
    await saveWavoipCredentials(data);
    return { ok: true };
  });

export const clearWavoipSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { clearWavoipCredentials } = await import("@/lib/wavoip.server");
    await clearWavoipCredentials();
    return { ok: true };
  });

/** Devolve a URL do Click To Call para o número informado. */
export const getWavoipCallLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({ phone: z.string().trim().min(8).max(20), name: z.string().trim().max(60).default("") })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { loadWavoipCredentials, wavoipCallUrl } = await import("@/lib/wavoip.server");
    const creds = await loadWavoipCredentials();
    if (!creds?.deviceToken) {
      throw new Error("Cadastre o token da Wavoip em Configurações para ligar pelo WhatsApp.");
    }
    return { url: wavoipCallUrl(creds, { phone: data.phone, name: data.name }) };
  });

/** Histórico de chamadas da conta Wavoip. */
export const listWavoipCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).default(""),
        direction: z.enum(["", "INCOMING", "OUTCOMING"]).default(""),
        cursor: z.string().trim().max(400).default(""),
        count: z.number().int().min(1).max(100).default(30),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { loadWavoipCredentials, wavoipListCalls } = await import("@/lib/wavoip.server");
    const creds = await loadWavoipCredentials();
    if (!creds?.email || !creds?.password) {
      return {
        calls: [] as Awaited<ReturnType<typeof wavoipListCalls>>["data"],
        nextCursor: null as string | null,
        notice: "Cadastre o e-mail e a senha da Wavoip em Configurações para ver o histórico.",
      };
    }
    const res = await wavoipListCalls(creds, {
      count: data.count,
      ...(data.cursor ? { cursor: data.cursor } : {}),
      ...(data.search ? { search: data.search } : {}),
      ...(data.direction ? { direction: data.direction } : {}),
    });
    return { calls: res.data ?? [], nextCursor: res.nextCursor ?? null, notice: "" };
  });
