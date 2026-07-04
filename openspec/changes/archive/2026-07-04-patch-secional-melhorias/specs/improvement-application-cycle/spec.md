## MODIFIED Requirements

### Requirement: Aplicação de melhorias por aula com confirmação
Após o upload, o sistema SHALL exibir ao usuário um resumo das melhorias encontradas (com contagem por aula quando extraídas da seção estruturada) e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL: (1) criar snapshot do conteúdo atual, (2) revisar cada aula individualmente aplicando as melhorias, (3) calcular métricas de mudança por aula, (4) avisar sobre aulas pouco alteradas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia. O sistema SHALL passar o conteúdo integral de cada aula (sem truncamento) para `aplicarMelhoriasSkill` — o parâmetro `conteudoAtual` SHALL receber `aula.texto` sem limitação de caracteres. Quando as melhorias vierem da seção estruturada, elas SHALL ser passadas à `aplicarMelhoriasSkill` como **lista numerada**, e a seção `### Melhorias Aplicadas` do resultado SHALL referenciar cada item pelo número (ação tomada ou `Não aplicado: <motivo>`). A resposta do modelo SHALL ser preferencialmente um **patch por seção** (ver requisito "Aplicação de melhorias como patch por seção"), com fallback para reescrita integral quando o patch não for identificável.

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

#### Scenario: Acesso à web durante aplicação
- **WHEN** as observações do revisor ou as sugestões do relatório indicam necessidade de aprofundamento técnico
- **THEN** a `aplicarMelhoriasSkill` usa `gpt-4o-search-preview` com `web_search_options` para buscar referências atualizadas
- **THEN** as fontes consultadas são incluídas no conteúdo revisado da aula correspondente

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

## ADDED Requirements

### Requirement: Aplicação de melhorias como patch por seção, com fallback de reescrita integral
`aplicarMelhoriasSkill` SHALL instruir o modelo a devolver apenas as seções alteradas, delimitadas pelo formato `<<<SECAO: <título>>>` ... `<<<FIM_SECAO>>>`, reutilizando literalmente o título da seção existente quando a edição for sobre uma seção já presente, ou um título novo para conteúdo inédito. O sistema SHALL mesclar cada seção do patch no texto original via `mergeSecoesConteudo`, localizando o título por comparação tolerante a acentuação, caixa e espaços (não por nível de heading Markdown, que varia entre aulas). Título não encontrado no original SHALL ser tratado como seção nova, acrescentada ao final e sinalizada no relatório. Resposta sem nenhum marcador `<<<SECAO:` SHALL ser tratada como reescrita integral (comportamento anterior a esta mudança), sem erro.

#### Scenario: Patch substitui uma seção existente
- **WHEN** a resposta contém `<<<SECAO: Erros Comuns e Pontos de Atenção>>>...conteúdo revisado...<<<FIM_SECAO>>>` e essa seção existe no conteúdo original da aula (independente do nível de heading usado)
- **THEN** o sistema substitui somente o bloco dessa seção no texto original, preservando as demais seções byte a byte

#### Scenario: Patch com múltiplas seções
- **WHEN** a resposta contém dois ou mais blocos `<<<SECAO:>>>` para seções diferentes
- **THEN** todas as seções indicadas são substituídas na mesma operação de merge

#### Scenario: Título de seção novo é acrescentado
- **WHEN** o título de um bloco `<<<SECAO:>>>` não corresponde a nenhuma seção existente no conteúdo original
- **THEN** o bloco é acrescentado ao final do conteúdo da aula e o relatório sinaliza "seção nova: <título>"

#### Scenario: Resposta sem marcadores usa reescrita integral (fallback)
- **WHEN** a resposta do modelo não contém nenhum `<<<SECAO:`
- **THEN** o sistema trata a resposta inteira como o novo conteúdo da aula, como no comportamento anterior a esta mudança

#### Scenario: Guarda de truncamento cobre também o modo patch
- **WHEN** a resposta contém um bloco `<<<SECAO:>>>` aberto sem `<<<FIM_SECAO>>>` correspondente, ou termina sem a seção `### Melhorias Aplicadas`
- **THEN** o sistema aciona a mesma guarda de truncamento e continuação já existente antes de decidir persistir ou preservar o conteúdo anterior

#### Scenario: Relatório lista as seções tocadas
- **WHEN** o merge de uma aula é concluído com sucesso
- **THEN** o relatório de melhorias daquela aula lista as seções substituídas e as seções novas acrescentadas, além da rastreabilidade numerada de melhorias já existente
