## ADDED Requirements

### Requirement: Parser da seção estruturada de melhorias
No upload do documento de revisão anotado, o sistema SHALL localizar a **última ocorrência** do título "Melhorias a serem Aplicadas" (tolerante a caixa e acentos) e extrair as melhorias exclusivamente dessa seção: blocos abertos por linha iniciando com `Aula NN` (aceitando `Aula 1` e `Aula 01`, com ou sem título após), mapeados ao índice da sessão **pelo número**; dentro de cada bloco, **cada linha não vazia SHALL ser tratada como uma melhoria**, removendo-se prefixos de lista (`-`, `*`, `•`, `1.`, `1)`) quando presentes, sem jamais exigi-los. A palavra reservada `Nenhuma` (sozinha no bloco) SHALL pular a aula explicitamente. O parsing SHALL ser implementado em função exportável (`parseMelhoriasEstruturadas`) testável isoladamente.

#### Scenario: Itens sem marcador de lista (mammoth descarta bullets do Word)
- **WHEN** o revisor usa a lista nativa do Word e o texto extraído contém linhas puras sem `-`
- **THEN** cada linha não vazia do bloco é reconhecida como uma melhoria distinta

#### Scenario: Mapeamento pelo número da aula
- **WHEN** a seção contém os blocos na ordem `Aula 03`, `Aula 01` (Aula 02 ausente)
- **THEN** as melhorias são atribuídas às aulas 3 e 1 respectivamente e a aula 2 fica sem melhorias, sem erro

#### Scenario: Palavra reservada Nenhuma
- **WHEN** o bloco de uma aula contém apenas a linha `Nenhuma`
- **THEN** a aula é registrada explicitamente sem melhorias (nenhum item é criado)

#### Scenario: Âncora repetida no corpo do documento
- **WHEN** a expressão "melhorias a serem aplicadas" aparece também no texto corrido do relatório
- **THEN** o parser usa somente a última ocorrência como início da seção estruturada

#### Scenario: Contagem por item na confirmação
- **WHEN** o upload é processado com a seção estruturada presente
- **THEN** a resposta inclui a quantidade de melhorias por aula e o resumo de confirmação exibe "Aula N: X melhoria(s)"

---

### Requirement: Fallback legado quando a seção estruturada está ausente
Se o documento enviado não contiver a seção "Melhorias a serem Aplicadas", o sistema SHALL processá-lo com o parser legado de "Observações do Revisor" e sinalizar o modo na resposta (`modoLegado: true`) com aviso ao usuário.

#### Scenario: Documento no formato antigo
- **WHEN** o revisor envia um relatório gerado antes desta mudança (sem a seção estruturada)
- **THEN** as observações são extraídas pelo mecanismo legado e a resposta contém o aviso "seção estruturada não encontrada — usando modo legado"

#### Scenario: Seção presente tem precedência total
- **WHEN** o documento contém a seção estruturada E textos sob "Observações do Revisor" no corpo
- **THEN** somente os itens da seção estruturada são considerados para aplicação

## MODIFIED Requirements

### Requirement: Aplicação de melhorias por aula com confirmação
Após o upload, o sistema SHALL exibir ao usuário um resumo das melhorias encontradas (com contagem por aula quando extraídas da seção estruturada) e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL: (1) criar snapshot do conteúdo atual, (2) revisar cada aula individualmente aplicando as melhorias, (3) calcular métricas de mudança por aula, (4) avisar sobre aulas pouco alteradas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia. O sistema SHALL passar o conteúdo integral de cada aula (sem truncamento) para `aplicarMelhoriasSkill` — o parâmetro `conteudoAtual` SHALL receber `aula.texto` sem limitação de caracteres. Quando as melhorias vierem da seção estruturada, elas SHALL ser passadas à `aplicarMelhoriasSkill` como **lista numerada**, e a seção `### Melhorias Aplicadas` do resultado SHALL referenciar cada item pelo número (ação tomada ou `Não aplicado: <motivo>`).

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
