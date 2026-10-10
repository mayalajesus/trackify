# Conexão com a extensão Trackify

Implementação inicial para a extensão 0.2.0. Não inclui cronômetro ou seleção de
projetos. O fluxo real requer a extensão instalada no Chrome e o app publicado.

## Ativação

1. Instale a extensão de mayalajesus/trackify-extension como extensão sem compactação.
2. Copie o ID de 32 letras em chrome://extensions.
3. Configure o mesmo ID em VITE_TRACKIFY_EXTENSION_IDS (frontend) e
   TRACKIFY_EXTENSION_IDS (backend). Aceitam lista por vírgulas; vazios desabilitam.
4. Publique frontend e backend juntos. A extensão usa https://watchtag.vercel.app.
5. Clique em Conectar, entre no app, autorize e reabra o painel para verificar o e-mail.
6. Teste desconexão, expiração, token inválido e tentativa de reutilizar a conexão.

O ID local pode variar por máquina/caminho. Cadastre o ID definitivo da loja
antes de distribuir. Trocar o domínio exige atualizar APP_ORIGIN, host_permissions
e externally_connectable.matches no repositório da extensão.

## Contrato v1

O worker gera 32 bytes aleatórios e salva estado, aba e validade de cinco minutos
em chrome.storage.session. Abre /extension/connect?extensionId=...&state=...
(sem token na URL). O app verifica o ID na allowlist, usa o login existente e,
após autorização explícita, envia diretamente por chrome.runtime.sendMessage:

    {type: "TRACKIFY_CONNECT", version: 1, state, token, expiresAt}

O worker verifica domínio, rota, frame principal, aba iniciadora, estado e validade.
Consome o pedido uma única vez e valida a sessão com POST /api/data, usando
Authorization: Bearer <access token> e body {operation: "getExtensionSession"}.
Resposta: {data: {version: 1, user: {id, name, email}}, requestId}.
Autenticação, limites de requisições e regras de situação da conta continuam ativos.
Requisições de origens Chrome autorizadas só podem usar getExtensionSession.

## Limites

- Usa o access token atual do provedor, sem escopos próprios de extensão.
  Allowlist de origem não substitui autorização do servidor.
- Nenhuma senha, refresh token ou chave administrativa é enviada à extensão.
- Token fica em storage.session, inacessível a content scripts por padrão, e não
  aparece nas respostas ao painel, URLs ou logs.
- A extensão deixa de usar a sessão em até 15 minutos, na validade do provedor ou
  ao encerrar o navegador. Descarta a sessão expirada quando consultada.
  Isso não muda a validade original do token no servidor.
- Desconectar remove a cópia local; não revoga nem encerra a sessão do site.
- Antes de ampliar a integração, avaliar credenciais com escopos e revogação
  independente e implementar operações atômicas do cronômetro.

Testes de unidade cobrem origem, allowlist, estado, aba/frame, validade e API.
O fluxo completo não foi validado em Chrome instalado ou em produção.

## Resultado da validação local (07/10/2026)

- Extensão: 9 testes aprovados, incluindo worker com API simulada.
- App: testes específicos de conexão/autenticação aprovados; lint dos arquivos
  alterados e auditoria de UI aprovados.
- Suíte de domínio: 164 aprovados e 1 falha em timer-start.test.ts, sobre iniciar
  sem projeto, em código não alterado nesta etapa.
- Typecheck: falhas em project-select.tsx, auth-client.ts e signup.tsx, fora desta alteração.
- Build: falhou na resolução de @radix-ui/react-compose-refs em dependência do HeroUI.
- Nenhum deploy ou teste autenticado em produção foi realizado.
