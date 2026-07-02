## MODIFIED Requirements

### Requirement: Geração do documento final consolidado
Quando o usuário indicar que o conteúdo está concluído, o sistema SHALL gerar um único arquivo `.docx` consolidado contendo o conteúdo revisado de todas as aulas em sequência. O sistema SHALL sempre retornar uma resposta JSON com `{ ok: true, saved: true, path }` após salvar o arquivo em disco, independentemente de `pastaProjeto` estar configurado. Nenhum download implícito SHALL ser disparado pelo endpoint.

#### Scenario: Conclusão com pastaProjeto configurado
- **WHEN** o usuário clica "Conteúdo Concluído" e `sess.config.pastaProjeto` está preenchido
- **THEN** o sistema salva `conteudo_final.docx` em `pastaProjeto/conteudo_final.docx`
- **THEN** retorna `{ ok: true, saved: true, path: "<pastaProjeto>/conteudo_final.docx" }`
- **THEN** o frontend exibe o banner "Arquivo salvo em: <path>"

#### Scenario: Conclusão sem pastaProjeto configurado
- **WHEN** o usuário clica "Conteúdo Concluído" e `sess.config.pastaProjeto` está vazio
- **THEN** o sistema salva `conteudo_final.docx` em `saídas/{slug}/conteudo_final.docx`
- **THEN** retorna `{ ok: true, saved: true, path: "saídas/{slug}/conteudo_final.docx" }`
- **THEN** o frontend exibe o banner com o caminho — nenhum download é disparado

#### Scenario: Conclusão sem nenhum ciclo de melhoria
- **WHEN** o usuário clica "Conteúdo Concluído" sem ter executado nenhum ciclo de melhoria
- **THEN** o sistema gera o `.docx` final a partir do conteúdo da Etapa 5 sem modificações
- **THEN** retorna JSON com o caminho salvo
