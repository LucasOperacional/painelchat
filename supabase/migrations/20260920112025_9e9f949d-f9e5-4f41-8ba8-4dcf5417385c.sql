alter table public.loja_settings
  add column if not exists bot_ativo boolean not null default true,
  add column if not exists bot_primeiro_contato boolean not null default true,
  add column if not exists bot_palavras text not null default 'loja,comprar,preco,preço,catalogo,catálogo,menu,acesso,login',
  add column if not exists bot_titulo text not null default 'Nossa loja de acessos',
  add column if not exists bot_modo text not null default 'lista',
  add column if not exists bot_saudacao text not null default 'Olá! Sou o atendente automático. Veja os acessos disponíveis:';