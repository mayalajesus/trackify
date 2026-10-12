# Rastreador: valores agrupados e tipografia

Referência somente leitura: [tabela DEV](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=455-23842).
Propriedades inspecionadas no navegador em 12/10/2026:

- Início agrupado: `455:23872`, Inter 14/20px, peso 400, espaçamento 0, cor `#1B1B1B`.
- Data agrupada: `455:23874`, mesmos valores, texto de referência “28 de set.”.
- Duração agrupada: `455:23875`, mesmos valores.
- Cabeçalho Início: Inter 12/16px, peso 400, cor `#1B1B1B`; já estava correto.
- Transcrições das propriedades em `figma-tracker-summary-time.txt`,
  `figma-tracker-summary-duration.txt` e `figma-tracker-header.txt`.

## Divergências corrigidas

O padding externo de 4px somava-se aos 16px internos de cada lado nas células
numéricas agrupadas. Uma coluna de 76px oferecia apenas 36px ao texto com
`truncate`, cortando horários e datas, conforme a captura enviada pelo usuário.
Agora existe apenas um recuo de 4px por lado, com valores centralizados sem
reticências. Isso mantém a posição visual do texto e permite exibir valores maiores
que os exemplos do protótipo, inclusive o indicador de dia seguinte. Durações
excepcionalmente longas podem quebrar linha dentro da célula, sem perder conteúdo.
O recuo é uma adaptação para dados reais: a referência usa 16px e valores curtos.

Os valores agrupados tinham altura de linha de 17px. Os botões dos valores
individuais também herdavam o peso de botão. Ambos agora usam Inter 14/20px,
peso 400, espaçamento zero e a cor de texto do tema. A hierarquia de título,
projeto, descrição e cliente foi preservada.

## Verificação

`tests/visual/tracker-table.spec.ts` renderiza a tabela real com dados fictícios,
em contexto novo sem sessão, bloqueando chamadas de API e origens externas.
Os três casos (1280, 960 e 390px) passaram: texto dentro dos limites da célula,
fonte, peso, cor, data completa, duração 23h 58min, indicador +1 e expansão/recolhimento.
Capturas inspecionadas: `tracker-values-desktop.png` e `tracker-values-mobile.png`.
No mobile a tabela mantém sua rolagem horizontal existente.

Formatação, lint, TypeScript, auditoria de UI, 179 testes de domínio e build passaram.

A conferência é de propriedades e renderização do componente com dados isolados;
não é uma sobreposição pixel a pixel de toda a tela DEV. Não certifica todos os
estados e módulos da auditoria maior. Nenhuma publicação em produção.
