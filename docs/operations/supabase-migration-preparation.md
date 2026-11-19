# Preparação da migração Supabase → Supabase

## Estado e autorização

Preparação iniciada em 18/11/2026 (America/Bahia). **Migração autorizada e aplicada em
19/11/2026.** O usuário pediu concluir as validações e aplicar a troca preservando dados
e acessos. O endereço `https://watchtag.vercel.app` agora usa `gfedmrhckghmgssgfwis`.
Os tópicos anteriores à seção de conclusão abaixo registram a sequência histórica dos
ensaios. Não existe garantia de risco zero; divergência sem explicação impede a liberação.

### Conclusão da troca em produção

- A origem permaneceu idêntica ao snapshot inicial nas 57 tabelas auditadas. Todos os
  1.064 registros originais foram conferidos no destino, mais o registro de teste de
  sete segundos criado pelo usuário. Nenhuma restauração sobrescreveu esse registro.
- Preservados os IDs e campos de acesso das 16 contas, hashes de senha, 11 workspaces,
  permissões, sessões da extensão, estados de exclusão e cinco arquivos privados.
  As diferenças de Auth revisadas são timestamps de login e foto atualizada pelo Google.
- Manutenção HTTP 503 aplicada antes da barreira de gravação. Cada banco recebeu 52
  triggers temporários em tabelas de negócio/Auth/Storage; os quatro objetos excluídos
  eram ledgers gerenciados e tabelas vetoriais vazias. Sessões antigas e deployments
  antigos não conseguem gravar na origem. Esses triggers não são uma barreira contra
  um operador privilegiado que deliberadamente desative triggers/replicação.
- Backups finais criptografados dos dois bancos usam o mesmo snapshot exportado das
  respectivas auditorias. Ambos foram restaurados em containers sem rede: 56 tabelas
  comparadas integralmente, nenhuma diferença, índice ou constraint inválida.
- `cutover-final-gate.json` passou às `07:02:23Z`. A função temporária do destino foi
  removida com seus 52 triggers após verificar a lista exata de dependências: os schemas
  gerenciados permitem criar triggers, mas não removê-los diretamente pelo papel postgres.
  A origem continua congelada; o destino é a única fonte de novas gravações.
- Deployment inicial da troca: `dpl_D9ezz4godRNsC2wxq7uQh34xiLqL`. O runtime usa pooler
  transacional na porta 6543 e TLS com certificado verificado, incluído nos três handlers.
  Auth voltou aos redirects de produção, com Google/SMTP já validados e configuração
  de cadastros equivalente à origem. Usuários podem precisar fazer novo login.
- Smoke real em produção passou às `07:04:13Z`: login por senha, refresh, logout,
  consulta condicional, criação de workspace sintético, isolamento 403, anônimo 401,
  healthcheck profundo e download íntegro dos cinco arquivos. A conta e o workspace
  sintéticos foram removidos. Permaneceram 16 contas, 11 workspaces e 1.065 registros.
  O redirect Google foi confirmado; a conferência humana de um novo login Google no
  endereço definitivo foi solicitada separadamente e não deve ser inferida desse teste.
- Os três secrets do backup no GitHub apontam para o destino; a chave de criptografia
  permaneceu igual. O workflow [44475444350](https://github.com/mayalajesus/trackify/actions/runs/44475444350)
  concluiu backup, criptografia, upload e restauração isolada com sucesso.
- Exclusão automática de contas está pausada por `ACCOUNT_DELETION_MAINTENANCE_PAUSED=true`.
  Duas solicitações vencidas e uma cancelada foram preservadas; reativar a manutenção
  exige revisar o efeito dessas solicitações. Não foram canceladas nem executadas na troca.
- Os helpers de fixture, servidor candidato e importadores recusam os IDs de produção
  por regra versionada, além de `.env.migration.local` marcar o destino como produção.
  A extensão continua usando a mesma API; não houve alteração de código/ZIP da extensão.

Evidências locais ignoradas pelo Git: `cutover-source-final.*`, `cutover-target-final.*`,
`cutover-source-restore.json`, `cutover-target-restore.json`, `cutover-final-gate.json`,
`cutover-activated.json`, `cutover-production-smoke-*.json` e configurações anteriores
criptografadas. Nenhuma credencial ou linha de usuário deve entrar no repositório.

Após novas gravações, não promover o deployment antigo nem descongelar a origem sem
preservar e reconciliar os dados novos. A restrição de egress do Supabase antigo também
impede tratá-lo como fallback imediato de disponibilidade. O procedimento de retorno
e seus limites estão detalhados no fim deste documento.

| Papel                          | Projeto                | Organização            | Região      | PostgreSQL observado |
| ------------------------------ | ---------------------- | ---------------------- | ----------- | -------------------- |
| Origem em produção             | `qgqwvyprivwvffuewzmp` | `tqrklooeastcjlapztys` | `us-east-2` | 17.6                 |
| Destino informado pelo usuário | `gfedmrhckghmgssgfwis` | `ikatulnhqcjhppedbrzp` | `us-west-2` | 17.12                |

As credenciais locais do destino ficam em `.env.migration.local`, ignorado pelo Git.
O usuário também autorizou explicitamente enviar a credencial do banco novo a um
projeto Vercel temporário protegido para teste de leitura; esse projeto foi removido
e sua ausência confirmada com HTTP 404 após o teste. O token original recebeu 403;
o token fornecido para o destino recebeu 200 no
GET do projeto correto. Isso comprova acesso à API de gestão, não comprova ainda a
restauração ou a compatibilidade do banco. A diferença de região exige medir latência;
a diferença de versão exige revisar especialmente os schemas gerenciados.

O destino foi conferido vazio antes da importação. Após reiniciar somente esse projeto
vazio e receber `MIGRATION_TARGET_DATABASE_URL_DIRECT`, a conexão direta IPv6 com TLS
validado funcionou em aproximadamente 4,2 segundos; conexão e consulta de catálogo
totalizaram 7,65 segundos. A auditoria completa terminou. O session pooler apresentou
timeout em teste local, mas passou nas três leituras do teste posterior na Vercel,
assim como o transaction pooler. Os timeouts do app não foram aumentados. Essa medição
valida o caminho da hospedagem ao banco; não substitui medir os fluxos completos do app.

**Cópia de preparação importada em 19/11/2026, sem trocar produção.** A transação
terminou às `03:21:45Z`; uma auditoria independente posterior confirmou todos os dados
das 46 tabelas `public`/`auth`, incluindo IDs, hashes de senha, vínculos, histórico e
sequências. São 16 contas, 11 workspaces e 1.064 registros de horas. A restauração de
Storage também terminou: dois buckets privados e cinco arquivos, com bytes verificados
após download. Isso não substitui os testes funcionais nem a cópia final sob bloqueio
de escrita na origem.

O usuário confirmou nesta conversa que adicionou o callback Google
`https://gfedmrhckghmgssgfwis.supabase.co/auth/v1/callback`, mantendo o anterior.
Essa confirmação não substitui o teste ponta a ponta. A exportação de configuração
Auth contém representações de 64 caracteres hexadecimais nos segredos Google/SMTP,
e não credenciais reutilizáveis. A tentativa de copiar o campo Google falhou na
verificação; o valor foi removido do destino e Google permaneceu desabilitado. O segredo
real foi fornecido em `MIGRATION_GOOGLE_CLIENT_SECRET`, no arquivo local ignorado,
e aplicado ao destino. O usuário confirmou o login Google em `http://localhost:5189`
e a exibição de seus dados. A consulta posterior confirmou login na identidade importada,
16 contas, 16 perfis, 11 workspaces, 1.064 registros e nenhuma conta sintética restante.
Evidência: `target-google-login-confirmed-20261119.json`.
Não confundir presença de um campo na exportação com possibilidade de restaurar o segredo.

O candidato Auth usa somente callbacks `http://localhost:5189`, cadastros bloqueados e
notificações desabilitadas. SMTP foi restaurado somente no candidato. A origem usa Mailjet na
porta 587; o usuário SMTP coincide com a chave já disponível no `.env`, que também
contém a senha Mailjet real. Não reutilizar o campo SMTP redigido da exportação.
A autenticação SMTP com STARTTLS e validação de certificado passou usando essas
credenciais; nenhum comando MAIL/RCPT/DATA foi emitido e nenhum e-mail foi enviado.
Evidência inicial: `smtp-authentication-20261119.json`. A rodada posterior testou
envio e tokens reais: o usuário confirmou recebimento de confirmação, convite e
recuperação de senha (esta última no Spam). Foram usados aliases Gmail de teste,
pois o endereço-base fornecido já pertence a uma conta importada e não foi alterado.
O Mailjet listou recuperação e convite como `sent`; a confirmação é comprovada pelo
recebimento informado pelo usuário, não pelo relatório incompleto do provedor.
Evidências: `email-test-cbe0f192-6edc-4f79-8b80-9864d4df8e45.json` e
`email-user-receipt-20261119.json`. O teste automático de localização dos três eventos
no Mailjet falhou e foi preservado como tal; não confundir essa checagem com a prova
manual de entrega. A recuperação validou o token e o login com a senha nova sintética;
o convite foi aceito no candidato, e repetir a solicitação não reenviou a mensagem.
O link público do convite usa hostname reservado de teste: sua navegação externa não
foi validada. A aceitação foi exercitada diretamente no candidato local.

Foi corrigida uma diferença de configuração: o destino estava no limite padrão de
dois e-mails por hora, enquanto a origem usa 30. Os limites de Auth e a configuração
de CAPTCHA foram alinhados aos valores da origem, sem alterar produção ou remover
proteções. O SMTP permanece configurado no candidato; assuntos temporários de teste
são restaurados ao fim de cada execução. O fluxo normal do app local continua com
envio transacional automático desabilitado, para não reenviar mensagens históricas.
Uma repetição isolada da confirmação também não apareceu na listagem do Mailjet
(`email-test-036c912c-acae-4d3a-a69c-5c751f5cf760.json`); nenhum novo envio foi
necessário após o relato de recebimento. As duas rodadas removeram suas contas e
registros temporários, com igualdade de contagem/hash das 21 tabelas verificadas.
`email-config-production-check-20261119.json` confirmou os assuntos restaurados,
cadastros bloqueados, limite de 30 e-mails/hora e o mesmo deployment de produção.
A investigação de logs identificou desconexões de clientes durante autenticação; isso
não estabelece a causa da lentidão. Não atribuir o problema à senha, região ou banco
sem evidência adicional.

Não mudar as variáveis Production da Vercel, o domínio `watchtag.vercel.app`, os secrets
do backup vigente ou os clientes distribuídos durante a preparação. O Neon deixa de
ser o destino desta preparação; nenhuma migração para ele foi executada.

## Validação hospedada e ensaio do endereço definitivo — 19/11/2026

O usuário autorizou prosseguir com os testes hospedados sem trocar a produção.
`scripts/supabase-migration-hosted.mjs` cria um projeto Vercel separado, protegido
inclusive no alias estável, sem cron e sem envio de e-mails transacionais. Envia
somente os arquivos necessários ao app e as credenciais do candidato. Restaura os
redirects temporários do Auth e remove o projeto ao terminar, verificando HTTP 404.
As evidências com segredos ficam criptografadas em `backup/migration-preparation`.

O modo `definitive` usa o domínio `watchtag.vercel.app` apenas no navegador isolado:
as requisições são encaminhadas ao projeto temporário. O backend antigo e outros
hosts são bloqueados; os testes de transporte confirmam esse isolamento. Tokens
de e-mail são verificados no Auth real do candidato, mas o redirect final é iniciado
como uma navegação nova interceptada, para nunca escapar para o site de produção.
Isso é um ensaio controlado da origem final, não uma publicação nem um teste público
depois da troca. O deployment e `updatedAt` do projeto de produção são comparados
antes e depois de cada rodada.

### Problemas encontrados durante a preparação

- O pacote temporário inicialmente não incluía `shared/`; o build recusou a ausência.
  A lista de arquivos foi corrigida e os builds seguintes passaram.
- A proteção padrão da Vercel deixava o alias estável público. O teste recusou HTTP 200,
  e a configuração foi corrigida para proteger todos os deployments e aliases.
- O retorno de links Auth perdia o header de bypass nos redirects HTTP. A automação
  agora usa o cookie oficial de bypass no hostname privado antes de abrir o link.
- A rodada `hosted-092e2f5ef2d1` reproduziu HTTP 500/`XX000`. Seis conexões somente
  leitura ao candidato retornaram a mensagem explícita `EMAXCONNSESSION`: o pool de
  sessões estava no limite de 15 clientes. Evidência:
  `hosted-session-pool-diagnostic-20261119.json`. O runtime temporário passou a usar
  o pool de transações na porta 6543, mantendo migração/backup na conexão direta ou
  de sessão. O código usa consultas sem prepared statements nomeados e locks
  transacionais; não depende de LISTEN ou estado de sessão entre transações.
  A nova execução deve passar sem nenhum HTTP 5xx antes de ser aprovada.

A primeira rodada com pool de transações (`hosted-c78f84e94c1d`) passou nos nove
fluxos principais do navegador: tarefas, descarte, edição, offline, conflito,
relatórios e permissões. Nas 108 respostas observadas não houve HTTP 5xx; três
HTTP 409 correspondiam ao cenário deliberado de conflito. Confirmação de conta e
retorno para a tela de senha abriram corretamente, mas a automação buscava um ID
que o componente de formulário não usa. O seletor foi corrigido para o rótulo
acessível; essa rodada permaneceu marcada como incompleta.

O ensaio `hosted-ad4c8494ee2f` interrompeu ao fechar um contexto do navegador com
uma requisição do proxy ainda em andamento. A falha era da automação; o proxy agora
trata o cancelamento durante fechamento, permanece instalado até o contexto fechar
e reprova falhas fora desse encerramento. Um teste unitário cobre as duas situações.
A limpeza da rodada interrompida foi recuperada pelos IDs e metadados sintéticos,
com igualdade das 21 tabelas confirmada em
`browser-a0073782-07ab-4cf9-a4d4-a28e6f5cad8b.recovered-cleanup.json`.

As execuções com falha foram mantidas como falha. A limpeza confirmou igualdade de
contagem e hash nas 21 tabelas de dados/contas/Storage verificadas; os projetos
temporários foram removidos e a produção permaneceu no mesmo deployment.

### Ensaio completo do domínio definitivo aprovado

Em `2026-11-19T05:45:26Z`, `hosted-bfdabbb3c64d.json` terminou sem falhas. O navegador
`browser-2255d37b-21f4-48c3-bb13-f1932cfbf74c.json` passou nos 17 cenários:

- CRUD de cliente/projeto; cronômetro vazio e reload; conclusão e descarte;
  edição de texto; reconexão offline e parada sem duplicação; conflito real.
- Permissões Owner/Admin/Member; downloads CSV/XLSX/PDF; logo privado incorporado
  ao PDF; upload, substituição e remoção de avatar; logout com token rejeitado.
- Confirmação de conta, recuperação no formulário e login com a senha nova;
  link consumido recusado; convite com login e aceitação sem membro duplicado.
- Redirecionamento ao provedor Google; API da extensão com Origin Chrome, criação
  de sessão, renovação, início/pausa/conclusão e revogação; solicitação e cancelamento
  de exclusão apenas da conta sintética. Interface do Trello não automatizada.
- 900 registros sintéticos, três usuários e seis requisições simultâneas. Nas 24
  amostras: p50 849 ms, p95 1.993 ms, máximo 2.189 ms. Respostas condicionais sem
  mudança transferiram 99,93% menos bytes em média que as respostas completas.
  Isso mede o payload nesse teste limitado, não a redução de todo o egress mensal
  nem capacidade máxima de produção. Membro recebeu somente seus registros.

As 104 respostas de API observadas no navegador não tiveram HTTP 5xx; três HTTP 409
eram conflitos intencionais do teste. Os fluxos adicionais também recusam qualquer
erro 5xx. A limpeza conferiu contagens e hashes de 21 tabelas de dados, contas e
Storage; o projeto temporário foi removido (GET 404), os redirects Auth restaurados
e a produção permaneceu no deployment `dpl_4eLCxyShnqQ4SB6gk2cwpyYunkTT`.

O ensaio usa a origem final em proxy privado, conforme a limitação acima. O teste
Google real na hospedagem protegida e o teste público após a troca são verificações
distintas; não tratar o redirect automático ao Google como login completo.

### Hostname protegido e última conferência Google

Os oito fluxos adicionais passaram novamente, agora com redirects HTTP reais no
hostname protegido `trackify-migration-app-3655184aef01.vercel.app`. Evidência:
`browser-994c1d3f-6ebb-413c-9ca2-f83af60170c9.json`, concluída às `05:48:13Z`.
O teste usou somente fixtures sintéticas; sua limpeza confirmou as mesmas 21 tabelas.
Na carga limitada: p50 843 ms, p95 2.367 ms, máximo 2.729 ms; redução de 99,93% no
payload das respostas condicionais. Imagens privadas, links de senha/convite,
renovação/revogação da extensão e logout passaram pela API hospedada.

O usuário respondeu **“Entrei e meus dados apareceram”** à conferência da hospedagem.
A confirmação manual foi registrada em `hosted-3655184aef01.google-result.json` às
`06:05:03Z`. O script terminou sem falhas às `06:05:08Z`, restaurou os redirects Auth
e removeu o projeto temporário `prj_Wvmi00vpQauXhctDdvV6yVtjiVYa` (GET posterior 404).
O link temporário deixou de funcionar como parte dessa limpeza; o banco candidato
foi preservado.

A auditoria independente de encerramento (`hosted-validation-complete-20261119.json`,
`06:07:49Z`) confirmou igualdade das 21 tabelas da baseline hospedada: 16 contas e
perfis, 11 workspaces, 1.065 registros, cinco arquivos e três pedidos de exclusão,
sem usuários sintéticos restantes. Deployment, `updatedAt` e hash do HTML público
da produção permaneceram iguais.

**Limite da evidência Google:** a confirmação acima é o relato explícito do usuário.
A checagem adicional de `auth.users.last_sign_in_at` não encontrou um novo login
Google após `05:48:13Z`; o último timestamp é `03:48:06Z`, do teste anterior. Portanto,
o acesso hospedado está confirmado manualmente, mas os timestamps não comprovam
independentemente um novo ciclo OAuth nessa hospedagem. Não foi inferido o motivo
da ausência desse evento. O teste automático do redirect ao Google e o login local
anterior continuam sendo evidências separadas. Essa distinção deve acompanhar a
revisão de prontidão; não há garantia de risco zero ou autorização de troca.

### Alteração pré-existente na cópia de validação

A cópia tinha 1.064 registros após a importação. Antes de qualquer teste hospedado,
às `04:57:42Z`, uma conta existente criou um registro de teste de sete segundos no
candidato. Todas as baselines hospedadas, desde `05:12:36Z`, já tinham **1.065**
registros. A consulta somente leitura na origem confirmou que esse ID não está lá.
Ele foi preservado, inclusive em arquivo criptografado; nenhum teste o removeu.
Evidência: `candidate-pretest-extra-entry-20261119.json` e `.enc`.

A contagem pós-ensaio é 16 contas/perfis, 11 workspaces, 1.065 registros, cinco
arquivos e três pedidos de exclusão, sem usuário sintético restante. Não sobrescrever
o candidato com o snapshot final ignorando esse registro: a reconciliação deve
preservá-lo ou obter uma decisão explícita sobre sua natureza de teste. A igualdade
de hashes durante os testes comprova preservação da baseline hospedada; não equivale
a paridade atual e integral entre origem e candidato.

Também foram comparadas preferências e configurações do workspace com a origem:
as diferenças eram somente `updated_at`, no mesmo instante do registro de sete
segundos. Os valores das configurações não mudaram. As diferenças foram guardadas
criptografadas em `candidate-pretest-preferences-differences-20261119.enc`.
Foi gerado outro backup consistente às `05:50:02Z`, com dump e auditoria das 57
tabelas usando o mesmo snapshot: `target-after-hosted-20261119.*`.
A restauração desse backup em container local sem rede passou nas 56 tabelas
restauráveis, sem diferenças, índices inválidos ou constraints inválidas. O container
foi removido. Evidência: `target-after-hosted-restore-20261119.json`.

## Arquitetura e dependências encontradas

- React/Vite usa Supabase Auth; o ID autenticado é também `public.profiles.id` e a chave
  dos rascunhos locais. Preservar os IDs evita criar contas vazias e perder o vínculo
  com alterações que ainda estão nos navegadores.
- `/api/data` na Vercel acessa PostgreSQL com `pg`, pool de até 5 conexões por instância,
  autorização por usuário/workspace e transações. Consultas autenticadas também podem
  atualizar perfil, rate limits e e-mails; abrir uma cópia do app não é teste somente leitura.
- Tokens Supabase ES256/RS256 usam JWKS e verificação de sessão ativa no banco; tokens
  HS256 antigos dependem do serviço Auth. Copiar tokens não comprova que o login funciona
  no novo emissor. Planejar novo login, já aceito pelo usuário.
- Avatares e logos usam buckets privados, políticas RLS e URLs assinadas. URLs antigas
  não são arquivos nem devem continuar sendo emitidas pelo novo projeto.
- A extensão 0.6.18 usa a API do site e credenciais próprias em `extension_sessions`.
  Seu manifest aponta para `watchtag.vercel.app`, sem conexão direta ao Supabase.
  Preservar registros, hashes, expirações e revogações e testar renovação da extensão.
- E-mails transacionais usam Mailjet e uma tabela de deduplicação. Auth/recuperação
  usam configuração SMTP separada. Não reenviar mensagens históricas na cópia.
- Existe cron diário de exclusão de contas em `vercel.json`. Há duas solicitações
  pendentes com prazo vencido; não ativar o cron no candidato antes da revisão de seu
  comportamento. Não cancelar solicitações legítimas nem excluir dados como parte do teste.
- A API de gestão retornou nenhuma Edge Function implantada; há código legado no
  repositório e uma orientação antiga de deploy. Não implantá-lo automaticamente.
- A publicação `supabase_realtime` existe, sem tabelas publicadas no inventário.
  Não foi encontrado uso de canais Realtime pelo app atual.
- Há 35 entradas no ledger `public.schema_migrations`, 19 tabelas públicas e 48 índices
  públicos. A consulta inicial encontrou 30 FKs, 49 CHECKs e 8 UNIQUEs, todos validados,
  e nenhum índice público inválido. Não há FK pública apontando para outro schema.
- Avatares e logos são referenciados por `avatar_path`/`logo_path`; o servidor gera URLs
  assinadas para o projeto configurado. Foi preparada uma correção local para incluir
  o provedor e o projeto do servidor nas revisões condicionais. Testes confirmam que
  trocar o projeto invalida imagens antigas, preserva o cache no mesmo projeto e não
  perde edições de texto pendentes durante a reconciliação. A correção ainda não foi
  publicada. Um conflito real, inclusive edição concorrente de imagem, continua
  preservando ambas as versões para revisão; não apagar rascunhos para trocar de banco.

## Evidência inicial da origem

Inventário somente leitura, snapshot `2026-11-19T02:02:33.693Z` (23:02 de 18/11 na Bahia).
Foram capturadas contagens e assinaturas de 57 tabelas em `public`, `auth`, `storage`
e `vault`; os relatórios locais não contêm os registros, senhas ou tokens.

| Tabela pública            | Registros |
| ------------------------- | --------: |
| account_deletion_requests |         3 |
| active_timers             |         0 |
| api_rate_limits           |        54 |
| clients                   |        29 |
| extension_sessions        |        12 |
| legal_acceptances         |        16 |
| profiles                  |        16 |
| project_members           |        73 |
| projects                  |        89 |
| read_revisions            |         0 |
| schema_migrations         |        35 |
| task_invitations          |        21 |
| time_entries              |     1.064 |
| transactional_emails      |        25 |
| user_preferences          |        16 |
| workspace_invitations     |        15 |
| workspace_members         |        21 |
| workspace_settings        |        11 |
| workspaces                |        11 |

Auth: 16 usuários, 16 identidades (14 Google e 2 e-mail), 22 sessões e 1.048 refresh
tokens. Há 4 usuários com hash de senha, sendo 2 sem Google. Não recriar esses usuários
com IDs novos nem exigir redefinição de senha por uma limitação específica do Neon:
entre Supabase é possível preservar os hashes existentes. As configurações de segurança
e os vínculos devem ser conferidos antes de permitir qualquer login.

O snapshot tem `vault.secrets=0`. Não copiar chaves do provedor, extensões internas ou
estado de infraestrutura como se fossem dados da aplicação. Inventariar as diferenças
e manter a exportação original intacta para auditoria e retorno.

### Imagens e backup já verificados

Backup GitHub da execução `44297203284`, artefato criado em `2026-11-18T11:45:08Z`.
A verificação independente em memória validou os 9 arquivos de `SHA256SUMS` e os 5
objetos do manifesto: 1 avatar + 4 logos, total 94.688 bytes. Os 5 tamanhos e ETags
coincidiram com os metadados atuais do Storage; nenhuma ausência ou alteração posterior
ao backup foi encontrada nessa conferência. O download direto do Storage retornou 402.

Essa evidência valida os arquivos daquela cópia; não substitui um backup final
consistente do banco nem um teste de restauração no destino. O workflow histórico
inclui restauração local e teve sucesso, mas precisa ser complementado pelas verificações
de integridade referencial, permissões e comportamento descritas abaixo.

Foi guardada uma cópia independente e criptografada desse artefato em
`backup/migration-preparation/github-production-backup-44297203284.zip`, com tamanho
264.565 bytes e SHA-256 conferido contra o digest fornecido pelo GitHub. O conteúdo
criptografado não foi substituído nem publicado no Git.

### Backup atualizado e ensaio de restauração

Foi gerado `source-20261118.dump.enc`, com 539.813 bytes antes da criptografia, usando
`pg_dump` PostgreSQL 17 fixado por digest. A leitura usou TLS `verify-full`, timeout
de lock e `default_transaction_read_only=on`. O Docker local não alcançou o endpoint
IPv6 direto da origem; o backup foi realizado pelo session pooler oficial, sem alterar
a URL de produção no `.env`.

A criptografia autenticada AES-256-GCM com scrypt foi conferida por descriptografia em
memória; o formato é específico desta preparação e não substitui o formato do workflow
histórico. O `pg_restore` leu os 660 itens do TOC, descompactou todos os blocos e confirmou
a presença de dados das 57 tabelas. Os bytes das imagens são preservados separadamente.

O script `scripts/supabase-migration-restore-rehearsal.mjs` restaurou 56 tabelas dos
schemas `public`, `auth` e `storage` em PostgreSQL temporário:

- Container sem rede, sem portas publicadas e com dados exclusivamente em tmpfs;
  removido ao terminar. Não usa o QA existente nem o projeto destino.
- Restauração em transação única, interrompida em qualquer erro.
- Todas as contagens e assinaturas de registros coincidiram com o inventário da origem.
- Nenhum índice inválido e nenhuma constraint não validada.
- Roles auxiliares foram criadas sem login. O ensaio não testa autenticação, regras de
  autorização dos serviços Supabase ou leitura dos bytes no Storage.
- `vault.secrets=0` foi excluído do ensaio local: o Vault depende de extensão gerenciada.

Os relatórios estão em `backup/migration-preparation/`, ignorado pelo Git. SQL, senhas,
tokens e registros descriptografados não foram gravados em arquivos do host. O decoder
de `pg_restore` usa um arquivo temporário em RAM, em container sem rede, removido ao
terminar. As configurações de Auth e os metadados de roles dos dois projetos também
foram preservados criptografados; senhas das roles gerenciadas e os segredos reais
Google/SMTP não podem ser recuperados dessa exportação de configuração.

### Restauração no candidato e permissões

`scripts/supabase-migration-stage.mjs` seleciona explicitamente dados Auth, objetos
públicos, dois triggers Auth e oito políticas Storage. Mantém as constraints Auth
ativas e ordena as tabelas pelas dependências; verifica hashes completos antes do COMMIT.
Os schemas e ledgers gerenciados são preservados. Os arquivos são carregados pela API
Storage com `upsert: false`, nunca sobrescritos silenciosamente.

- Uma tentativa anterior foi desfeita porque `postgres` não pode reaplicar default
  privileges de `supabase_admin`. Foi confirmado que não ficaram contas/tabelas parciais.
  `setval` não é transacional: a sequência Auth avançou para o valor restaurado 1.151.
- A versão corrigida preserva schema/default ACLs já idênticos. O destino aplica grants
  adicionais ao criar objetos: foram removidos de `extension_sessions`, `read_revisions`,
  `bump_read_revision` e `track_read_revision`, conforme as restrições exatas da origem.
  A verificação agora compara também ACLs de cada tabela e função pública antes do COMMIT.
- Foi mantido o helper gerenciado `rls_auto_enable`/evento `ensure_rls`, validado por hash.
  Ele habilitou RLS em `public.schema_migrations`, que não tem acesso de cliente no app;
  esta proteção mais restritiva é intencional. Todos os demais estados RLS coincidem.
- Em `workspace_settings`, posições físicas das colunas mudaram porque `pg_dump` omite
  colunas anteriormente removidas. Nomes, tipos, defaults, constraints e dados coincidem.
- Storage gera novos IDs/versões/timestamps internos. Os caminhos usados pelo app,
  configurações privadas dos buckets e bytes das cinco imagens foram preservados.

Evidências principais: `target-staging-result-20261119-attempt3.json`,
`target-staged-audit-20261119.json`, `target-privileges-verified-20261119.json` e
`target-storage-restored-20261119.json`, dentro de `backup/migration-preparation/`.

### Ensaio funcional com conta sintética

`scripts/supabase-migration-service-test.mjs` passou no destino real, usando uma conta
criada por Admin Auth sem enviar e-mail. A conta e seu workspace eram exclusivos do
ensaio; uma evidência criptografada identificou os objetos para limpeza restrita.

- Login por senha, renovação de sessão, recuperação por link gerado sem envio de
  e-mail, alteração de senha sintética e novo login funcionaram.
- O app carregou a conta e respondeu `notModified` à leitura condicional seguinte.
- A API negou acesso ao workspace de outra pessoa; a API REST com RLS também não
  retornou workspaces alheios.
- Criação de workspace, conexão/renovação da extensão, início/pausa/encerramento do
  cronômetro e revogação da sessão passaram. A credencial revogada recebeu 401.
- Os cinco arquivos responderam por URL assinada do destino, com conteúdo conferido.
  Acesso anônimo e acesso pela conta sintética sem vínculo foram negados.
- A limpeza removeu exclusivamente a conta e os registros sintéticos. Ao terminar,
  todos os dados das 46 tabelas públicas/Auth e ACLs públicas coincidiram novamente
  com o snapshot da origem. A sequência Auth avançou por alocações legítimas do ensaio;
  não foi retrocedida. Os testes não apagaram nem recriaram contas reais.

Evidência: `service-test-640a3759-9312-4824-9627-4432109699eb.json`, concluído às
`2026-11-19T03:43:54Z`. Duas tentativas anteriores revelaram pré-condições faltantes
no próprio teste (aceite de termos e período obrigatório); ambas limparam a conta
sintética e verificaram os dados antes da repetição.

Os tempos observados partem do Windows local: conta 9,5–11,4 s; leitura condicional
4,4 s; criação de workspace 16,2 s; ações do cronômetro 7,9–10,4 s. Isso é evidência
funcional, não aprovação de desempenho em produção. A medição na hospedagem permanece
obrigatória. O servidor local bloqueia `.env*` e `backup/**` com HTTP 403 e não ativa
cron, Mailjet ou Sentry. Não usar a conta real para gravar dados de trabalho nessa cópia.

Novos testes de conectividade, com timeouts do app mantidos, tiveram estes resultados:
direta 3,6 s (sucesso), session pooler nativo 10 s (timeout), transaction pooler nativo
8,4 s (sucesso), session pooler pelo Docker 7,6 s (sucesso). O endpoint e a senha do
pooler foram conferidos. Isso confirma intermitência no caminho, sem atribuir causa
definitiva. Não publicar a URL direta IPv6 como solução presumida para Vercel: testar
o caminho IPv4 do pooler a partir da hospedagem antes da troca.

Validação local do código: 47 testes Node e os 387 testes Vitest de domínio passaram;
TypeScript, ESLint e build passaram. O build local desativou o upload de sourcemaps
para Sentry. A correção de cache, ferramentas e evidências de
preparação ainda não foram commitadas/publicadas.

### Teste isolado na Vercel e backup do destino

O usuário autorizou o projeto temporário, a transferência da credencial do banco novo
e sua remoção após o teste. `scripts/supabase-migration-cloud-probe.mjs` publicou apenas
uma função de leitura em projeto separado, com proteção da Vercel e um token adicional
com validade de uma hora. Não publicou o app, cron, serviços de e-mail ou domínio atual.

A primeira publicação de um projeto novo recebeu o rótulo `production` da Vercel,
inclusive com `target: staging`. Tentativas anteriores pararam nessa checagem e
removeram seus projetos. A checagem final usa o ID e a URL exclusivos do projeto
temporário, a proteção de acesso e a identidade da publicação original. As variáveis
temporárias foram configuradas somente nesse projeto isolado, nos dois escopos que a
primeira publicação pode usar; nenhuma variável do projeto Trackify foi alterada.

Resultado em `cloud-probe-80edce05a9af.json`, concluído em `2026-11-19T04:04:55Z`:

- Seis requisições passaram em `iad1`: três por session pooler (5432) e três por
  transaction pooler (6543), sempre em transações `REPEATABLE READ READ ONLY` com TLS.
- Cada requisição conferiu 16 perfis, 11 workspaces e 1.064 registros de horas.
- Conexão inicial: 401 ms no session pooler e 378 ms no transaction pooler.
  As demais reutilizaram a conexão. Cada consulta amostrada levou 61–63 ms.
- Cada conjunto de leituras levou 547–975 ms. São consultas pequenas com contagens,
  não uma medição do carregamento completo, concorrência ou percentis de produção.
- Acesso sem credencial da Vercel retornou 401; com bypass mas sem token da função,
  também 401. Não foram retornados registros individuais nem segredos.
- O projeto foi excluído ao terminar; consulta independente confirmou HTTP 404.
  A publicação original permaneceu `dpl_4eLCxyShnqQ4SB6gk2cwpyYunkTT`.
  Evidência adicional: `cloud-cleanup-confirmed-20261119.json`.

`scripts/supabase-migration-consistent-backup.mjs` gerou um backup criptografado novo
do destino e uma auditoria compartilhando o mesmo snapshot exportado do PostgreSQL.
Isso evita diferenças falsas quando o Auth renova sessões durante o backup. O dump
direto usa ponte local IPv6, mantendo verificação TLS de certificado e hostname.

O ensaio de restauração posterior conferiu todos os registros das 56 tabelas
`public`/`auth`/`storage`: nenhuma diferença, nenhum índice inválido e nenhuma
constraint não validada. O PostgreSQL temporário era local, sem rede, e foi removido.
Evidências: `target-consistent-20261119.consistency.json`,
`target-consistent-20261119.dump.enc` e `target-local-restore-20261119.json`.
Os bytes das cinco imagens continuam preservados no backup criptografado separado
e foram conferidos no destino. O workflow de backup vigente não foi redirecionado;
configurar/agendar o backup do novo ambiente faz parte da futura troca autorizada.

### Integração SQL ampliada

`scripts/supabase-migration-sql-tests.mjs` passou nos oito grupos contra o candidato:
sincronização, concorrência real entre conexões, permissões, tarefas em conjunto,
cronômetro da extensão, conexões/revogação, exclusão de workspace e leituras condicionais.
Usa registros sintéticos com rollback ou limpeza restrita a IDs gerados para o teste.
O helper recusa o projeto de produção e exige o ID exato do candidato e TLS verificado.

Uma primeira tentativa de concorrência excedeu o prazo do teste que mantém um lock
deliberadamente enquanto executa várias consultas pela rede local. O fixture remanescente
foi identificado por nome, data, domínio de teste, workspace e ausência em Auth;
foi preservado criptografado e removido. O teste passou após ajustar somente seus
timeouts (90 s no servidor / 120 s no cliente) e tornar a limpeza resistente à falha
de rollback. Os limites do app não foram modificados.

A conferência posterior encontrou os mesmos dados em 18 tabelas públicas e nos campos
estáveis das contas Auth; nenhuma diferença nas contas e registros originais. Contadores
de requisições e sessões Auth podem avançar legitimamente com o candidato aberto e não
são tratados como perda de dados. Evidência: `sql-tests-6feb3711-c835-48c5-8eca-68c87cb9adb3.json`.
A sincronização já havia passado em `sql-tests-2ef2c68f-9b6a-4815-bda7-59cf39f28925.json`;
esse relatório também preserva a falha inicial, sem reclassificá-la como sucesso.

O teste de leituras, com mil lançamentos sintéticos e 20 repetições por cenário,
confirmou redução superior a 90% nos bytes de linhas transferidos, sem reler o histórico
em consultas sem mudanças, e verificou o limite de latência previsto no teste.
Não equivale a um teste de carga multiusuário em produção.

### Fluxos no navegador do candidato

`scripts/supabase-migration-browser-test.mjs` usa Chromium em contexto separado, com
contas sintéticas Owner/Admin/Member. As requisições do navegador ficam restritas ao
localhost e ao projeto novo. Não utiliza a sessão real do usuário nem mocks de API.

Foram verificados no navegador e por leitura do banco:

- Criação de cliente e projeto pela interface.
- Início do cronômetro vazio, preservação após recarregar e conclusão exigindo tarefa
  e projeto, gerando exatamente um registro válido.
- Descarte sem gerar registro de horas.
- Edição de título e observação no meio do texto, preservando a posição do cursor.
- Edição offline salva ao reconectar sem revisão; encerramento offline salvo uma vez,
  mesmo após eventos repetidos de reconexão e recarregamento.
- Edição concorrente do mesmo campo exige escolha explícita; a versão do servidor
  permanece intacta enquanto a escolha não é feita.
- Download real dos três formatos com o período selecionado. Os dois registros e
  seus 29 segundos totais coincidem em CSV e Excel; as horas e os valores decimais
  do XLSX são células numéricas. O PDF foi aberto pelo parser e possui uma página.
- Login e carregamento de Projetos, Clientes, Equipe, Relatórios e Configurações
  com Admin e Member; Owner também exerceu as gravações anteriores.
- Upload, download, substituição e remoção de avatar sintético no bucket privado.
  A troca removeu o objeto anterior; logout invalidou a sessão para a API (401).
- Solicitação de exclusão da conta Member sintética bloqueou a leitura (423);
  cancelar devolveu o acesso (200). Nenhuma exclusão definitiva foi executada.

Os cenários offline montam o StoreProvider/RecoveryDialog reais na página de fixture,
usando Auth, rede, API e banco reais do candidato. Não equivalem a ensaio de cada tela
offline. Evidência dos arquivos: `browser-95904836-0629-44fa-b5e9-f9da29a514e4.export-validation.json`.
A primeira tentativa parou por seletor ambíguo do teste (dois botões “Novo cliente”
na lista vazia); a limpeza comprovou 21 tabelas inalteradas antes da nova rodada.

A execução final passou nos 11 cenários e removeu as três contas sintéticas, workspace,
registros e imagens de teste. Contagens e hashes das 21 tabelas verificadas coincidiram
antes/depois. Evidência: `browser-95904836-0629-44fa-b5e9-f9da29a514e4.json`.
Os dois HTTP 409 registrados são rejeições esperadas das edições conflitantes;
nenhum HTTP 500 ocorreu. Os cenários offline abortam requisições deliberadamente.

Tempos HTTP do navegador local: `loadAccount` mediana 8,2 s / p95 10,5 s;
`syncAccount` mediana 21,6 s / p95 24,0 s. Esses tempos incluem o caminho Windows →
banco remoto, não representam a hospedagem Vercel. Não aprovar a performance do app
com base apenas nos probes pequenos da Vercel; a medição do app completo hospedado
e de concorrência multiusuário continua sendo uma condição para a troca.

A conferência independente final às `2026-11-19T04:54:39Z` confirmou 16 contas/perfis,
11 workspaces, 1.064 lançamentos, cinco imagens e as três solicitações de exclusão
originais, sem contas sintéticas remanescentes. Nenhum container do ensaio ficou ativo.
O deployment de produção continuou `dpl_4eLCxyShnqQ4SB6gk2cwpyYunkTT`.
Evidência: `final-flow-validation-20261119.json`. Os dois pedidos de exclusão vencidos
continuam preservados e exigem tratamento conforme a regra existente antes de ativar cron.

### Diferenças gerenciadas já identificadas

- As 84 linhas de `auth.schema_migrations` coincidem integralmente.
- As 81 migrações de Storage coincidem em ID, nome e hash; os timestamps de execução
  diferem entre projetos. Preservar o ledger do destino.
- O default de `auth.oauth_authorizations.expires_at` é o mesmo (`now() + 3 minutos`);
  o hash inicial divergiu porque a auditoria usou `intervalstyle=iso_8601` e a API usou
  o formato padrão. Isso é diferença de representação, não de regra de expiração.
- As oito políticas de Storage e os dois triggers customizados em `auth.users` foram
  restaurados e coincidiram na auditoria posterior.
- A extensão Vault passou de 0.3.1 para 0.3.2; duas definições de funções diferem.
  Não sobrescrever as funções gerenciadas com a versão antiga. O Vault da origem está vazio.
- Fora desses pontos, a comparação de metadados gerenciados não encontrou diferenças
  de colunas, tipos, índices, constraints ou permissões. Isso não é a validação de dados
  do destino nem validação funcional dos serviços.

## Ferramenta de comparação preparada

`scripts/supabase-migration-audit.mjs` tem somente `capture` e `compare`; não contém
comandos de importação, exclusão, mudança de configuração ou publicação.

- Exige variável explícita `MIGRATION_SOURCE_DATABASE_URL` ou
  `MIGRATION_TARGET_DATABASE_URL`; não usa `DATABASE_URL` do QA por fallback.
- Confere referência exata no host direto ou usuário do session pooler Supabase.
  Recusa transaction pooler, outros hosts e opções que contornem TLS.
- Usa TLS com verificação de certificado e hostname. Aceita a CA pública em
  `MIGRATION_SOURCE_CA_FILE`/`MIGRATION_TARGET_CA_FILE` quando necessário.
- Abre `REPEATABLE READ READ ONLY`, limita tempo de consulta e lock, define timezone
  e formatação estáveis e usa `row_security=off` para falhar em vez de auditar uma
  seleção silenciosamente filtrada por RLS.
- Compara assinaturas SHA-256 dos registros completos, incluindo duplicados,
  independentemente de sua ordem física. Não basta comparar contagens.
- Inventaria colunas, ACLs, constraints, índices, políticas, funções, triggers, tipos,
  sequências e publicações; corpos SQL são representados por hash no relatório.
- Recusa dados parciais, tabelas acima do limite ou estruturas que demandem outra
  estratégia (partições, foreign tables, materialized views). Não omite erros.
- Salva evidências com criação exclusiva em `backup/`, ignorado pelo Git.
- Mesmo com igualdade, retorna `productionCutoverAuthorized: false`.

Exemplos após carregar as variáveis corretas no processo, sem expor segredos:

```text
node scripts/supabase-migration-audit.mjs capture --side source --project-ref qgqwvyprivwvffuewzmp --output backup/migration-preparation/source-final.json
node scripts/supabase-migration-audit.mjs capture --side target --project-ref gfedmrhckghmgssgfwis --output backup/migration-preparation/target-final.json
node scripts/supabase-migration-audit.mjs compare --source backup/migration-preparation/source-final.json --target backup/migration-preparation/target-final.json
node --test tests/integration/migration-audit-unit.mjs
```

A CA foi obtida em uma revisão fixa de ferramenta oficial Supabase:
`supabase/instantdb-to-supabase`, commit `1e1894b4c50f7a5a7f14833710dd8fc39f199734`,
arquivo `src/workflow/supabase-ca.ts`. SHA-256 do certificado:
`807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.
O download do bucket oficial expirou; não foi desativada a verificação TLS.

## Etapas e condições obrigatórias

### 1. Preservar a origem e identificar o destino

Confirmar que o destino está vazio de dados de usuário e é da organização informada.
Guardar backup criptografado independente, inventário e revisão exata do app. Validar
arquivos, Auth, sequências e restauração. Registrar contagens antes/depois e abortar em
qualquer registro rejeitado. Não exportar dados reais para o QA existente; o destino é
um candidato de produção com acesso restrito e segredos próprios.

### 2. Preparar o candidato isolado

Comparar versões PostgreSQL, Auth e Storage e capacidades antes da importação. Usar o
procedimento oficial Supabase de restauração com falha em qualquer erro. Revisar
separadamente roles, mudanças customizadas em `auth`/`storage` e ledger gerenciado:
não sobrescrever cegamente `auth.schema_migrations` ou `storage.migrations` de uma
versão mais nova para imitar a versão da origem. Diferenças precisam de explicação
registrada e teste, nunca de um filtro genérico que as esconda.

Restaurar dados da aplicação e usuários com os mesmos IDs, hashes de senha, timestamps,
nulos, valores financeiros, preferências, membros removidos, lixeira e estados dos
convites. Restaurar imagens com mesmos paths, MIME types e buckets privados. Validar
as referências e emitir URLs assinadas pelo novo projeto.

Não copiar a chave privada de assinatura para tentar manter sessões. Planejar novo
login; validar JWTs do novo emissor, renovação, logout, senha e Google. Configurar Google,
site URL, redirects exatos, SMTP, CAPTCHA, limites e templates; manter as configurações
do projeto original. Não enviar e-mails de teste a usuários reais.

O candidato deve usar hostname próprio protegido, sem domínio de produção, cron de
exclusão ou disparos transacionais automáticos. Preferir projeto Vercel separado com
controle explícito de acesso e nenhuma promoção automática. Testes CRUD usam apenas
contas/registros sintéticos identificados; testes de leitura de usuários reais não
devem disparar escritas invisíveis. Comparar antes dos testes e registrar separadamente
os efeitos esperados dos testes para não falsificar a paridade inicial.

### 3. Resultado dos ensaios antes da troca

| Área         | Condição para liberar                                                                 | Estado atual                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Dados        | Mesmos IDs, valores e relações; nenhum registro descartado                            | Cópia conferida; registro extra preservado; reconciliação e snapshot final pendentes                              |
| Auth         | Mesmas contas e senhas; Google ponta a ponta; conta e-mail; renovação/logout          | Google local e senha/links passaram; acesso hospedado confirmado pelo usuário, com limite de evidência registrado |
| Segurança    | Membro/admin/owner; isolamento entre workspaces; anônimo negado; buckets privados     | RLS/isolamento passaram; telas com Owner/Admin/Member abriram                                                     |
| Imagens      | 5 arquivos íntegros, carregamento, troca e remoção; links novos                       | 5 arquivos íntegros; CRUD de avatar e logo no PDF hospedado passaram                                              |
| Tarefas      | Criar, editar, iniciar vazio, pausar, encerrar, descartar, favoritos e convidados     | Fluxos UI e SQL passaram; favoritos e convites exercitados pela API/SQL                                           |
| Concorrência | Duas abas, dois usuários, conflitos reais, convites expirados                         | SQL e conflito real no navegador passaram; servidor preservado                                                    |
| Offline      | Reconexão, replay idempotente, rascunho antigo e cronômetro em andamento              | Reconexão, replay e cronômetro reais passaram; rascunhos antigos cobertos por regressões locais                   |
| Relatórios   | Filtros, permissões, totais, PDF/Excel/CSV e imagens                                  | CSV/XLSX/PDF, totais e logo privado no PDF passaram                                                               |
| Extensão     | Sessão existente, refresh, reconectar, Trello, criar e encerrar tarefa                | API hospedada: conexão, refresh, cronômetro e revogação passaram; UI Trello não rodada                            |
| E-mails      | Recuperação, confirmação e convite em contas de teste; sem reenvios históricos        | Três recebidos; recuperação no Spam; links hospedados e ensaio de origem final passaram                           |
| Exclusões    | Preservação dos estados; duas solicitações vencidas tratadas conforme regra existente | Solicitar/cancelar sintético passou; pedidos reais preservados, decisão antes do cron pendente                    |
| Performance  | Latência medida, queries condicionais, pooling e consumo de egress                    | Pool transacional passou: 3 usuários/6 requisições simultâneas; carga limitada                                    |
| Backup novo  | Execução e restauração comprovadas, chave guardada separadamente                      | Backup e restauração passaram; agendamento após troca                                                             |
| Retorno      | Ensaio com criação/edição/exclusão pós-cópia, sem perda ou ressurreição               | Ensaio local passou nas 56 tabelas; serviços no destino de retorno pendentes                                      |
| Troca        | Bloqueio de gravação no antigo, clientes antigos e jobs incluídos                     | Não autorizado                                                                                                    |

### 4. Procedimento de troca aprovado e executado

Apresentar evidências, diferenças revisadas, limitações e duração estimada da manutenção.
Não prometer horário antes do ensaio. Antes da cópia final, impedir gravações no ambiente
antigo por app, extensão, deploys antigos, jobs e APIs diretas; apenas uma tela de
manutenção no frontend não é suficiente. Comprovar que não há gravadores ativos.

Fazer exportação final, restaurar/reconciliar no candidato, recapturar os inventários,
comparar e verificar arquivos. Preservar cronômetros ativos e rascunhos de navegadores:
não limpar localStorage nem reconstruir contas com outros IDs. Invalidar caches e
revisões necessários à troca sem descartar pendências locais.

Só então atualizar todas as variáveis de produção de forma coordenada, publicar o
build correspondente, verificar login e leitura, e liberar gravações no novo ambiente.
Apontar os backups para o novo destino apenas após comprovar sua restauração. Se
qualquer etapa falhar, manter gravações suspensas e não liberar uma cópia parcial.

Se houver alteração efetiva no código/manifest da extensão, seguir AGENTS.md: pacote
local, release quando aplicável e atualização do ZIP do Drive no mesmo ID. Uma simples
troca do banco atrás da mesma API não exige nova versão sem evidência técnica.

## Rollback e retorno

### Ensaio executado em 19/11/2026

`supabase-migration-restore-rehearsal.mjs --exercise-return` restaurou o backup validado
em um container sem rede e criou cópias locais separadas para simular antes/depois.
Somente os dados dessas cópias em RAM foram alterados; nenhum banco remoto participou.

- Criou um registro após a migração, editou outro e excluiu um terceiro.
- Alterou cliente, senha de conta sintética e estado de convite; criou outra conta.
- O plano transacional de registros aplicou uma inserção, uma edição e uma exclusão,
  com locks e comparação integral da baseline. Reaplicar um plano antigo foi recusado.
- Um backup completo do estado **atual** foi restaurado em outro banco local vazio.
  As 56 tabelas coincidiram por contagem e hash: a nova conta, nova senha, notas e
  cancelamento foram preservados; o registro excluído não reapareceu.
- Todos os bancos temporários foram removidos com o container. Evidência:
  `backup/migration-preparation/return-rehearsal-20261119.json`.

O teste comprova preservação e restauração dos dados após novas gravações. Não executa
retorno no projeto antigo nem simula serviços gerenciados: no destino escolhido para
um retorno real, ainda é obrigatório validar Auth, políticas, bytes do Storage e e-mails.
O helper `migration-return-plan.mjs` apenas compõe o plano; não abre conexão nem aplica
SQL remoto. O ensaio limitado de reconciliação de registros não é autorização para
aplicar um merge genérico em Auth/Storage ou suspender triggers em produção.

### Procedimento de retorno

Antes de novas gravações no destino, é possível reverter o apontamento, desde que a
origem esteja operacional. O Supabase original continua restrito por egress até o
próximo ciclo (painel: 25/11/2026); portanto não é fallback imediato de disponibilidade.

Depois da primeira gravação no destino, rollback de código e rollback de dados são
operações diferentes. Manter o destino como fonte de verdade, bloquear novas gravações,
preservar backup e reconciliar a origem antes de apontar o app de volta. Levar também
novos usuários/identidades, alterações de senha, imagens, convites, revogações, lixeira
e exclusões definitivas. Um merge baseado apenas em `updated_at` perde exclusões e
não é suficiente. Usar baseline preservada + inventário completo do estado atual,
revisar divergências e aplicar apenas o plano de reconciliação validado.

Não reativar os dois ambientes para gravação ao mesmo tempo. Não ressuscitar registros
apagados no destino nem descartar os criados depois da ida. Repetir testes de login,
permissões, imagens, extensão e backup na volta; manter o projeto de saída preservado.

## Referências

- [Backup e restore Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Migração de usuários Auth](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects)
- [Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Validação TLS](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Cotas por organização](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Conexões de banco e pool de transações](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Limites de conexões](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [Bypass de proteção Vercel para automação](https://vercel.com/docs/deployments/protection-bypass-automation)

Esta documentação registra a preparação, os ensaios e a troca concluída na seção inicial.
Nenhuma linha marcada como pendente deve ser apresentada como concluída.
