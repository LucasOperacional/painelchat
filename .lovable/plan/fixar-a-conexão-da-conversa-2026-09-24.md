# Fixar a conexão da conversa

## Objetivo
Impedir que uma conversa já vinculada a um número conectado passe automaticamente para outro número quando chegam mensagens duplicadas ou eventos de outra conexão.

## Alterações
- Manter a conexão atual como prioridade em toda conversa aberta.
- Usar a conexão que recebeu a mensagem somente ao criar uma conversa nova.
- Se a conversa estiver marcada como sem conexão, mantê-la sem conexão até uma transferência manual.
- Não alterar fila nem atendente por causa de eventos recebidos em outro número.
- Validar o recebimento e o envio para garantir que a resposta continue saindo pelo número confirmado.

## Detalhes técnicos
Ajustar a seleção do aparelho no processamento de mensagens recebidas para que `whatsapp_config_id` existente seja imutável durante o fluxo normal. A troca continuará disponível apenas pela ação manual de transferência já existente.
