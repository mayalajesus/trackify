# Refatoração gradual — registro de validação

Referência: `11309da`, branch `ajustes-gerais`, em 12/10/2026.
Esta entrega não inclui push, publicação ou migração do banco.

## Referência inicial

- 27 arquivos de testes de domínio, 165 testes aprovados.
- TypeScript, ESLint, Prettier, auditoria de UI e build aprovados.
- O primeiro teste foi bloqueado por uma permissão de cache do ambiente;
  a execução com a permissão adequada passou sem mudanças no código.

## Organização entregue

- Rastreador: agrupamento, chaves estáveis, editor de horário, resumo de grupo
  e linha de lançamento separados. O componente principal continua responsável
  pelos estados de seleção, expansão e confirmação de exclusão.
- Relatórios: conversão de filtros, controlador, preparação de exportações,
  modelos de apresentação e gráficos separados. As rotas e os parâmetros de
  pesquisa permanecem compatíveis.
- Store: validações, migrações, valores iniciais, dados de exemplo, preservação
  de referências e ações por domínio separados. Estados, efeitos e coordenação
  de sincronização permanecem no provider.
- API: infraestrutura, acesso, validação e operações separados. O arquivo de
  entrada mantém os exports públicos, a autenticação, o despacho, o tratamento
  de erros e a coordenação das transações.
- CSS: entrada global preservada, com imports explícitos na ordem anterior.
  Não houve consolidação de seletores, troca de tokens ou mudança de valores.

## Evidência de preservação

- Comparação estrutural das 60 funções da API: corpos preservados.
- Comparação estrutural de 86 funções e callbacks do store: corpos preservados;
  a composição do provider mudou para chamar as fábricas de ações.
- Nenhum ciclo de imports de execução encontrado entre os 41 módulos extraídos.
- Após as extrações de TypeScript/JavaScript, o CSS compilado manteve o mesmo
  nome e conteúdo da referência: `index-BeMcZ8ie.css`, 484.777 bytes.
- Após dividir o CSS, a comparação binária também permaneceu idêntica:
  SHA-256 `b93f5eb1f14d7d10e29d197826bb54fdd856f92769fc19aa4017fa5e77c9e67d`.
- Relatórios nos temas claro e escuro: capturas de 1366×840 e 390×844 antes/depois da
  divisão do CSS, sem diferenças no comparador visual com limiar 0,1.
  A comparação bruta contém pequenas diferenças de rasterização; isso não é
  uma alegação de igualdade binária das imagens.

## Conferência com o Figma

A página DEV foi consultada pelo navegador, em modo de visualização:

- [Rastreador com registros](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=348-10993).
- [Relatório detalhado](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=443-3486).

O Figma não foi editado. O conector exige acesso de edição e não foi usado
para obter o conteúdo após retornar essa limitação.

Diferença anterior preservada: o fundo do quadro do rastreador no Figma indica
`#F3F4F5`; o token claro do app já era `#F8F8F8` no commit de referência.
Corrigir essa diferença seria uma alteração visual separada da refatoração.

As capturas usam os dados disponíveis na conta, que diferem dos exemplos do
protótipo. Portanto, esta conferência não certifica igualdade pixel a pixel
com todos os quadros, estados e conteúdos do Figma.

## Cobertura adicional

- Agrupamento por tarefa/projeto/data/faturabilidade/urgência/Trello, ordenação,
  registros após meia-noite e chaves estáveis.
- Permissões de clientes, valores padrão, horas contratadas, cliente vinculado
  a projeto e prevenção de projetos duplicados.
- Reutilização de referências durante atualização da conta.
- Persistência de períodos relativos e personalizados, restauração de filtros
  e formatos de data, hora e virada de dia na exportação.

As asserções existentes foram preservadas. O teste de segurança que lia apenas
`data-api.mjs` passou a ler também seus módulos extraídos, mantendo as mesmas
exigências sobre SQL e autorização. A auditoria de UI mantém uma lista explícita
dos novos caminhos autorizados.

## Resultado final das verificações

- Prettier, ESLint, TypeScript, auditoria de UI e build: aprovados.
- Domínio: 30 arquivos, 179 testes aprovados (14 testes adicionais).
- Navegador: 14 de 15 testes de acessibilidade, navegação e relatórios aprovados.
  A falha em `report-performance.spec.ts` procura o filtro de faturabilidade,
  removido anteriormente do produto. A mesma falha foi reproduzida em `11309da`.
- Contas reais de QA: proprietário, administrador e membro carregaram as seis
  rotas privadas verificadas. O teste de persistência criou e recarregou o cliente,
  mas não concluiu projeto e cronômetro: espera um `menuitemradio` no seletor de
  cliente do projeto, na linha 65 de `functional.spec.ts`.
  A mesma espera e o mesmo timeout foram reproduzidos no commit `11309da`.

Os testes existentes não tiveram suas expectativas alteradas para esconder
falhas. A validação ponta a ponta de persistência e a conferência de todos os
estados visuais do DEV Figma permanecem incompletas; não há certificação de
igualdade pixel a pixel de todo o app.
