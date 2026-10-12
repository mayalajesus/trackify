# Auditoria visual do Trackify

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
  **não constitui validação mobile**. É necessário outro mecanismo de teste.
- Formatação, lint, TypeScript, auditoria de UI, 179 testes e build passaram
  após a correção. A regra da auditoria de UI foi mantida: o switch usa o
  token semântico `--default` em escopo local.

Ainda falta concluir a matriz de estados, temas, breakpoints, modais e todos os
m�dulos. Nenhum m�dulo completo foi marcado como aprovado por amostragem.
O tema escuro permanece inalterado enquanto suas refer�ncias s�o investigadas.
