## MODIFIED Requirements

### Requirement: Proteção contra persistência de respostas truncadas
Na aplicação de melhorias, uma resposta SHALL ser considerada incompleta quando `finish_reason === 'length'` OU quando não contiver a seção obrigatória `### Melhorias Aplicadas` (`isRespostaMelhoriasCompleta`). Para resposta incompleta, o sistema SHALL fazer **até duas** tentativas de continuação (mesma skill, texto acumulado até ali encadeado como mensagem `assistant`, instrução de continuar exatamente de onde parou sem repetir), reavaliando a completude após cada tentativa. O prompt de continuação SHALL instruir explicitamente o modelo a não reescrever nenhum bloco `<<<SECAO:>>>...<<<FIM_SECAO>>>` que já tenha sido fechado na tentativa anterior, continuando apenas o conteúdo que ficou incompleto. Se ainda incompleta após as duas tentativas, o sistema SHALL preservar o conteúdo anterior da aula (sem persistir o truncado), emitir aviso SSE e registrar no relatório de melhorias. Uma aula com conteúdo preservado por truncamento NÃO SHALL ser considerada elegível ao realinhamento automático de plano só por ter melhorias pendentes — elegibilidade depende exclusivamente de mudança real de conteúdo detectada (ver requisito "Realinhamento do plano de aula após aplicação de melhorias"). O console SHALL registrar `finish_reason` e tokens de completion por aula e por tentativa.

#### Scenario: Corte recuperado na primeira continuação
- **WHEN** a resposta de uma aula termina com `finish_reason: length` e a primeira continuação conclui o texto com a seção `### Melhorias Aplicadas`
- **THEN** o texto final (parcial + continuação) é persistido normalmente e o fluxo segue para a próxima aula, sem uma segunda tentativa

#### Scenario: Corte recuperado somente na segunda continuação
- **WHEN** a primeira continuação também resulta em resposta incompleta
- **THEN** o sistema tenta uma segunda continuação, reenviando o texto acumulado (original + primeira continuação) como mensagem `assistant`
- **THEN** se a segunda continuação completar a resposta, o texto final é persistido normalmente

#### Scenario: Duas continuações insuficientes preservam o conteúdo anterior
- **WHEN** mesmo após as duas tentativas de continuação a resposta permanece incompleta
- **THEN** `aulaNN_conteudo.txt` e `sess.conteudoPorAula` mantêm a versão anterior íntegra, o cliente recebe `warning`, e o relatório registra "melhorias NÃO aplicadas nesta aula"

#### Scenario: Resposta sem a seção obrigatória é tratada como incompleta
- **WHEN** a resposta termina com `finish_reason: stop` mas sem `### Melhorias Aplicadas`
- **THEN** o sistema aciona a continuação como se fosse corte por tokens

#### Scenario: Aula truncada NÃO aciona realinhamento de plano sem mudança de conteúdo
- **WHEN** uma aula tem seu conteúdo preservado por truncamento (mesmo após as duas tentativas), mesmo que possua melhorias pendentes
- **THEN** a aula não participa da fase de realinhamento de plano — sem mudança real de conteúdo, o plano permanece intocado para aquela aula

#### Scenario: Diagnóstico por aula e por tentativa
- **WHEN** cada aula é processada no ciclo de melhorias
- **THEN** o console registra `finish_reason` e tokens de completion da chamada inicial e de cada tentativa de continuação realizada

#### Scenario: Continuação não repete seção já fechada
- **WHEN** o modelo recebe a instrução de continuação após uma resposta cortada que já continha um bloco `<<<SECAO:>>>...<<<FIM_SECAO>>>` completo
- **THEN** o prompt da continuação instrui explicitamente a não reescrever esse bloco

---

### Requirement: Gate de aceite por score no ciclo de melhorias
Após `mergeSecoesConteudo` produzir o candidato revisado de uma aula (patch já mesclado) e antes de persisti-lo, o sistema SHALL julgar original e candidato de forma pareada (ver `quality-scoring`) e SHALL persistir o candidato somente se `scoreCandidato >= scoreOriginal + 0.02`. Quando o candidato for rejeitado, o sistema SHALL preservar o conteúdo anterior da aula, registrar os dois scores no relatório de melhorias. Uma aula rejeitada pelo gate de score NÃO SHALL ser considerada elegível ao realinhamento automático de plano só por ter melhorias pendentes — mesma regra aplicada a aulas truncadas e a merges rejeitados pela rede de segurança de duplicação.

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

---

### Requirement: Aplicação de melhorias como patch por seção, com fallback de reescrita integral
`aplicarMelhoriasSkill` SHALL instruir o modelo a devolver apenas as seções alteradas, delimitadas pelo formato `<<<SECAO: <título>>>` ... `<<<FIM_SECAO>>>`, reutilizando literalmente o título da seção existente quando a edição for sobre uma seção já presente, ou um título novo para conteúdo inédito. O sistema SHALL construir, uma única vez a partir do texto original (antes de aplicar qualquer bloco do patch), uma lista fixa de seções: um cabeçalho válido é uma linha não vazia, isolada por linha em branco antes e depois, com menos de 90 caracteres e sem terminar em pontuação de frase. A correspondência de título do patch contra essa lista SHALL ser por igualdade normalizada exata (tolerante a acentuação, caixa e espaços) — nunca por correspondência de substring contra linhas arbitrárias do documento. Antes de inserir o corpo de uma seção substituída na reconstrução, o sistema SHALL remover uma eventual primeira linha do corpo (após linhas em branco iniciais) cujo texto normalizado seja igual ao título normalizado da seção-alvo — o modelo às vezes reafirma o título como abertura do corpo mesmo instruído a não reproduzi-lo, e isso não deve ser tratado como conteúdo real nem contado pela rede de segurança de duplicação. O resultado final SHALL ser montado em um único passe sobre essa lista fixa, sem recortar e reatribuir o texto incrementalmente a cada bloco. Título não encontrado na lista fixa SHALL ser tratado como seção nova, acrescentada ao final e sinalizada no relatório. Resposta sem nenhum marcador `<<<SECAO:` SHALL ser tratada como reescrita integral (comportamento anterior a esta mudança), sem erro.

#### Scenario: Patch substitui uma seção existente
- **WHEN** a resposta contém `<<<SECAO: Erros Comuns e Pontos de Atenção>>>...conteúdo revisado...<<<FIM_SECAO>>>` e essa seção existe no conteúdo original da aula (independente do nível de heading usado)
- **THEN** o sistema substitui somente o bloco dessa seção no texto original, preservando as demais seções byte a byte

#### Scenario: Patch com múltiplas seções
- **WHEN** a resposta contém dois ou mais blocos `<<<SECAO:>>>` para seções diferentes
- **THEN** todas as seções indicadas são substituídas na mesma operação de merge

#### Scenario: Título de seção novo é acrescentado
- **WHEN** o título de um bloco `<<<SECAO:>>>` não corresponde a nenhuma seção existente na lista fixa do original
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

#### Scenario: Título de seção mencionado apenas em texto corrido não é confundido com um cabeçalho
- **WHEN** uma frase de corpo de outra seção contém, como substring, o texto de um título de seção (ex.: "...os erros comuns e pontos de atenção devem ser evitados...")
- **THEN** o sistema não trata essa linha como o cabeçalho da seção-alvo, pois ela não está isolada por linha em branco antes e depois

#### Scenario: Blocos duplicados do mesmo título no mesmo patch são deduplicados
- **WHEN** o patch contém dois ou mais blocos `<<<SECAO:>>>` com o mesmo título normalizado (por exemplo, uma continuação por truncamento que reescreve uma seção já enviada)
- **THEN** o sistema aplica apenas o último bloco desse título e registra o descarte do(s) anterior(es) como uma inconsistência sinalizada

#### Scenario: Título ambíguo no texto original
- **WHEN** a lista fixa de seções do original contém mais de uma seção com o mesmo título normalizado
- **THEN** o sistema aplica a substituição apenas à primeira ocorrência e sinaliza a ambiguidade (título e número de ocorrências) no relatório, sem tentar decidir sozinho qual ocorrência era a pretendida

#### Scenario: Rede de segurança rejeita um merge que produziria duplicação
- **WHEN** o texto resultante da reconstrução conteria mais ocorrências de algum título do que o esperado (contagem original mais seções genuinamente novas)
- **THEN** o merge inteiro é rejeitado, o conteúdo anterior da aula é preservado, e a falha é registrada no relatório — mesma política de "nunca persistir uma regressão" já aplicada à guarda de truncamento e ao gate de score

#### Scenario: Eco do título no início do corpo é removido antes da substituição
- **WHEN** o corpo de um bloco `<<<SECAO: Fundamentação Técnica>>>` começa (após linhas em branco) com uma linha cujo texto normalizado é igual a "fundamentação técnica"
- **THEN** essa linha é removida do corpo antes de ele ser inserido na reconstrução, e não é contada como uma nova ocorrência do título pela rede de segurança

#### Scenario: Aula rejeitada pela rede de segurança NÃO aciona realinhamento de plano sem mudança de conteúdo
- **WHEN** uma aula tem o merge rejeitado pela rede de segurança de duplicação, mesmo que possua melhorias pendentes
- **THEN** a aula não participa da fase de realinhamento de plano — sem mudança real de conteúdo, o plano permanece intocado para aquela aula

---

### Requirement: Realinhamento do plano de aula após aplicação de melhorias
Ao final do ciclo de aplicação de melhorias, o sistema SHALL atualizar automaticamente, no plano de aula, a seção de cada aula cujo conteúdo foi efetivamente alterado (similaridade Jaccard ≤ 0.90 com a versão anterior), usando a `realinharPlanoAulaSkill` para refletir as novas atividades, recursos e sequência didática — mantendo objetivos, título e escopo da aula. Elegibilidade para o realinhamento SHALL depender exclusivamente dessa mudança real de conteúdo — ter melhorias pendentes na lista, por si só, NÃO SHALL tornar uma aula elegível quando seu conteúdo não mudou (aula truncada, rejeitada pelo gate de score, ou com merge rejeitado pela rede de segurança de duplicação). A `realinharPlanoAulaSkill` SHALL receber também a lista de melhorias pedidas pelo revisor para aquela aula (`melhorias`, o mesmo dado já usado por `aplicarMelhoriasSkill`) e SHALL corrigir diretamente, na seção do plano, qualquer melhoria da lista que descreva uma atividade, dinâmica ou recurso presente no plano — não apenas sincronizar a seção ao conteúdo revisado. A atualização SHALL ser seccional (`replaceLessonBlock`), preservando intactas as seções das demais aulas, e persistida uma única vez em `plano_de_aula.txt` ao final da fase.

#### Scenario: Aula alterada tem a seção do plano realinhada
- **WHEN** o ciclo de melhorias altera o conteúdo da Aula 3 (similaridade ≤ 0.90) e conclui
- **THEN** a seção `# Aula 3` do plano de aula é atualizada para refletir o conteúdo melhorado, as seções das demais aulas permanecem byte a byte idênticas, e `sess.planoAula` + `plano_de_aula.txt` são atualizados com badge de origem `ia`

#### Scenario: Melhoria referente a uma atividade do plano é corrigida no plano
- **WHEN** uma melhoria da lista descreve uma atividade presente na seção do plano de aula da aula (ex.: "substituir a dinâmica presencial X por uma atividade assíncrona"), mesmo que essa atividade não conste no conteúdo da aula, E o conteúdo dessa aula foi efetivamente alterado no ciclo
- **THEN** `realinharPlanoAulaSkill` recebe essa melhoria e corrige a atividade correspondente na seção do plano; a atividade problemática deixa de constar em `plano_de_aula.txt` após o ciclo

#### Scenario: Aula pouco alterada é pulada
- **WHEN** o conteúdo de uma aula sai do ciclo com similaridade > 0.90 (inclui aulas truncadas, rejeitadas por score, ou com merge rejeitado pela rede de segurança — todas marcadas com similaridade 1)
- **THEN** a seção correspondente do plano de aula NÃO é reescrita e o relatório registra a aula como "sem mudança relevante"

#### Scenario: Plano de aula de origem usuário não é sobrescrito
- **WHEN** o ciclo de melhorias conclui e `projeto.json.stages["plano_de_aula"].fonte === "usuario"`
- **THEN** nenhuma seção do plano é alterada e o relatório registra que o realinhamento automático foi pulado por o plano ser versão do usuário

#### Scenario: Falha no realinhamento não desfaz as melhorias
- **WHEN** a chamada de realinhamento de uma aula falha após as melhorias já persistidas
- **THEN** o ciclo termina com `done` (não `error`), o conteúdo melhorado permanece persistido e a falha é registrada via progress e no relatório
