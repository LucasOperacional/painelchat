import { supabase } from "@/integrations/supabase/client";

export type ConversationStatus = "waiting" | "open" | "closed";

export type Department = {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
  created_at: string;
};

export type Queue = {
  id: string;
  name: string;
  department_id: string | null;
  greeting: string;
  priority: number;
  is_active: boolean;
  color: string;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: "available" | "away" | "offline";
  created_at: string;
  phone?: string | null;
};

export type Contact = {
  id: string;
  name: string;
  phone: string;
  notes: string;
  avatar_url: string | null;
  wa_jid?: string | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  direction: "inbound" | "outbound" | "system";
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  external_id?: string | null;
  reply_to_external_id?: string | null;
  reply_body?: string | null;
};

export type Conversation = {
  id: string;
  contact_id: string;
  queue_id: string | null;
  department_id: string | null;
  assigned_to: string | null;
  status: ConversationStatus;
  channel: string;
  last_message_at: string;
  first_response_at: string | null;
  closed_at: string | null;
  created_at: string;
  contact: Contact | null;
  queue: { id: string; name: string; department_id: string | null; color: string } | null;
  department: { id: string; name: string; color: string } | null;
  whatsapp_config_id?: string | null;
  connection?: { id: string; label: string; instance_name: string; color: string } | null;
  /** Última mensagem trocada no chat (enviada ou recebida), para a prévia na lista. */
  last_message?: LastMessage | null;
};

export type LastMessage = {
  id: string;
  body: string;
  direction: "inbound" | "outbound" | "system";
  created_at: string;
};

/** Texto curto da última mensagem: mídia vira rótulo legível em vez de link. */
export function previewMensagem(message: LastMessage | null | undefined) {
  if (!message) return "";
  const body = (message.body ?? "").trim();
  if (!body) return "";
  const semLabel = body
    .replace(/🖼\s*Figurinha:\s*https?:\/\/\S+/g, "Figurinha")
    .replace(/🖼\s*Imagem:\s*https?:\/\/\S+/g, "📷 Foto")
    .replace(/🎵\s*(?:Áudio|Audio):\s*https?:\/\/\S+/g, "🎵 Áudio")
    .replace(/🎬\s*(?:Vídeo|Video):\s*https?:\/\/\S+/g, "🎬 Vídeo")
    .replace(/📍\s*Localização:\s*[^\n]+/g, "📍 Localização")
    .replace(/📎\s*(.+?):\s*https?:\/\/\S+/g, "📎 $1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .trim();
  return semLabel || "Mensagem";
}

export type Transfer = {
  id: string;
  conversation_id: string;
  from_user: string | null;
  to_user: string | null;
  to_queue: string | null;
  note: string;
  created_at: string;
};

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export async function fetchDepartments() {
  return unwrap<Department[]>(
    await supabase.from("departments").select("*").order("name", { ascending: true }),
  );
}

export async function fetchQueues() {
  return unwrap<Queue[]>(
    await supabase.from("queues").select("*").order("priority").order("name"),
  );
}

export async function fetchProfiles() {
  return unwrap<Profile[]>(await supabase.from("profiles").select("*").order("full_name"));
}

export async function fetchContacts() {
  return unwrap<Contact[]>(
    await supabase.from("contacts").select("*").order("name", { ascending: true }),
  );
}

export async function fetchRoles() {
  return unwrap<{ user_id: string; role: "admin" | "agent" }[]>(
    await supabase.from("user_roles").select("user_id, role"),
  );
}

export async function fetchQueueAgents() {
  return unwrap<{ id: string; queue_id: string; agent_id: string }[]>(
    await supabase.from("queue_agents").select("id, queue_id, agent_id"),
  );
}

const CONVERSATION_SELECT =
  "*, contact:contacts(id, name, phone, notes, avatar_url, wa_jid), queue:queues(id, name, department_id, color), department:departments(id, name, color), connection:whatsapp_config(id, label, instance_name, color)";

export async function fetchConversations() {
  const conversations = unwrap<Conversation[]>(
    await supabase
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .order("last_message_at", { ascending: false })
      .limit(300),
  ) as Conversation[];

  if (conversations.length === 0) return conversations;

  // Regra: a lista sempre mostra a última mensagem (enviada ou recebida) de cada chat.
  // Uma única consulta no banco resolve todas as conversas (DISTINCT ON por conversa).
  const ids = conversations.map((c) => c.id);
  const { data: recentes } = await supabase.rpc("ultimas_mensagens", { _ids: ids });

  const ultimas = new Map<string, LastMessage>();
  for (const row of (recentes ?? []) as (LastMessage & { conversation_id: string })[]) {
    if (!ultimas.has(row.conversation_id)) {
      ultimas.set(row.conversation_id, {
        id: row.id,
        body: row.body,
        direction: row.direction,
        created_at: row.created_at,
      });
    }
  }

  return conversations.map((c) => ({ ...c, last_message: ultimas.get(c.id) ?? null }));
}


/** Traz só as últimas mensagens: a conversa abre na hora mesmo com histórico grande. */
export async function fetchMessages(conversationId: string, limite = 300) {
  const rows = unwrap<Message[]>(
    await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limite),
  );
  return [...rows].reverse();
}

export type WaConnection = {
  id: string;
  label: string;
  instance_name: string;
  phone: string;
  status: string;
  is_default: boolean;
  color: string;
};

/** Conexões de WhatsApp disponíveis (leitura pelo cliente, sem tokens). */
export async function fetchConnections() {
  return unwrap<WaConnection[]>(
    await supabase
      .from("whatsapp_config")
      .select("id, label, instance_name, phone, status, is_default, color")
      .order("is_default", { ascending: false })
      .order("label"),
  );
}

export async function fetchTransfers(conversationId: string) {
  return unwrap<Transfer[]>(
    await supabase
      .from("transfers")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }),
  );
}

export async function sendMessage(conversationId: string, senderId: string, body: string) {
  const { error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, direction: "outbound", body });
  if (error) throw new Error(error.message);

  const { data: conv } = await supabase
    .from("conversations")
    .select("first_response_at")
    .eq("id", conversationId)
    .maybeSingle();

  const patch: { last_message_at: string; first_response_at?: string } = {
    last_message_at: new Date().toISOString(),
  };
  if (conv && !conv.first_response_at) patch.first_response_at = new Date().toISOString();
  await supabase.from("conversations").update(patch).eq("id", conversationId);
}

/**
 * Regra: assumir, encerrar, reabrir e transferir só podem dizer "pronto" quando
 * a linha da conversa voltou gravada do banco. Sem a linha de volta, a ação
 * falha na cara do atendente em vez de parecer que funcionou.
 */
type ConversationPatch = {
  assigned_to?: string | null;
  status?: ConversationStatus;
  closed_at?: string | null;
  queue_id?: string;
  department_id?: string | null;
  whatsapp_config_id?: string;
  last_message_at?: string;
};

async function updateConversation(
  conversationId: string,
  patch: ConversationPatch,
  acao: string,
) {
  const { data, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversationId)
    .select(CONVERSATION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Não foi possível ${acao}: a conversa não foi encontrada ou você não tem permissão.`);
  return data as Conversation;
}

export async function claimConversation(conversationId: string, userId: string) {
  return updateConversation(
    conversationId,
    { assigned_to: userId, status: "open", closed_at: null },
    "assumir o atendimento",
  );
}

export async function closeConversation(conversationId: string) {
  return updateConversation(
    conversationId,
    { status: "closed", closed_at: new Date().toISOString() },
    "encerrar o atendimento",
  );
}

export async function reopenConversation(conversationId: string, userId: string) {
  return updateConversation(
    conversationId,
    { status: "open", closed_at: null, assigned_to: userId },
    "reabrir o atendimento",
  );
}

export async function transferConversation(params: {
  conversationId: string;
  fromUser: string;
  toUser?: string | null;
  toQueue?: string | null;
  departmentId?: string | null;
  toConnection?: string | null;
  note: string;
  systemLabel: string;
}) {
  const onlyConnection = !!params.toConnection && !params.toUser && !params.toQueue;
  const update: ConversationPatch = onlyConnection
    ? {}
    : params.toUser
      ? { assigned_to: params.toUser, status: "open" }
      : { assigned_to: null, status: "waiting" };
  if (params.toQueue) {
    update.queue_id = params.toQueue;
    update.department_id = params.departmentId ?? null;
  }
  if (params.toConnection) {
    update.whatsapp_config_id = params.toConnection;

    // Trocar a conexão arrasta a fila e o responsável junto, para a conversa
    // não ficar numa fila que a nova conexão não atende.
    const { data: conexao } = await supabase
      .from("whatsapp_config")
      .select("default_queue_id")
      .eq("id", params.toConnection)
      .maybeSingle();
    const filaPadrao = (conexao as { default_queue_id?: string | null } | null)?.default_queue_id;
    if (!params.toQueue && filaPadrao) {
      const { data: fila } = await supabase
        .from("queues")
        .select("department_id")
        .eq("id", filaPadrao)
        .maybeSingle();
      update.queue_id = filaPadrao;
      update.department_id =
        (fila as { department_id?: string | null } | null)?.department_id ?? null;
    }

    // Se quem atendia não tem acesso à nova conexão, a conversa volta para a
    // fila de espera e fica visível para quem atende essa conexão.
    if (!params.toUser) {
      const { data: atual } = await supabase
        .from("conversations")
        .select("assigned_to")
        .eq("id", params.conversationId)
        .maybeSingle();
      const responsavel = (atual as { assigned_to?: string | null } | null)?.assigned_to ?? null;
      if (responsavel) {
        const { data: vinculos } = await supabase
          .from("agent_connections")
          .select("agent_id")
          .eq("whatsapp_config_id", params.toConnection);
        const lista = (vinculos ?? []) as { agent_id: string }[];
        const restrita = lista.length > 0;
        const podeAtender = lista.some((v) => v.agent_id === responsavel);
        if (restrita && !podeAtender) {
          update.assigned_to = null;
          update.status = "waiting";
        }
      }
    }
  }



  // Transferir sempre devolve a conversa para o andamento: uma conversa
  // encerrada que é transferida volta a aparecer para quem recebeu.
  if (update.status) update.closed_at = null;
  // Sobe a conversa no topo da lista de quem recebeu o atendimento.
  update.last_message_at = new Date().toISOString();

  const atualizada = await updateConversation(
    params.conversationId,
    update,
    "transferir o atendimento",
  );

  const transferInsert = await supabase.from("transfers").insert({
    conversation_id: params.conversationId,
    from_user: params.fromUser,
    to_user: params.toUser ?? null,
    to_queue: params.toQueue ?? null,
    note: params.note,
  });
  if (transferInsert.error) throw new Error(transferInsert.error.message);

  // O aviso da transferência precisa chegar na conversa: se falhar, o novo
  // responsável não saberia o que aconteceu, por isso o erro é propagado.
  const messageInsert = await supabase.from("messages").insert({
    conversation_id: params.conversationId,
    direction: "system",
    body: params.systemLabel,
  });
  if (messageInsert.error) throw new Error(messageInsert.error.message);

  return atualizada;
}

export async function fetchAgentConnections() {
  return unwrap<{ id: string; agent_id: string; whatsapp_config_id: string }[]>(
    await supabase.from("agent_connections").select("id, agent_id, whatsapp_config_id"),
  );
}
