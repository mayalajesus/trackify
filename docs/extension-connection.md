# Conexão com a extensão Trackify

A extensão 0.4.0 usa o domínio atual https://watchtag.vercel.app. Implementa seleção
de workspace e projeto, início, pausa, retomada e finalização pelo popup ou pelo
painel em cartões do Trello. O título e o link do cartão são salvos no lançamento.
A leitura do cartão aberto não exige uma API Key do Trello.

## Ativação

1. Carregue `extension.local` como extensão sem compactação no Chrome.
2. O manifesto possui uma chave pública que fixa o ID de desenvolvimento em
   `kjlodnmcbfeopfnpbnapjjhpnaefgigl`.
3. Configure esse ID em `VITE_TRACKIFY_EXTENSION_IDS` e `TRACKIFY_EXTENSION_IDS`
   no ambiente de publicação. Ambos aceitam listas separadas por vírgulas.
4. Publique frontend e backend juntos. As configurações locais não atualizam a Vercel.
5. Abra um cartão, conecte a extensão e autorize no Trackify. Escolha workspace e
   projeto, inicie, pause, retome e finalize. Confira o registro no app.
6. Antes da distribuição, teste também expiração, desconexão, troca de cartões,
   navegação do Trello, colaboração e alterações simultâneas pelo app.

O repositório da extensão é separado: `mayalajesus/trackify-extension`.
`extension.local` é ignorado pelo Git do app. Execute seu `package.ps1` para gerar
`dist/trackify-0.4.0.zip`. Na publicação pela loja, confira o ID atribuído e atualize
as allowlists antes da distribuição.

## Contrato e segurança

O worker gera estado aleatório válido por cinco minutos e abre
`/extension/connect?extensionId=...&state=...`, sem token na URL. A autorização
verifica origem, rota, aba, frame, estado, validade e ID permitido. O pedido é
consumido uma única vez. O token da conta é trocado por credenciais próprias da extensão,
armazenadas em `chrome.storage.local` com acesso restrito a contextos confiáveis.
As credenciais não são retornadas ao painel ou ao script do Trello.

Origens Chrome autorizadas podem chamar os endpoints de sessão e cronômetro da extensão;
operações gerais da conta permanecem bloqueadas. O servidor verifica o vínculo com
o workspace, o projeto e o proprietário da colaboração. O faturamento é derivado
do projeto/cliente. Operações do cronômetro usam transação e versão; tentativas
repetidas de início não criam outro registro. Participantes convidados não podem
pausar, retomar ou finalizar a tarefa compartilhada.

O app consulta o cronômetro remoto enquanto visível; a extensão atualiza o contexto
periodicamente e ao receber foco. A extensão não opera offline. Erros de rede não
são apresentados como gravações bem-sucedidas.

## Limites e publicação

- A conexão persiste ao fechar o navegador. O acesso de 15 minutos é renovado automaticamente.
- A credencial de renovação expira após 90 dias sem uso e tem escopo exclusivo da extensão.
- Desconectar remove a sessão ativa local e revoga a sessão no servidor. Offline, a revogação é repetida posteriormente.
- Desconectar não para o cronômetro nem encerra a sessão do site.
- Aplicar `20261016180000_extension_sessions.sql` antes de publicar esta versão.
- Testes de integração usam exclusivamente QA e revertem os dados de teste.
- A validação com Chrome instalado e Trello autenticado permanece pendente.
- A conta de desenvolvedor da loja ainda não foi criada. Consulte `STORE.md` e a
  minuta `PRIVACY.md` na extensão; faltam contato, URL pública da política e capturas reais.
- Não foi feito deploy nem alteração remota de variáveis da Vercel nesta etapa.

## Histórico de validação da versão anterior

- 292 testes de domínio do app e 10 testes da extensão aprovados.
- TypeScript, auditoria de UI, formatação e build aprovados.
- ESLint aprovado excluindo `tmp-report-preview`; a execução geral encontrou 64
  erros de formatação em scripts temporários anteriores, não alterados nesta entrega.
- Integração em QA aprovada: autorização, faturamento, repetição de início,
  versão em pausa/retomada, finalização atômica, vínculo Trello e colaboração.
  Os dados criados no teste foram revertidos.
- Validação real no Chrome e produção pendente, conforme os limites acima.

## Persistent extension sessions (2026-10-16)

Deploy migration `20261016180000_extension_sessions.sql` before the updated API and extension. Existing installations need one authorization to exchange their legacy temporary session. No new environment secret is required; existing extension ID allowlists remain required.

The main account credential is used only during an explicit five-minute connection handshake. The worker exchanges it for a dedicated extension session, scoped to context/timer operations. Access tokens last 15 minutes and are renewed automatically on use with a 60-second margin. A 90-day inactivity deadline advances on each renewal. Closing the browser does not disconnect.

The persistent refresh credential is generated from 32 cryptographically random bytes. Only SHA-256 hashes of access/refresh credentials are stored in the database. Refresh remains stable so a lost renewal response can be retried; access credentials rotate. Refresh cannot call timer or general account operations. Credentials require the registered extension origin and are stored in chrome.storage.local restricted to TRUSTED_CONTEXTS. Panels only receive public identity.

Disconnect removes the active local session immediately and revokes both credentials server-side. Offline revocations are kept as tombstones, unavailable for timer use, and retried on startup/next panel request/next connection. Uninstalling cannot execute a server revocation; unused server sessions expire after 90 days. Account deletion cascades sessions; lifecycle and workspace membership checks still apply to use/renewal. Signing out of the web app alone does not disconnect the extension.

Checks: extension worker tests cover renewal, concurrent requests, offline retention, restart, secret isolation, one-use handshake and deferred revocation. `node --test tests/integration/extension-sessions-unit.mjs` checks backend scope/hash/revocation guards with a query double; it is not a real-database integration test. Production rollout must apply the migration before the API and extension update.

## Extensão 0.5.0 — 2026-10-28

O painel passa a usar HeroUI e os tokens do site, com seleção de projetos agrupada
por cliente. A API aceita observação, urgência, favorito e convite de membros no
início e na edição do cronômetro. Essas gravações compartilham a transação do timer;
conflitos de versão ou destinatários inválidos revertem a operação inteira.
Não há nova migração nem ampliação de permissões da extensão nesta versão.
Publique o backend antes de distribuir `trackify-0.5.0.zip`.

## Extensão 0.6.0 — criação manual

O início aceita `source: manual` e `task`, exigindo nome e projeto válidos e
rejeitando um cartão associado nesse modo. Requisições anteriores continuam usando
Trello por padrão e mantêm a validação do cartão ativo. O vínculo de projeto,
as permissões, a transação e a proteção contra início duplicado são preservados.
Não há alteração de esquema. Publicar a API antes de distribuir o ZIP 0.6.0.
