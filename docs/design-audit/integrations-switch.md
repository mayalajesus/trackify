# Integrações: controle persistente de conexão

Referências consultadas somente para leitura em 16/10/2026:

- [DEV / Integrações](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=629-3200)
- [DEV / Tabela](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=629-3208)
- [UI Kit / Ligado](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=96-284)
- [UI Kit / Desligado](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=96-285)

O switch permanece na última célula antes da primeira conexão, conectado,
após desconectar, durante requisições e em falhas. Não substituir por botão.
Usar HeroUI Switch: trilho 28 × 16 px, raio 999 px, indicador branco 12 × 12 px,
inset de 2 px, deslocamento de 12 px quando selecionado.

O DEV sobrescreve o cinza desligado do UI Kit (#C7CCD1) com #EAEBEC;
priorizar o frame da tela. Ligado usa o token de marca #7E3BED.
O tema escuro usa os tokens existentes; não há frame escuro específico verificado.

O estado selecionado vem das sessões válidas da API, nunca de uma preferência
visual salva. Ativar abre o fluxo de autorização da extensão (0.4.1 ou superior);
só a confirmação do servidor liga o controle. Recusar ou fechar a autorização
não cria uma conexão. Desligar revoga as sessões da própria conta. Falhar ao
desconectar preserva o estado conectado. O componente mantém a geometria em
todos esses estados e continua disponível após recarregar a página.

Não reintroduzir dados de Trello ou datas de sincronização simulados para
preencher colunas do protótipo. Não reintroduzir os textos removidos pelo usuário.

Regressão visual/comportamental: `tests/smoke/integrations.spec.ts`, com respostas
de sessão isoladas no navegador de teste, sem revogar conexões reais.

Validação em 16/10/2026: teste Chromium passou com autenticação de QA e dados
fictícios de workspace e sessões interceptados no navegador. Conferidos os estados
nunca conectado, conectado, erro ao desconectar e desconectado após recarregar;
clique, teclado e medidas em desktop (1280 × 720) e mobile (390 × 844).
Asserções confirmam trilho 28 × 16 px, indicador 12 × 12 px branco, raio 999 px,
cinza #EAEBEC desligado e roxo #7E3BED ligado. Capturas geradas pelo teste em
`test-results/`, sem incluir dados reais ou imagens de referência alteradas.

Passaram testes de autorização da aplicação (5) e da extensão (10), lint,
TypeScript, auditoria de UI e build em cópia isolada da main com apenas estas
alterações. O teste visual não altera sessões nem dados reais do QA.

Limites: a conexão direta ao banco de QA reduziu consultas medidas para
51–133 ms e uma carga completa para 1,8 s, mas novas conexões continuaram
apresentando timeouts intermitentes. A configuração local de QA foi ajustada;
não declarar o problema remoto inteiramente resolvido. O teste visual usa dados
fictícios para não depender dessa instabilidade. O fluxo ponta a ponta com a
extensão instalada no Chrome não foi executado; a ponte de autorização está
coberta pelos testes de aplicação e extensão. Não houve migração nem mudança
de configuração do banco de produção.
