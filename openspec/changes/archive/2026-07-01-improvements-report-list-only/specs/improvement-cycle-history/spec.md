## MODIFIED Requirements

### Requirement: Relatório de implementações por ciclo com timestamp
Ao final de cada ciclo de aplicação de melhorias, o sistema SHALL gerar um arquivo `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` no `rootDir` do curso. O arquivo SHALL conter APENAS os títulos das aulas e as seções `### Melhorias Aplicadas` de cada aula — sem o conteúdo integral reescrito. O arquivo SHALL ser imutável — ciclos subsequentes criam novos arquivos sem sobrescrever os anteriores. Os arquivos `conteudo.docx` e `conteudo.txt` SHALL permanecer sem alteração. Quando a seção `### Melhorias Aplicadas` não for encontrada no output do modelo para uma aula, o relatório SHALL registrar `_(seção não gerada)_` para essa aula.

#### Scenario: Ciclo concluído com sucesso
- **WHEN** o loop de aplicação de melhorias conclui sem erro
- **THEN** o sistema grava `melhorias_aplicadas_YYYYMMDD_HHmmss.docx` em `rootDir`
- **THEN** o arquivo contém para cada aula: o título da aula como cabeçalho `## Aula N: Título` e apenas a seção `### Melhorias Aplicadas`
- **THEN** o arquivo NÃO contém o conteúdo integral reescrito das aulas

#### Scenario: Modelo não gera seção de melhorias para uma aula
- **WHEN** o output do modelo para uma aula não contém `### Melhorias Aplicadas`
- **THEN** o relatório registra `_(seção não gerada)_` para essa aula
- **THEN** o relatório é gerado normalmente para as demais aulas
