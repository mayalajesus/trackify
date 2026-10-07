# E-mails de autenticação

Os templates de autenticação são publicados no Supabase de produção:

- `account-confirmation.html`: **Confirme seu e-mail — Trackify**.
- `password-recovery.html`: **Redefina sua senha — Trackify**.

## Configuração aplicada em 1 de outubro de 2026

- SMTP Mailjet: `in-v3.mailjet.com`, porta `587`.
- Remetente: **Trackify <mayalajesus@outsmarting.com.br>**.
- Credenciais configuradas exclusivamente no Supabase; não são incluídas neste repositório.
- Confirmação obrigatória e login sem confirmação desabilitado.
- Validade dos links: 3.600 segundos; intervalo entre solicitações: 60 segundos.
- Limite de autenticação: **30 e-mails por hora**, autorizado para o MVP mantendo os planos gratuitos. Configuração conferida por leitura da API; nenhuma assinatura foi alterada.
- O Mailjet gratuito permite **200 e-mails por dia e 6.000 por mês**, compartilhados entre autenticação, boas-vindas e convites. O limite de 30/h do Supabase não reserva cota para esses outros envios. Distribuir a entrada do grupo para manter margem para recuperações e reenvios.
- Ao exceder a cota diária, o Mailjet documenta que os e-mails podem ficar na fila para o dia seguinte; links de autenticação de uma hora podem chegar expirados. Referência: https://documentation.mailjet.com/hc/en-us/articles/360043048393-What-is-this-200-emails-per-day-limit-on-free-accounts
- Retornos autorizados no domínio `https://watchtag.vercel.app`: `/auth/callback`, `/settings` (fluxo anterior) e `/invite/accept`, incluindo parâmetros de consulta, além da raiz já cadastrada.
- Os links usam `rel="notrack"` para impedir que o Mailjet substitua o link de autenticação por um link de rastreamento.
- Configuração conferida por leitura da API administrativa, sem testes ou envio de mensagens. Entrega real não validada.

As alterações de interface para reenvio e recuperação são publicadas pela Vercel a partir da `main`. A configuração SMTP e os templates entram em vigor independentemente dessa publicação.

## Atualização dos templates

- Assunto: **Redefina sua senha — Trackify**
- Idioma do e-mail: português (Brasil).
- No painel Supabase, abra **Authentication → Email Templates → Reset Password** e configure o assunto e o HTML deste arquivo.
- Preserve `{{ .ConfirmationURL }}` no botão e no link alternativo. O Supabase gera o link seguro com o redirecionamento solicitado pela aplicação.
- Alterar este arquivo não publica automaticamente o template. Ao atualizá-lo, publique também a configuração do provedor.
- Este template não configura o Neon de homologação.

Não inclua credenciais ou links de recuperação reais neste diretório. O Supabase continua responsável pelos tokens, confirmação, sessão e limites de autenticação; o Mailjet transporta esses e-mails via SMTP. Boas-vindas e convites de workspace usam a integração separada descrita em `transactional.md`.
