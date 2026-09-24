# Salvar e mostrar documentos do Webview

## O que será feito
- Salvar automaticamente cada PDF, XML ou arquivo fiscal capturado pelo Webview, sem depender da nova página recusada pelo portal.
- Registrar nome, tipo, tamanho, data e vínculo com o site de origem.
- Mostrar um card “Documentos salvos” na própria página do site, com os arquivos mais recentes.
- Permitir abrir, baixar e encaminhar qualquer documento salvo para um contato do atendimento.
- Atualizar o card assim que um novo arquivo for capturado e abrir o leitor automaticamente para PDFs.

## Segurança
- Manter os arquivos no armazenamento privado e entregar links temporários.
- Restringir a lista aos usuários autenticados autorizados a acessar o painel.
- Validar tamanho e tipo do arquivo antes de salvá-lo.

## Validação
- Confirmar que o projeto compila sem erros.
- Simular o recebimento de um PDF e verificar salvamento, atualização do card, abertura do leitor e opção de envio.
