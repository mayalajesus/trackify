# Auditoria visual do Trackify

Correção pontual: [valores agrupados e tipografia do rastreador](tracker-values.md),
com referências, evidências e limites da verificação.

Continuação: [ações e modais do rastreador](tracker-dialogs.md), incluindo
exclusão e registro manual, com propriedades DEV e verificação responsiva.

Refer�ncia inicial: `ab3ca87`, branch `ajustes-gerais`. Auditoria iniciada em 12/10/2026.

## Crit�rio e andamento

DEV tem preced�ncia sobre o UI Kit. O arquivo Figma � consultado somente para leitura.
N�o h� publica��o autom�tica. Esta documenta��o registra o trabalho em andamento;
n�o certifica equival�ncia integral de todos os m�dulos.

| M�dulo                     | Situa��o                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| Padr�es compartilhados     | Em auditoria: paleta e estilos registrados; neutros claros corrigidos |
| Navega��o                  | Pendente de revis�o completa                                          |
| Autentica��o               | Pendente                                                              |
| Rastreador                 | Pendente de revis�o completa de estados                               |
| Relat�rios                 | Pendente                                                              |
| Projetos e clientes        | Pendente                                                              |
| Equipes e integra��es      | Pendente                                                              |
| Workspaces e configura��es | Pendente                                                              |
| Revis�o integrada          | Pendente                                                              |

## Refer�ncias consultadas

- [UI Kit](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=0-1): paleta e estilos tipogr�ficos globais.
- [Formul�rios e controles](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=232-3960): variantes de bot�o e input.
- [Navega��o e estrutura](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=232-3955): menu de a��es e demais componentes.
- [Guia de cores](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=649-6089): explicita que sua consolida��o se aplica apenas �s nove se��es da p�gina de documenta��o, sem alterar UI Kit ou outras p�ginas. N�o aplicada automaticamente ao DEV.

## Diferen�as registradas

| ID    | Elemento                                 | Antes                               | Refer�ncia                | Corre��o / situa��o                                                          |
| ----- | ---------------------------------------- | ----------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| SH-01 | Fundo neutro de controles                | OKLCH aproximado                    | Primary Gray `#EAEBEC`    | Token claro `--default` corrigido                                            |
| SH-02 | Superf�cies brancas e texto sobre perigo | OKLCH com matiz / branco aproximado | White `#FFFFFF`           | Tokens claros corrigidos                                                     |
| SH-03 | Texto secund�rio                         | OKLCH aproximado                    | Quartenary Grey `#737D89` | `--muted` e placeholder claros corrigidos                                    |
| SH-04 | Borda neutra                             | OKLCH aproximado                    | Secondary Gray `#C7CCD1`  | `--border` claro corrigido; bordas espec�ficas de tela preservadas           |
| SH-05 | Separadores neutros                      | OKLCH aproximado                    | Primary Gray `#EAEBEC`    | `--separator` claro corrigido                                                |
| SH-06 | Menu de a��es                            | 192px, raio24, padding8 + item8     | 192px, raio24, padding16  | Recuo efetivo equivalente; n�o alterado sem variante de hover que justifique |

A paleta est� em `figma-palette.json`; estilos de texto em `figma-text-styles.json`.
As evid�ncias dos componentes est�o nos arquivos `figma-*.txt`.
Capturas locais antes/depois dos neutros: `app-tracker-before.png` e
`app-tracker-neutral-after.png`. Usam os mesmos dados e viewport; ainda n�o s�o
compara��o pixel a pixel com o conte�do do prot�tipo.

## Verificação da primeira correção

Formatação, lint, TypeScript, auditoria de UI, 179 testes de domínio e build
passaram em 12/10/2026. A navegação local por Clientes, Equipe, Integrações e
Workspaces confirmou a aplicação do neutro `#EAEBEC` às tabelas. Isso verifica
o alcance dos tokens, não a equivalência completa dessas páginas ao DEV.

As capturas locais do app ficam fora do versionamento porque incluem dados da
conta conectada. A comparação final ainda requer conteúdo sintético isolado.

O modal de projeto DEV `629:2984` mede 384px, raio 24px e padding
28px 24px 24px; o app usa 24px nos quatro lados. Divergência registrada para
a etapa de Projetos, sem modificar a seleção automática de membros.

## Limites atuais

### Confirmação de sobreposição de lançamentos

Correção solicitada a partir da captura do usuário: o AlertDialog estava sem
estilos próprios, com botões altos e texto do botão principal quebrado.
Aplicado o padrão de confirmação DEV `629:3351`: largura 384px, raio 24px,
padding 28px 24px 24px, título 18/24, descrição 14/24 e rodapé com gap 8px.
Altura acompanha o resumo do lançamento; ações ocupam igualmente o rodapé.
Botões com 36px em desktop/390px e crescimento uniforme quando o texto precisa
quebrar em 320px. Cancelar usa texto neutro, confirmação preserva roxo.
Não foi localizado um frame específico para o aviso de sobreposição: trata-se
da aplicação do padrão de confirmação ao conteúdo existente, sem alterar textos
ou o comportamento de salvar/cancelar.

`tests/visual/overlap.spec.ts` verifica o componente real, com dados fictícios e
sem store/API, em 1280, 390 e 320px, incluindo os callbacks de ambas as ações.
As três verificações passaram e as capturas foram inspecionadas.
Formatação, lint, TypeScript, auditoria de UI, 179 testes de domínio e build
também passaram. Evidência desktop: `overlap-desktop.png`.

### Conflito confirmado: abas de tema

O UI Kit usa Inter 11px/100%, peso 400 e sombra `0 2px 5px #1118270C`.
A instância DEV de Configurações usa peso 500 e sombra `0 2px 5px #1B1B1B0C`.
O app já mantém os valores do DEV; nenhuma correção foi aplicada nesses pontos.
Ambos especificam container 448 × 30px, padding 2px, seleção 148 × 26px,
raio 999px, fundo `#EAEBEC` e seleção branca.

Referências: UI Kit `92:283`, seleção `92:271`, texto `92:272`;
DEV Configurações `629:3305`, seleção `629:3336` (texto filho inspecionado).
Propriedades nos arquivos `figma-theme-tabs-*.txt`.

### Paleta e aplicação

O guia [Cores de sistema — Status](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=649-8032)
confirma oito estilos semânticos: tons suaves para preenchimento; intensos para
texto, ícones, bordas e ações. Roxo continua sendo a ação padrão. O próprio guia
explicita que os exemplos foram aplicados à página de teste. A paleta global
completa foi registrada, mas ainda não foi confirmada uma associação de cada
cor a fundos, superfícies e estados no tema escuro. Isso permanece pendente;
não é evidência de que a paleta não exista.

### Switch compartilhado

- Referências: Toggle desligado `96:285`, indicador `96:283`; ligado `96:284`,
  indicador `84:1573`. Propriedades preservadas nos arquivos `figma-switch-*.txt`.
- Antes: controle padrão de 40 × 20px, indicador de 22 × 16px, fundo desligado
  `#EAEBEC` e indicador branco.
- Corrigido no tema claro: controle 28 × 16px, raio 999px, indicador circular
  12px, recuo de 2px desligado e 14px ligado. Desligado `#C7CCD1` / `#9CA3AF`;
  ligado `#7E3BED` / branco. Menu de ações usa as mesmas cores de estado.
- Verificação local: alternância do formulário de novo projeto, sem submissão.
  Medidas em `switch-measurements.json`, recortes sem dados pessoais em
  `switch-off-after.png` e `switch-on-after.png`.
- Hover/foco/desabilitado não possuem referência individual confirmada; preservados
  os comportamentos existentes. Ainda falta reconferir todos os usos do switch.
- A tentativa de viewport 390 × 844 no navegador não foi aplicada: `innerWidth`
  continuou 1280. A captura com nome `app-switch-mobile-after.png` é desktop e
  **não constitui validação mobile**.
- Essa limitação foi contornada para o switch com `tests/visual/controls.spec.ts`:
  fixture sem autenticação, store ou API, usando o componente real e o CSS global.
  Os dois testes passaram em 1280 × 720 e 390 × 844, verificando medidas e cores
  do Figma, alternância por teclado e estado desabilitado. Capturas em
  `test-results/visual-controls-*/` foram inspecionadas. A fixture não é uma tela
  do app e não certifica a responsividade dos módulos.
- Formatação, lint, TypeScript, auditoria de UI, 179 testes e build passaram
  após a correção. A regra da auditoria de UI foi mantida: o switch usa o
  token semântico `--default` em escopo local.

Ainda falta concluir a matriz de estados, temas, breakpoints, modais e todos os
m�dulos. Nenhum m�dulo completo foi marcado como aprovado por amostragem.
O tema escuro permanece inalterado enquanto suas refer�ncias s�o investigadas.
