# Distribuição da extensão Trackify

Por solicitação do usuário, toda entrega de atualização da extensão deve incluir a
atualização do ZIP compartilhado no Google Drive, além do pacote local e da release
no GitHub quando esta fizer parte da entrega.

- Repositório da extensão: `extension.local` (repositório Git separado).
- Arquivo compartilhado: https://drive.google.com/file/d/1N5B-ka6I1XNk8ffDsJE69Tyc0XjzDIl0/view
- ID fixo: `1N5B-ka6I1XNk8ffDsJE69Tyc0XjzDIl0`.
- Substituir o conteúdo do arquivo existente por uma nova versão do ZIP e atualizar
  o nome para `trackify-<versão>.zip`. Preservar o ID, o link e as permissões.
- Conferir a versão do manifest, a integridade do pacote e a conclusão do upload;
  verificar o nome e o tamanho do arquivo no Drive antes de declarar a entrega concluída.
- Usar a integração do Drive quando houver permissão de escrita. A conta da integração
  retornou `insufficientFilePermissions` em 06/11/2026; a sessão do navegador da conta
  proprietária permitiu atualizar por **Informações sobre o arquivo > Gerenciar versões >
  Fazer upload de nova versão**. Renomear o arquivo após o upload, se necessário.
- Se o Drive estiver inacessível, informar a pendência; não afirmar que foi atualizado.
- Manter somente o ZIP instalável mais recente na pasta local de distribuição e nos
  assets de releases do GitHub, conforme a preferência do usuário. Preservar o código,
  os commits e as tags. Atualizações apenas do site não exigem um novo ZIP da extensão.
