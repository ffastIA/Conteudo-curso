## ADDED Requirements

### Requirement: Relatório de implementações por ciclo com timestamp
Ao final de cada ciclo de aplicação de melhorias, o sistema SHALL gerar um arquivo `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` no `rootDir` do curso, onde o timestamp representa a data e hora local do servidor no momento da geração. O arquivo SHALL conter o conteúdo completo de todas as aulas com suas seções "Melhorias Aplicadas". O arquivo SHALL ser imutável — ciclos subsequentes criam novos arquivos sem sobrescrever os anteriores. Os arquivos `conteudo.docx` e `conteudo.txt` SHALL permanecer sem alteração.

#### Scenario: Ciclo concluído com sucesso
- **WHEN** o loop de aplicação de melhorias conclui sem erro
- **THEN** o sistema grava `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` em `rootDir`
- **THEN** o arquivo contém o conteúdo de todas as aulas processadas no ciclo
- **THEN** `conteudo.docx` e `conteudo.txt` permanecem com o conteúdo atual (sem auditoria appendada)

#### Scenario: Múltiplos ciclos acumulam relatórios distintos
- **WHEN** o usuário executa o ciclo N vezes
- **THEN** existem N arquivos `melhorias_aplicadas_*.docx` em `rootDir`, um por ciclo
- **THEN** nenhum arquivo anterior é sobrescrito

#### Scenario: Falha ao gerar o relatório timestampado
- **WHEN** ocorre erro ao gerar ou gravar o arquivo timestampado
- **THEN** o erro é logado silenciosamente
- **THEN** o ciclo já concluído não é afetado — `conteudo.docx` e a resposta SSE permanecem intactos

---

### Requirement: Auditoria Jaccard embutida no relatório de ciclo
Quando uma ou mais aulas apresentam similaridade Jaccard > 90% em relação ao ciclo anterior, o relatório timestampado SHALL incluir uma seção `## Auditoria do Ciclo` ao final do documento. Quando **todas** as aulas do ciclo estão acima do limiar, a seção SHALL iniciar com a declaração "Nenhuma nova implementação detectada neste ciclo". A auditoria SHALL ser exclusiva do arquivo timestampado — `conteudo.docx` e `sess.conteudo` não são alterados.

#### Scenario: Todas as aulas sem alteração significativa
- **WHEN** todas as aulas do ciclo têm similaridade Jaccard > 90%
- **THEN** o relatório timestampado inclui `## Auditoria do Ciclo` com "Nenhuma nova implementação detectada neste ciclo"
- **THEN** cada aula afetada é listada com sua porcentagem de similaridade
- **THEN** `conteudo.docx` não contém a seção de auditoria

#### Scenario: Parte das aulas sem alteração significativa
- **WHEN** apenas algumas aulas têm similaridade > 90% (não todas)
- **THEN** o relatório timestampado inclui `## Auditoria do Ciclo` listando somente as aulas afetadas
- **THEN** a mensagem não diz "nenhuma implementação" — apenas lista as aulas com pouca alteração

#### Scenario: Todas as aulas com alterações significativas
- **WHEN** nenhuma aula tem similaridade > 90%
- **THEN** o relatório timestampado não inclui a seção `## Auditoria do Ciclo`
- **THEN** o documento contém apenas o conteúdo das aulas com suas seções "Melhorias Aplicadas"
