## MODIFIED Requirements

### Requirement: Aplicação de melhorias como patch por seção, com fallback de reescrita integral
`aplicarMelhoriasSkill` SHALL instruir o modelo a devolver apenas as seções alteradas, delimitadas pelo formato `<<<SECAO: <título>>>` ... `<<<FIM_SECAO>>>`, reutilizando literalmente o título da seção existente quando a edição for sobre uma seção já presente, ou um título novo para conteúdo inédito. O sistema SHALL construir, uma única vez a partir do texto original (antes de aplicar qualquer bloco do patch), uma lista fixa de seções: um cabeçalho válido é uma linha não vazia, isolada por linha em branco antes e depois, com menos de 90 caracteres e sem terminar em pontuação de frase. A correspondência de título do patch contra essa lista SHALL ser por igualdade normalizada exata (tolerante a acentuação, caixa e espaços) — nunca por correspondência de substring contra linhas arbitrárias do documento. O resultado final SHALL ser montado em um único passe sobre essa lista fixa, sem recortar e reatribuir o texto incrementalmente a cada bloco. Título não encontrado na lista fixa SHALL ser tratado como seção nova, acrescentada ao final e sinalizada no relatório. Resposta sem nenhum marcador `<<<SECAO:` SHALL ser tratada como reescrita integral (comportamento anterior a esta mudança), sem erro.

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

---

### Requirement: Proteção contra persistência de respostas truncadas
Na aplicação de melhorias, uma resposta SHALL ser considerada incompleta quando `finish_reason === 'length'` OU quando não contiver a seção obrigatória `### Melhorias Aplicadas` (`isRespostaMelhoriasCompleta`). Para resposta incompleta, o sistema SHALL fazer **até duas** tentativas de continuação (mesma skill, texto acumulado até ali encadeado como mensagem `assistant`, instrução de continuar exatamente de onde parou sem repetir), reavaliando a completude após cada tentativa. O prompt de continuação SHALL instruir explicitamente o modelo a não reescrever nenhum bloco `<<<SECAO:>>>...<<<FIM_SECAO>>>` que já tenha sido fechado na tentativa anterior, continuando apenas o conteúdo que ficou incompleto. Se ainda incompleta após as duas tentativas, o sistema SHALL preservar o conteúdo anterior da aula (sem persistir o truncado), emitir aviso SSE e registrar no relatório de melhorias. Uma aula com conteúdo preservado por truncamento SHALL permanecer elegível ao realinhamento de plano quando tiver melhorias pendentes para aquela aula, já que uma melhoria pode se referir exclusivamente ao plano de aula, independente do sucesso da revisão de conteúdo. O console SHALL registrar `finish_reason` e tokens de completion por aula e por tentativa.

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

#### Scenario: Aula truncada permanece elegível ao realinhamento de plano
- **WHEN** uma aula tem seu conteúdo preservado por truncamento (mesmo após as duas tentativas) mas possui melhorias pendentes
- **THEN** a aula participa normalmente da fase de realinhamento de plano, permitindo que melhorias referentes ao plano de aula sejam aplicadas mesmo sem sucesso na revisão do conteúdo

#### Scenario: Diagnóstico por aula e por tentativa
- **WHEN** cada aula é processada no ciclo de melhorias
- **THEN** o console registra `finish_reason` e tokens de completion da chamada inicial e de cada tentativa de continuação realizada

#### Scenario: Continuação não repete seção já fechada
- **WHEN** o modelo recebe a instrução de continuação após uma resposta cortada que já continha um bloco `<<<SECAO:>>>...<<<FIM_SECAO>>>` completo
- **THEN** o prompt da continuação instrui explicitamente a não reescrever esse bloco
