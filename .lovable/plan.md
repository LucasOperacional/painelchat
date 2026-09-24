# Corrigir bloqueio no download da nota fiscal

## Objetivo
Fazer o download da nota funcionar dentro do Webview sem abrir página bloqueada ou perder a sessão do emissor.

## Alterações
- Ajustar a captura dos arquivos gerados pelo portal para enviar o PDF diretamente ao painel.
- Evitar substituir a página do emissor após o download.
- Abrir automaticamente o leitor de PDF com a lista de atendimentos para encaminhamento.
- Manter o botão de baixar no computador como alternativa.

## Validação
- Verificar a compilação.
- Simular um download em arquivo temporário dentro do Webview e confirmar que o leitor abre sem bloquear a página.
