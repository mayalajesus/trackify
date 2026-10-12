# Rastreador — ações e modais, 12/10/2026

Continuação da auditoria na branch `ajustes-gerais`. Figma consultado somente
para leitura. O recuo duplo de projeto/cliente foi confirmado no DEV (12px na
célula e 12px no conteúdo) e preservado.

## Tabela e ações

Referência: [tabela DEV](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=455-23842).

- Coluna de ações: 80px → 60px.
- Ícones de 16px: espaçamento efetivo entre eles de 6px → 12px. A origem era
  o trigger do dropdown com `display: block`, que não centralizava seu ícone.
- Áreas clicáveis de 28px preservadas, com recuo de 8px até o primeiro ícone.
- Menu: largura 214px, raio 24px, altura dos itens 38px, ordem das seis ações
  e sombra já correspondiam à referência; mantidos.
- Propriedades em `figma-tracker-actions.txt`, `figma-tracker-resume-icon.txt`,
  `figma-tracker-action-menu.txt` e `figma-tracker-project-*.txt`.

## Excluir registro

Referência: [modal DEV](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=348-10843)
e seu frame pai, registrado em `figma-tracker-delete.txt`.

- Mantidos largura 384px, raio 24px e padding 28px 24px 24px.
- Separações corrigidas para 18px antes do aviso e 20px antes das ações.
- Título Inter 18/24, peso 600, sem espaçamento negativo, cor clara `#171717`.
- Aviso claro `#808080`, conforme o frame específico, em vez do muted global.
- Botões com peso 400; cancelar usa texto neutro.
- Fechar: círculo 24px, fundo `#EAEBEC`, ícone preto no tema claro.
- Removida a sombra que não aparece nas propriedades do frame.
- Com o mesmo texto “estudo”, o teste mede 384 × 170px, como no DEV.

## Registro manual

Referência: [início/fim DEV](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=499-24224).

- Rodapé específico do frame: 16px acima, botões à direita com 92px e 129px,
  separados por 8px. Substitui a regra genérica de ações igualmente largas.
- Distância título/formulário: 16px → 20px.
- Labels: Inter 14/16, peso 400. Gap label/campo de projeto e data: 8px → 4px.
- Abas: 209 × 32px, áreas de 116px e 93px, sem padding externo extra.
- Agrupados modo e horários com gap de 12px; estados e callbacks permanecem
  no mesmo componente. Gap de 16px entre os cinco grupos do formulário.
- Não faturável: altura 29px, padding 6px 12px, Inter 14/120%, peso 500,
  ícone 16px em `#9CA3AF` no tema claro.
- Observações: textarea de 76px; apoio 12/16 em `#6B7280`, afastado 8px.
- Título sem tracking negativo; fechamento 24px alinhado ao padding do header.
- Com o conteúdo de referência, o teste mede 384 × 633px.
- Referências detalhadas: arquivos `figma-manual-*.txt` e `figma-manual-range.png`.

## Validação e limites

Seis testes visuais passaram, usando componentes reais em contexto novo,
sem sessão e com chamadas de API bloqueadas. Cobrem 1280, 960 e 390px para a
tabela/exclusão, e 1280, 390 e 320px para registro manual: valores completos,
expansão/recolhimento, menu, cancelamento, alternância entre início/fim e duração,
dimensões, cores e alinhamento. Capturas foram inspecionadas.

Formatação, lint, TypeScript, auditoria de UI, 179 testes de domínio e build
passaram. Evidências locais: `tracker-actions-desktop.png`,
`tracker-delete-desktop.png`, `manual-range-desktop.png` e `manual-range-mobile.png`.

O estado desabilitado de salvar foi preservado quando faltam dados obrigatórios,
mesmo que o exemplo do Figma mostre o botão ativo. Dados de conta/produção não
foram alterados. Os testes não submetem registros nem confirmam exclusões.

A variante de duração foi exercitada funcionalmente, mas ainda falta sua
comparação visual completa com o frame correspondente. Ainda faltam revisão
integral de estados, overlays de projeto/calendário, Trello/colaboração e demais
módulos. Mobile foi verificado quanto a adaptação e acesso aos controles; não
é certificação de equivalência a todos os frames mobile. Tema escuro não foi
certificado sem o mapeamento completo dos papéis da paleta. Sem publicação.
