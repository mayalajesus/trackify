# Modal Novo projeto — 2026-10-12

Referência somente leitura: [DEV 629:2984](https://www.figma.com/design/OxQD1gNLY8qPflf4RuSVI8/Timetracker?node-id=629-2984).

## Divergências corrigidas

| Elemento           | Antes                                                       | DEV / correção                                                                  |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Container          | Padding genérico 24px; altura dependente dos espaços extras | 384px, raio 24px, padding 28px 24px 24px, sem sombra                            |
| Título             | Espaçamento entre letras negativo                           | 18/24px, peso 600, espaçamento normal                                           |
| Corpo              | Gap 20px, margem horizontal negativa                        | Gap 16px, margem zero, campos alinhados ao título                               |
| Nome e cliente     | Fundo e medidas genéricas                                   | Altura 36px, raio 12px, fundo #F8F8F8, borda #C7CCD1                            |
| Membros            | Botão roxo em cápsula, altura 36px                          | Seletor de 28px, texto cinza, raio 12px                                         |
| Cores              | Itens 28px, gap 10px                                        | Itens 32px, amostras 28px, gap 6px; rótulo separado por 8px                     |
| Faturável          | Variante global 28 × 16px                                   | Variante do frame 40 × 20px, indicador branco e fundo #EAEBEC                   |
| Rodapé             | Margem adicional 20px, botões cortados em telas baixas      | Espaço superior 28px, botões iguais de 36px com gap 8px; rolagem externa nativa |
| Criar desabilitado | Opacidade reduzida                                          | Cor #7E3BED do componente Disabled do DEV, mantendo desabilitação funcional     |

O frame específico prevalece sobre o switch menor do UI Kit. A exceção é restrita ao modal de projeto.

Membros selecionados continuam visíveis quando existem; a seção vazia não é exibida. A associação automática do usuário atual, validação, persistência e permissões foram preservadas. Por isso, com membros reais, a altura cresce além dos 468px do frame vazio. A cor inicial existente também foi preservada.

## Evidências e validação

- Referência: `figma-project-modal-dev.png` e `figma-project-modal-dev.txt`.
- Propriedades complementares: `figma-project-input-dev.txt`, `figma-project-create-dev.txt`.
- Resultado isolado: `project-modal-desktop-after.png`, `project-modal-mobile-after.png`.
- Fixture usa o componente real, contexto sem autenticação e bloqueio de chamadas a serviços de dados. Nenhum projeto de teste foi salvo.
- Três testes visuais passaram em 1280, 390 e 320px: medidas, ausência de overflow horizontal, botões iguais, switch e cancelamento. Em desktop, o modal vazio mede 384 × 468px.
- Conferência adicional do modal com o membro real já selecionado, sem submissão.
- Formatação, lint, TypeScript, auditoria de UI, 179 testes existentes e build aprovados.

Limites: o frame conferido é claro/desktop. Mobile foi verificado quanto à adaptação, sem afirmar equivalência a um frame mobile não localizado. Tema escuro, variantes de erro e a tela de edição não receberam certificação visual completa nesta correção. Os estilos do formulário compartilhado também se aplicam à edição. A auditoria geral continua pendente. Sem publicação.
