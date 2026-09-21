import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserInput = z.object({
  email: z.string().email(),
  username: z.string().trim().default(""),
  password: z.string().min(6),
  fullName: z.string().min(1),
  phone: z.string().trim().default(""),
  role: z.enum(["admin", "agent"]),
  queueIds: z.array(z.string().uuid()).default([]),
  connectionIds: z.array(z.string().uuid()).default([]),
});

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => createUserInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    if (!(myRoles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Apenas administradores podem cadastrar usuários.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Novo usuário nasce na mesma franquia de quem o cadastrou.
    const { projetoDoUsuario } = await import("@/lib/tenant.server");
    const projectId = await projetoDoUsuario(context.userId);

    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, project_id: projectId },
    });
    if (created.error) throw new Error(created.error.message);
    const newId = created.data.user!.id;

    await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone, username: data.username, project_id: projectId })
      .eq("id", newId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    const roleInsert = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: data.role, project_id: projectId });
    if (roleInsert.error) throw new Error(roleInsert.error.message);

    if (data.queueIds.length > 0) {
      const queueInsert = await supabaseAdmin
        .from("queue_agents")
        .insert(data.queueIds.map((queue_id) => ({ queue_id, agent_id: newId })));
      if (queueInsert.error) throw new Error(queueInsert.error.message);
    }

    if (data.connectionIds.length > 0) {
      const connInsert = await supabaseAdmin
        .from("agent_connections")
        .insert(
          data.connectionIds.map((whatsapp_config_id) => ({
            whatsapp_config_id,
            agent_id: newId,
          })),
        );
      if (connInsert.error) throw new Error(connInsert.error.message);
    }

    return { id: newId };
  });

const updateUserInput = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(1),
  username: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  password: z.string().min(6).optional().or(z.literal("")),
  role: z.enum(["admin", "agent"]),
  queueIds: z.array(z.string().uuid()).default([]),
  connectionIds: z.array(z.string().uuid()).default([]),
});

export const updateTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => updateUserInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    if (!(myRoles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Apenas administradores podem editar usuários.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const profileUpdate = await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone, username: data.username })
      .eq("id", data.userId);
    if (profileUpdate.error) throw new Error(profileUpdate.error.message);

    if (data.password) {
      const pass = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (pass.error) throw new Error(pass.error.message);
    }

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const roleInsert = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (roleInsert.error) throw new Error(roleInsert.error.message);

    await supabaseAdmin.from("queue_agents").delete().eq("agent_id", data.userId);
    if (data.queueIds.length > 0) {
      const queueInsert = await supabaseAdmin
        .from("queue_agents")
        .insert(data.queueIds.map((queue_id) => ({ queue_id, agent_id: data.userId })));
      if (queueInsert.error) throw new Error(queueInsert.error.message);
    }

    await supabaseAdmin.from("agent_connections").delete().eq("agent_id", data.userId);
    if (data.connectionIds.length > 0) {
      const connInsert = await supabaseAdmin
        .from("agent_connections")
        .insert(
          data.connectionIds.map((whatsapp_config_id) => ({
            whatsapp_config_id,
            agent_id: data.userId,
          })),
        );
      if (connInsert.error) throw new Error(connInsert.error.message);
    }

    return { ok: true };
  });
