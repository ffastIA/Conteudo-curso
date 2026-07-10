## MODIFIED Requirements

### Requirement: Aplicação de melhorias por aula com confirmação
Após o upload, o sistema SHALL exibir ao usuário um resumo das melhorias encontradas (com contagem por aula quando extraídas da seção estruturada) e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL: (1) criar snapshot do conteúdo atual, (2) revisar cada aula individualmente aplicando as melhorias, (3) calcular métricas de mudança por aula, (4) avisar sobre aulas pouco alteradas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia. Quando o upload foi processado pela seção estruturada (não pelo modo legado), o sistema SHALL pular integralmente qualquer aula que não conste na seção "Melhorias a serem Aplicadas" com pelo menos uma melhoria (nem itens sugeridos pela IA, nem itens `[user]`) — nenhuma chamada ao modelo é feita para essa aula, o conteúdo é mantido byte a byte, e a aula não participa da pausa de 4 segundos entre chamadas nem do gate de score. Essa restrição NÃO se aplica ao modo legado, no qual todas as aulas continuam sendo processadas como hoje. O sistema SHALL passar o conteúdo integral de cada aula (sem truncamento) para `aplicarMelhoriasSkill` — o parâmetro `conteudoAtual` SHALL receber `aula.texto` sem limitação de caracteres. Quando as melhorias vierem da seção estruturada, elas SHALL ser passadas à `aplicarMelhoriasSkill` como **lista numerada** (incluindo os itens marcados como `[user]`, sem distinção visível para o modelo), e a seção `### Melhorias Aplicadas` do resultado SHALL referenciar cada item pelo número (ação tomada ou `Não aplicado: <motivo>`). A resposta do modelo SHALL ser preferencialmente um **patch por seção** (ver requisito "Aplicação de melhorias como patch por seção"), com fallback para reescrita integral quando o patch não for identificável. `aplicarMelhoriasSkill` SHALL usar `gpt-4o-mini` (MODEL_ECONOMY), sem busca web — o teto de tokens-por-minuto de modelos de busca é baixo o suficiente para que uma única requisição com conteúdo integral de aula, metodologia e contexto BNCC o ultrapasse, falha que nenhuma quantidade de retry resolve.

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

#### Scenario: Aula sem melhorias na seção é pulada sem chamada de API
- **WHEN** o upload foi processado pela seção estruturada e a Aula 4 não tem nenhuma melhoria (bloco ausente, bloco vazio, ou marcado `Nenhuma`)
- **THEN** o sistema não chama `aplicarMelhoriasSkill` nem qualquer API para a Aula 4
- **THEN** o conteúdo da Aula 4 permanece byte a byte idêntico ao anterior
- **THEN** o relatório registra a Aula 4 como "sem melhorias na seção — mantida sem alteração"
- **THEN** a Aula 4 não é elegível ao realinhamento automático de plano

#### Scenario: Modo legado continua processando todas as aulas
- **WHEN** o upload foi processado pelo parser legado (`modoLegado: true`, seção estruturada ausente)
- **THEN** todas as aulas continuam sendo processadas normalmente, mesmo as sem observações extraídas — comportamento inalterado por esta mudança

### Requirement: Parser da seção estruturada de melhorias
No upload do documento de revisão anotado, o sistema SHALL localizar a **última ocorrência** do título "Melhorias a serem Aplicadas" (tolerante a caixa e acentos) e extrair as melhorias exclusivamente dessa seção: blocos abertos por linha iniciando com `Aula NN` (aceitando `Aula 1` e `Aula 01`, com ou sem título após), mapeados ao índice da sessão **pelo número**; dentro de cada bloco, **cada linha não vazia SHALL ser tratada como uma melhoria**, removendo-se prefixos de lista (`-`, `*`, `•`, `1.`, `1)`) quando presentes, sem jamais exigi-los. A palavra reservada `Nenhuma` (sozinha no bloco) SHALL pular a aula explicitamente. O sistema SHALL reconhecer o marcador `[user]` (tolerante a caixa, acentuação e um ponto final opcional) em **duas formas**, ambas sinalizando a melhoria correspondente como **forçada** (ver requisito "Gate de aceite por score no ciclo de melhorias" para o efeito dessa sinalização): (1) **sozinho em sua própria linha** — toda melhoria não vazia escrita após essa linha, até o próximo bloco `Aula NN` ou o fim da seção, é adicionada à lista e sinalizada como forçada; (2) **como prefixo de uma linha de item** (`[user] texto da melhoria`, mesmo padrão já usado pela tag `[Critério]` deste projeto) — apenas aquele item é sinalizado como forçado, e o prefixo `[user]` SHALL ser removido do texto antes de a melhoria ser adicionada à lista (nunca deve vazar como texto literal para o modelo). Uma aula sem nenhum item marcado por `[user]`, em qualquer das duas formas, SHALL ter seu comportamento de gate inalterado. O parsing SHALL ser implementado em função exportável (`parseMelhoriasEstruturadas`) testável isoladamente, retornando também a sinalização de itens forçados por aula.

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

#### Scenario: Itens após o marcador [user] são sinalizados como forçados
- **WHEN** o bloco da Aula 2 contém duas melhorias sugeridas pela IA, seguidas da linha `[user]` e mais uma linha com um item escrito pelo revisor
- **THEN** as três melhorias entram na lista da Aula 2 (mesma lista numerada usada pela `aplicarMelhoriasSkill`)
- **THEN** a Aula 2 é sinalizada como tendo item forçado por `[user]`

#### Scenario: Marcador [user] sem itens preenchidos não força nada
- **WHEN** o bloco de uma aula contém a linha `[user]` seguida apenas de linhas em branco (ou nenhuma linha) até o próximo bloco
- **THEN** a aula não é sinalizada como forçada e o gate de score se comporta normalmente para ela

#### Scenario: Marcador tolerante a variações de grafia
- **WHEN** o revisor escreve `[User]`, `[USER]` ou `[user].` no lugar de `[user]`
- **THEN** o parser reconhece a linha como o marcador da mesma forma

#### Scenario: Marcador [user] como prefixo de um item na mesma linha
- **WHEN** o bloco de uma aula contém a linha `[user] Incluir conceitos mais modernos dos tipos de memória ROM`
- **THEN** a melhoria `Incluir conceitos mais modernos dos tipos de memória ROM` (sem o prefixo `[user]`) é adicionada à lista da aula
- **THEN** a aula é sinalizada como tendo item forçado por `[user]`

#### Scenario: Marcador [user] inline convive com itens normais no mesmo bloco
- **WHEN** o bloco de uma aula contém uma sugestão da IA, seguida de uma linha `[user] item forçado do revisor`, seguida de outra sugestão da IA
- **THEN** as três melhorias entram na lista da aula, na ordem em que aparecem, com o prefixo `[user]` removido apenas do item que o continha
- **THEN** a aula é sinalizada como tendo item forçado por `[user]`

### Requirement: Gate de aceite por score no ciclo de melhorias
Após `mergeSecoesConteudo` produzir o candidato revisado de uma aula (patch já mesclado) e antes de persisti-lo, o sistema SHALL julgar original e candidato de forma pareada (ver `quality-scoring`) e SHALL persistir o candidato somente se `scoreCandidato >= scoreOriginal + 0.02`. Quando o candidato for rejeitado, o sistema SHALL preservar o conteúdo anterior da aula, registrar os dois scores no relatório de melhorias. Uma aula rejeitada pelo gate de score NÃO SHALL ser considerada elegível ao realinhamento automático de plano só por ter melhorias pendentes — mesma regra aplicada a aulas truncadas e a merges rejeitados pela rede de segurança de duplicação. Quando a aula tiver ao menos uma melhoria sinalizada como forçada por `[user]` (ver requisito "Parser da seção estruturada de melhorias"), o sistema SHALL ignorar o gate de score inteiramente para aquela aula: NÃO SHALL invocar o julgamento pareado, SHALL persistir o candidato incondicionalmente (`scoreOriginal` e `scoreCandidato` permanecem `null`, `aceita = true`), e essa aula permanece sujeita normalmente às demais redes de segurança (guarda de truncamento/continuação e rede de segurança de duplicação de seções), que SHALL continuar podendo rejeitar o candidato por esses motivos mesmo com item forçado presente.

#### Scenario: Candidato aceito por elevar o score
- **WHEN** o julgamento pareado retorna `scoreCandidato = 0.81` e `scoreOriginal = 0.76`
- **THEN** o candidato é persistido normalmente (mesclado no conteúdo, salvo em `aulaNN_conteudo.txt`)

#### Scenario: Candidato rejeitado por não elevar o score o suficiente
- **WHEN** o julgamento pareado retorna `scoreCandidato = 0.77` e `scoreOriginal = 0.76` (delta 0.01, abaixo do limiar de 0.02)
- **THEN** o conteúdo anterior da aula é preservado, o relatório registra "Aula N: melhorias descartadas — score não melhorou (antes 0.76 → depois 0.77)"

#### Scenario: Candidato rejeitado por piorar o score
- **WHEN** o julgamento pareado retorna `scoreCandidato < scoreOriginal`
- **THEN** o conteúdo anterior é preservado (mesmo comportamento do cenário anterior), evitando que uma "melhoria" persista uma regressão de qualidade

#### Scenario: Aula rejeitada por score NÃO aciona realinhamento de plano sem mudança de conteúdo
- **WHEN** uma aula tem o candidato de conteúdo rejeitado pelo gate de score, mesmo que possua melhorias pendentes
- **THEN** a aula não participa da fase de realinhamento de plano — sem mudança real de conteúdo, o plano permanece intocado para aquela aula

#### Scenario: Falha no julgamento pareado não interrompe o ciclo
- **WHEN** a chamada do julgamento pareado falha (erro de rede, resposta malformada)
- **THEN** o sistema registra o erro, trata a aula como não avaliada (mesma politica de preservação do conteúdo anterior) e o ciclo continua para as demais aulas

#### Scenario: Aula com item forçado por [user] ignora o gate de score
- **WHEN** a Aula 5 tem ao menos uma melhoria sinalizada como forçada e o merge do patch produz um candidato válido (sem truncamento, sem rejeição da rede de segurança de duplicação)
- **THEN** o sistema não chama o julgamento pareado para a Aula 5
- **THEN** o candidato é persistido incondicionalmente, independentemente de que score teria resultado
- **THEN** o relatório registra a Aula 5 como aceita por força do marcador `[user]`, sem exibir scores numéricos

#### Scenario: Item forçado não bypassa a guarda de truncamento nem a rede de segurança de duplicação
- **WHEN** a Aula 5 tem melhoria forçada por `[user]` mas a resposta do modelo permanece truncada mesmo após as continuações, ou o merge seria rejeitado por duplicar uma seção
- **THEN** o sistema aplica a guarda correspondente normalmente (preserva o conteúdo anterior) exatamente como faria para uma aula sem item forçado — o bypass do marcador `[user]` cobre apenas o gate de score

### Requirement: Seção de scores no relatório de melhorias
O relatório `melhorias_aplicadas_<timestamp>.docx` SHALL incluir uma seção `## Scores do Ciclo` listando, para cada aula avaliada pelo gate, o score antes, o score depois e se o candidato foi aceito ou rejeitado. Para uma aula aceita por força do marcador `[user]` (sem julgamento pareado realizado), a linha correspondente SHALL indicar explicitamente "aceita (forçada por [user])" no lugar dos valores numéricos de score, distinguindo-a de uma aceitação normal por score e de uma aula não avaliada por falha técnica.

#### Scenario: Ciclo com aulas aceitas e rejeitadas
- **WHEN** o ciclo processa 3 aulas, 2 aceitas e 1 rejeitada pelo gate
- **THEN** a seção `## Scores do Ciclo` lista as 3 aulas com seus scores antes/depois e o resultado (aceita/rejeitada) de cada uma

#### Scenario: Aula aceita por força do marcador [user] é distinguida no relatório
- **WHEN** o ciclo processa uma aula com item forçado por `[user]` cujo candidato foi persistido sem julgamento pareado
- **THEN** a linha dessa aula na seção `## Scores do Ciclo` mostra "aceita (forçada por [user])" em vez de valores de score
- **THEN** essa aula não entra no cálculo de `ganhoMedio` do histórico de scores (mesma regra já aplicada a aulas não avaliadas por falha técnica)
