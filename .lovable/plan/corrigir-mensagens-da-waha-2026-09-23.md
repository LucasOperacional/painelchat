# Corrigir mensagens da WAHA

## Objetivo
Garantir que mensagens recebidas e enviadas pela WAHA apareçam no chat correto, sem duplicação ou perda.

## Implementação
- Ajustar a leitura dos eventos reais da WAHA, preservando telefone alternativo, conteúdo completo, mídia, resposta, reação e horário.
- Tornar a identificação do contato confiável para números comuns, identificadores `@lid` e grupos.
- Corrigir o download de mídia para usar a autenticação da WAHA no servidor, sem depender de links que falham no navegador.
- Confirmar os formatos e respostas de envio de texto, imagem, vídeo, áudio, documento, figurinha e contato.
- Manter Evolution Go e WuzAPI isoladas e inalteradas.
- Validar com eventos recentes do diário, checagem de tipos e testes do endpoint; confirmar no banco que entrada e saída chegaram à mesma conversa.
