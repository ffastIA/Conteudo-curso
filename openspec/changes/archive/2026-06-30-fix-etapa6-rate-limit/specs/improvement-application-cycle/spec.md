## ADDED Requirements

### Requirement: Resiliência a rate limit durante aplicação de melhorias
O sistema SHALL completar o ciclo de aplicação de melhorias sem interrupção por rate limit (HTTP 429) mesmo em cursos com grande número de aulas. O cliente OpenAI SHALL ser configurado com `maxRetries: 6` para que o SDK leia automaticamente o header `retry-after` da API e aguarde o tempo indicado antes de tentar novamente. O handler de confirmação SHALL inserir uma pausa mínima de 4 segundos entre o processamento de aulas consecutivas para distribuir o consumo de tokens ao longo da janela TPM. O conteúdo atual de cada aula SHALL ser truncado a 3.000 caracteres antes de ser incluído no prompt de `aplicarMelhoriasSkill`.

#### Scenario: Ciclo com muitas aulas sem interrupção por rate limit
- **WHEN** o usuário confirma a aplicação de melhorias em um curso com muitas aulas (ex: 27)
- **THEN** o sistema insere uma pausa de 4 segundos antes de cada aula (exceto a primeira)
- **THEN** o ciclo completo é processado sem interrupção por rate limit

#### Scenario: API retorna 429 durante processamento de uma aula
- **WHEN** a API retorna HTTP 429 (Too Many Requests) durante o processamento de qualquer aula
- **THEN** o SDK aguarda automaticamente o tempo indicado pelo header `retry-after`
- **THEN** a requisição é refeita de forma transparente, sem interromper o SSE nem perder o progresso já emitido
- **THEN** após no máximo 6 tentativas, se ainda houver falha, o erro é propagado normalmente

#### Scenario: Conteúdo da aula truncado antes do prompt
- **WHEN** `aplicarMelhoriasSkill` é invocada para qualquer aula
- **THEN** o parâmetro `conteudoAtual` contém no máximo 3.000 caracteres do texto da aula
- **THEN** as observações do revisor são passadas sem truncamento
