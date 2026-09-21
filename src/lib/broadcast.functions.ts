import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BroadcastCampaignDto = {
  id: string;
  name: string;
  channel: string;
  deviceId: string | null;
  targets: string[];
  message: string;
  imageUrl: string;
  scheduledAt: string | null;
  repeatMinutes: number;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string;
};

type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  device_id: string | null;
  targets: string[];
  message: string;
  image_url: string;
  scheduled_at: string | null;
  repeat_minutes: number;
  is_active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string;
};

function toDto(row: CampaignRow): BroadcastCampaignDto {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    deviceId: row.device_id,
    targets: row.targets,
    message: row.message,
    imageUrl: row.image_url,
    scheduledAt: row.scheduled_at,
    repeatMinutes: row.repeat_minutes,
    isActive: row.is_active,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
  };
}

async function requireAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!((data ?? []) as { role: string }[]).some((r) => (r.role === "admin" || r.role === "superadmin"))) {
    throw new Error("Apenas administradores podem gerenciar a divulgação em grupos.");
  }
}

const campaignInput = z.object({
  name: z.string().min(1, "Dê um nome à campanha."),
  channel: z.enum(["divulgazap", "device"]).default("divulgazap"),
  deviceId: z.string().uuid().nullable().default(null),
  targets: z
    .array(z.string().min(3))
    .min(1, "Adicione ao menos um grupo."),
  message: z.string().min(1, "Digite a mensagem."),
  imageUrl: z.string().url().optional().or(z.literal("")).default(""),
  scheduledAt: z.string().nullable().default(null),
  repeatMinutes: z.number().int().min(0).default(0),
});

function toRow(data: z.infer<typeof campaignInput>) {
  const next = data.scheduledAt ? new Date(data.scheduledAt) : null;
  return {
    name: data.name.trim(),
    channel: data.channel,
    device_id: data.channel === "device" ? data.deviceId : null,
    targets: data.targets.map((t) => t.trim()).filter(Boolean),
    message: data.message,
    image_url: data.imageUrl ?? "",
    scheduled_at: next?.toISOString() ?? null,
    repeat_minutes: data.repeatMinutes,
    next_run_at: next ? next.toISOString() : data.repeatMinutes > 0 ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

export const listBroadcastCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { data, error } = await context.supabase
      .from("broadcast_campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as CampaignRow[]).map(toDto);
  });

export const saveBroadcastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid().nullable().default(null), campaign: campaignInput }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = toRow(data.campaign);
    const query = data.id
      ? supabaseAdmin.from("broadcast_campaigns").update(row).eq("id", data.id).select("id").single()
      : supabaseAdmin.from("broadcast_campaigns").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    return { id: (saved as { id: string }).id };
  });

export const toggleBroadcastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("broadcast_campaigns")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBroadcastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("broadcast_campaigns").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dispara a campanha imediatamente (ignora o agendamento). */
export const runBroadcastNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { runBroadcastCampaign } = await import("@/lib/broadcast.server");
    return runBroadcastCampaign(data.id);
  });

/** Histórico de envios de uma campanha. */
export const listBroadcastRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ campaignId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("broadcast_runs")
      .select("id, target, ok, detail, created_at")
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as {
      id: string;
      target: string;
      ok: boolean;
      detail: string;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      target: r.target,
      ok: r.ok,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  });

/** Busca os grupos disponíveis na API/dispositivo selecionado. */
export const listBroadcastGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        channel: z.enum(["divulgazap", "device"]),
        deviceId: z.string().uuid().nullable().default(null),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { fetchBroadcastGroups } = await import("@/lib/broadcast.server");
    return fetchBroadcastGroups(data);
  });
