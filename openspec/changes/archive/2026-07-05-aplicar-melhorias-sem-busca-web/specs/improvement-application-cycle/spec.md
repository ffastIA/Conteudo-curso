## MODIFIED Requirements

### Requirement: Aplicação de melhorias por aula com confirmação
Após o upload, o sistema SHALL exibir ao usuário um resumo das melhorias encontradas (com contagem por aula quando extraídas da seção estruturada) e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL: (1) criar snapshot do conteúdo atual, (2) revisar cada aula individualmente aplicando as melhorias, (3) calcular métricas de mudança por aula, (4) avisar sobre aulas pouco alteradas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia. O sistema SHALL passar o conteúdo integral de cada aula (sem truncamento) para `aplicarMelhoriasSkill` — o parâmetro `conteudoAtual` SHALL receber `aula.texto` sem limitação de caracteres. Quando as melhorias vierem da seção estruturada, elas SHALL ser passadas à `aplicarMelhoriasSkill` como **lista numerada**, e a seção `### Melhorias Aplicadas` do resultado SHALL referenciar cada item pelo número (ação tomada ou `Não aplicado: <motivo>`). A resposta do modelo SHALL ser preferencialmente um **patch por seção** (ver requisito "Aplicação de melhorias como patch por seção"), com fallback para reescrita integral quando o patch não for identificável. `aplicarMelhoriasSkill` SHALL usar `gpt-4o-mini` (MODEL_ECONOMY), sem busca web — o teto de tokens-por-minuto de modelos de busca é baixo o suficiente para que uma única requisição com conteúdo integral de aula, metodologia e contexto BNCC o ultrapasse, falha que nenhuma quantidade de retry resolve.

#### Scenario: Confirmação e início do processamento
- **WHEN** o usuário clica "Aplicar Melhorias" após visualizar o resumo
- **THEN** o sistema cria snapshot do conteúdo atual em `scr/ciclo_{NNN}/`
- **THEN** inicia SSE streaming processando cada aula em sequência
- **THEN** para cada aula é emitido evento `progress` com o número e título da aula sendo processada

#### Scenario: Confirmação com sessão vazia recuperada do disco
- **WHEN** o usuário confirma a aplicação de melhorias mas `sess.conteudoPorAula` está vazio
- **THEN** o sistema restaura `conteudoPorAula` a partir do disco antes de iniciar o SSE
- **THEN** o processamento prossegue normalmente para cada aula

#### Scenario: Recusa após upload
- **WHEN** o usuário visualiza o resumo e decide não confirmar
- **THEN** nenhuma alteração é aplicada ao conteúdo existente
- **THEN** o usuário pode fazer novo upload ou retornar à Etapa 5★

#### Scenario: Aplicação de melhorias sem busca web
- **WHEN** `aplicarMelhoriasSkill` é invocada para qualquer aula
- **THEN** a chamada usa `gpt-4o-mini`, sem `web_search_options`
- **THEN** o prompt não instrui nem sugere ao modelo buscar referências na web

#### Scenario: Conteúdo integral passado ao modelo
- **WHEN** `aplicarMelhoriasSkill` é invocada para qualquer aula
- **THEN** o parâmetro `conteudoAtual` contém o texto completo da aula sem truncamento
- **THEN** o modelo recebe e pode aplicar melhorias em qualquer parte da aula, independentemente do tamanho

#### Scenario: Auto-auditoria de melhorias pelo modelo
- **WHEN** o modelo gera o conteúdo revisado de cada aula
- **THEN** o output inclui a seção `### Melhorias Aplicadas` ao final
- **THEN** cada observação do revisor é listada com a ação tomada ou justificativa de não-aplicação

#### Scenario: Rastreabilidade numerada por item
- **WHEN** as melhorias de uma aula vieram da seção estruturada (ex.: 3 itens numerados)
- **THEN** o prompt da `aplicarMelhoriasSkill` contém a lista numerada 1..3
- **THEN** a seção `### Melhorias Aplicadas` do resultado referencia cada número com a ação tomada ou `Não aplicado: <motivo>`
