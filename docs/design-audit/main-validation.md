# Verificação antes do envio à main — 2026-10-12

Base remota conferida: `ab3ca87`. Correções visuais até `f42d4e8`, em oito commits, sem alterações de API, banco ou dependências. Envio solicitado explicitamente pelo usuário.

- Formatação, lint, TypeScript, auditoria de UI, 179 testes de domínio e build passaram na revisão final do modal.
- Três testes visuais do modal passaram em 1280, 390 e 320px.
- Suítes autenticadas executadas em QA: 19 passaram, 2 falharam. Os quatro cenários de acessibilidade passaram, incluindo criação de projeto pelo rastreador.
- Falha em `report-performance.spec.ts:81`: teste procura filtro de faturabilidade removido anteriormente. O teste e os componentes/rota de relatórios não mudaram em relação à base remota.
- Falha em `functional.spec.ts:65`: teste procura `menuitemradio` no seletor de cliente. O formulário já usa `Select`/`ListBox` na base remota. O teste não foi alterado; o cenário não concluiu a persistência de projeto e cronômetro.
- Navegação autenticada de owner, admin e member passou. A limpeza de dados sintéticos de QA foi executada pelo encerramento da suíte.

As falhas dos seletores antigos ficam registradas; expectativas não foram modificadas. Não se declara aprovação integral das suítes autenticadas nem conclusão da auditoria visual geral.
