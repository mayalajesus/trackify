# Conexão com a extensão Trackify

A extensão 0.3.0 usa o domínio atual https://watchtag.vercel.app. Implementa seleção
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
`dist/trackify-0.3.0.zip`. Na publicação pela loja, confira o ID atribuído e atualize
as allowlists antes da distribuição.

## Contrato e segurança

O worker gera estado aleatório válido por cinco minutos e abre
`/extension/connect?extensionId=...&state=...`, sem token na URL. A autorização
verifica origem, rota, aba, frame, estado, validade e ID permitido. O pedido é
consumido uma única vez. O token fica em `chrome.storage.session`, sem ser
retornado ao painel ou ao script do Trello.

Origens Chrome autorizadas podem chamar somente `getExtensionSession`,
`getExtensionContext` e `extensionTimerAction`. O servidor verifica o vínculo com
o workspace, o projeto e o proprietário da colaboração. O faturamento é derivado
do projeto/cliente. Operações do cronômetro usam transação e versão; tentativas
repetidas de início não criam outro registro. Participantes convidados não podem
pausar, retomar ou finalizar a tarefa compartilhada.

O app consulta o cronômetro remoto enquanto visível; a extensão atualiza o contexto
periodicamente e ao receber foco. A extensão não opera offline. Erros de rede não
são apresentados como gravações bem-sucedidas.

## Limites e publicação

- A sessão temporária dura no máximo 15 minutos; o cronômetro continua no servidor.
  Após expirar, reconecte para controlá-lo. Nenhum refresh token é armazenado.
- Desconectar remove a cópia local, sem parar o cronômetro ou revogar a sessão do site.
- O token usa a sessão existente do provedor, sem escopo ou revogação próprios.
- Não há migração de banco nesta etapa.
- Testes de integração usam exclusivamente QA e revertem os dados de teste.
- A validação com Chrome instalado e Trello autenticado permanece pendente.
- A conta de desenvolvedor da loja ainda não foi criada. Consulte `STORE.md` e a
  minuta `PRIVACY.md` na extensão; faltam contato, URL pública da política e capturas reais.
- Não foi feito deploy nem alteração remota de variáveis da Vercel nesta etapa.

## Validação desta implementação

- 292 testes de domínio do app e 10 testes da extensão aprovados.
- TypeScript, auditoria de UI, formatação e build aprovados.
- ESLint aprovado excluindo `tmp-report-preview`; a execução geral encontrou 64
  erros de formatação em scripts temporários anteriores, não alterados nesta entrega.
- Integração em QA aprovada: autorização, faturamento, repetição de início,
  versão em pausa/retomada, finalização atômica, vínculo Trello e colaboração.
  Os dados criados no teste foram revertidos.
- Validação real no Chrome e produção pendente, conforme os limites acima.
