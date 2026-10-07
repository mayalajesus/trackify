# Boas-vindas e convites (Mailjet)

Os templates HTML e texto ficam em `server/email-templates.mjs` e são enviados pela API v3.1. Não é necessário criar templates no painel Mailjet. Confirmação de cadastro e recuperação de senha permanecem no provedor de autenticação.

## Ativação

1. Aplicar `20261001120000_transactional_emails.sql` antes de publicar. Ela dispensa todas as contas existentes do envio de boas-vindas.
2. Configurar na Vercel, somente no ambiente Production: `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_FROM_EMAIL=mayalajesus@outsmarting.com.br`, `MAILJET_FROM_NAME=Trackify` e `MAILJET_ENABLED=true`.
3. Confirmar `DATABASE_ENV=production` e `APP_URL` com o endereço HTTPS público do app.
4. Publicar a versão com a integração. Desenvolvimento e Preview não enviam e-mails; `MAILJET_ENABLED` fica falso por padrão.

O remetente precisa estar ativo no Mailjet. As credenciais nunca usam prefixo `VITE_`. Para trocar de endereço, validar o novo remetente/domínio e alterar a configuração. SPF e DKIM de um domínio próprio dependem de acesso ao seu DNS.

## Operação

- Boas-vindas são registradas no primeiro carregamento autenticado da conta, com chave única por usuário, incluindo Google.
- Cada criação ou reenvio de convite tem um identificador de operação. A alteração do convite e o registro do e-mail são atômicos; o envio ocorre depois do commit.
- `accepted` significa aceito pelo Mailjet, sem garantia de entrega. `disabled` é retornado pela API quando o ambiente não pode enviar.
- Erros de limite (429) e rejeições explicitamente temporárias do Mailjet em boas-vindas são repetidos nos carregamentos seguintes da conta, após 1, 5, 30 e 120 minutos, com máximo de cinco tentativas. Convites são reenviados por ação explícita na equipe.
- Timeouts, erros de rede e respostas ambíguas ficam como `unknown`, sem repetição automática. Envios interrompidos em `sending` passam a `unknown` após dois minutos, quando consultados novamente. Conferir o identificador do evento (`CustomID`) no Mailjet antes de qualquer intervenção manual.
- Falhas de credenciais ou configuração ficam como `failed` sem repetição automática. Corrigir a configuração antes de recolocar um evento de boas-vindas em `pending`.
- Os estados e identificadores ficam em `public.transactional_emails`, protegida por RLS e acessível apenas pelo servidor. Não registrar tokens, links de convite, destinatários ou segredos nos logs.
- Para interromper envios, configurar `MAILJET_ENABLED=false` e republicar. A criação de convites e a cópia de links continuam funcionando.

Nenhum e-mail de teste deve ser enviado como parte da implantação solicitada.
