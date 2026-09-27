-- Nenhuma mensagem se perde: diário de entrada mais fiel e fila de saída.
--
-- 1. `webhook_eventos` passa a guardar o corpo original do aviso. Antes só
--    sobrava o payload "enxuto", onde qualquer texto acima de 4.000 caracteres
--    (áudio, imagem e documento em base64) era trocado por um aviso de
--    "conteúdo grande removido" — o reprocessamento nunca conseguia recuperar o
--    arquivo. Agora o corpo fica inteiro: pequeno, na própria linha; grande, no
--    armazenamento, com o caminho anotado em `corpo_path`.
-- 2. `mensagens_saida` é a fila das mensagens que a central envia. A intenção de
--    envio é gravada ANTES de chamar a API, então uma queda no meio do caminho
--    não apaga o pedido: ele fica registrado e visível no painel.

alter table public.webhook_eventos
  add column if not exists corpo_bruto text,
  add column if not exists corpo_path text,
  add column if not exists content_type text,
  add column if not exists proxima_tentativa_em timestamptz;

-- A fila de pendentes é lida por status e por data; sem índice ela varre a
-- tabela inteira a cada ciclo da Sentinela.
create index if not exists webhook_eventos_fila_idx
  on public.webhook_eventos (status, created_at);

create index if not exists webhook_eventos_external_id_idx
  on public.webhook_eventos (external_id)
  where external_id is not null;

create table if not exists public.mensagens_saida (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  project_id uuid,
  config_id uuid,
  -- Quem pediu o envio: o atendente (auth.users) ou uma automação (nulo).
  sender_id uuid,
  destino text not null,
  tipo text not null default 'texto',
  -- Tudo que a API precisa para reenviar sem depender da tela: texto, anexos,
  -- citação e o corpo que deve ficar registrado na conversa.
  payload jsonb not null default '{}'::jsonb,
  -- pendente → enviando → enviado | incerto | falhou
  -- `incerto` é o caso em que a API não respondeu: pode ter entregue. A central
  -- nunca reenvia sozinha nessa situação, para não duplicar no WhatsApp.
  status text not null default 'pendente',
  tentativas integer not null default 0,
  external_id text,
  message_id uuid references public.messages (id) on delete set null,
  erro text,
  created_at timestamptz not null default now(),
  proxima_tentativa_em timestamptz,
  processado_em timestamptz
);

create index if not exists mensagens_saida_fila_idx
  on public.mensagens_saida (status, created_at);

create index if not exists mensagens_saida_conversa_idx
  on public.mensagens_saida (conversation_id, created_at desc);

alter table public.mensagens_saida enable row level security;

-- A fila é operada pelo servidor (service role, que ignora RLS). No painel,
-- apenas leitura para quem já tem acesso à conversa.
drop policy if exists "mensagens_saida_leitura" on public.mensagens_saida;
create policy "mensagens_saida_leitura"
  on public.mensagens_saida
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = mensagens_saida.conversation_id
    )
  );
