## MODIFIED Requirements

### Requirement: Geração de conteúdo por aula
O sistema SHALL gerar o conteúdo de cada aula individualmente e persistir apenas os arquivos individuais `aula{NN}_conteudo.docx` e `scr/aula{NN}_conteudo.txt`. O sistema SHALL manter `sess.conteudo` em memória (concatenação das aulas) para consumidores downstream (PPC, finalizar-conteudo), mas SHALL NOT persistir o arquivo consolidado `conteudo.docx` nem `scr/conteudo.txt` em disco.

#### Scenario: Geração concluída com sucesso
- **WHEN** o loop de geração de aulas em `GET /api/conteudo` termina
- **THEN** os arquivos `aula{NN}_conteudo.docx` e `scr/aula{NN}_conteudo.txt` existem para cada aula
- **THEN** `sess.conteudo` está populado em memória com o texto concatenado de todas as aulas
- **THEN** NÃO existe `conteudo.docx` nem `scr/conteudo.txt` no diretório do projeto

#### Scenario: Geração de melhoria concluída com sucesso
- **WHEN** o loop de aplicação de melhorias em `GET /api/aplicar-melhorias/confirmar` termina
- **THEN** os arquivos `aula{NN}_conteudo.docx` são atualizados com o conteúdo melhorado
- **THEN** `sess.conteudo` está atualizado em memória
- **THEN** NÃO existe novo `conteudo.docx` nem `scr/conteudo.txt` gerado pelo ciclo de melhorias

#### Scenario: Restore de sessão após restart
- **WHEN** o servidor é reiniciado e o usuário retorna ao projeto
- **THEN** `sess.conteudoPorAula` é restaurado a partir dos arquivos individuais de aula em disco
- **THEN** `sess.conteudo` é reconstruído concatenando os textos de `sess.conteudoPorAula`
- **THEN** os consumidores downstream (PPC, finalizar-conteudo) funcionam normalmente
