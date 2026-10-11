# Trello no contador

1. Criar ou abrir o Power-Up do Trackify em https://trello.com/apps/admin.
2. Em Trello Auth, gerar a API Key pública e registrar as origens permitidas do app (incluindo http://localhost:5173 em desenvolvimento).
3. Configurar VITE_TRELLO_API_KEY no ambiente e reiniciar o servidor local ou refazer o build.
4. No contador, informar tarefa e projeto, abrir Vincular ao Trello e clicar em Conectar Trello.
5. Autorizar a leitura, selecionar um quadro, buscar um card e confirmar o vínculo.

A chave pública pode estar no frontend. O token de usuário fica apenas em memória, é solicitado com permissão de leitura e expira em um dia. Nenhum card é criado ou alterado no Trello. O vínculo salvo no Trackify contém apenas identificador, nome, URL e nome do quadro.

Sem a chave, o botão de conexão informa indisponibilidade. Não há fallback para cards de demonstração neste fluxo.

Documentação oficial: https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/
