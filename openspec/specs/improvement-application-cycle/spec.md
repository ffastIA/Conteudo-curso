### Requirement: Upload do documento de revisão anotado
O sistema SHALL aceitar o upload de um arquivo `.docx` contendo o relatório de revisão anotado pelo revisor humano. O arquivo SHALL ser enviado via `multipart/form-data` ao endpoint `POST /api/aplicar-melhorias`. O sistema SHALL extrair o texto do `.docx` e apresentar ao usuário um resumo das anotações detectadas antes de aplicar qualquer alteração. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de processar o arquivo, caso a sessão em memória esteja vazia. O sistema SHALL persistir as observações extraídas em `scr/observacoes_pendentes.json` imediatamente após a extração. O sistema SHALL verificar a similaridade Jaccard entre as novas observações e as observações do upload anterior (lidas de `scr/observacoes_pendentes.json`) antes de sobrescrever o arquivo; se a similaridade exceder `DUPLICATE_OBS_THRESHOLD` (0.85) e ambas as partes tiverem conteúdo substantivo, a resposta SHALL incluir `aviso: 'possivel_duplicata'` com o percentual e a data do upload anterior.

#### Scenario: Upload bem-sucedido sem duplicata
- **WHEN** o usuário envia um arquivo `.docx` válido com observações distintas das anteriores
- **THEN** o sistema extrai o texto e identifica as seções "Observações do Revisor" de cada aula
- **THEN** o sistema persiste as observações em `scr/observacoes_pendentes.json`
- **THEN** a resposta retorna `{ ok: true, aulas, totalComObservacoes }` sem campo `aviso`
- **THEN** o frontend habilita o botão "Aplicar Melhorias"

#### Scenario: Upload com documento similar ao anterior (possível duplicata)
- **WHEN** o usuário envia um `.docx` cujas observações têm similaridade Jaccard > 0.85 com o upload anterior
- **THEN** o sistema persiste as novas observações normalmente em `scr/observacoes_pendentes.json`
- **THEN** a resposta retorna `{ ok: true, aulas, totalComObservacoes, aviso: 'possivel_duplicata', similaridadeObservacoes, dataUltimoUpload }`
- **THEN** o frontend exibe banner de alerta âmbar com percentual e data do upload anterior
- **THEN** o botão "Aplicar Melhorias" permanece desabilitado até o usuário escolher "Aplicar mesmo assim" ou "Cancelar"

#### Scenario: Usuário confirma aplicação mesmo com duplicata detectada
- **WHEN** o aviso de duplicata é exibido e o usuário clica "Aplicar mesmo assim"
- **THEN** o banner de aviso é ocultado
- **THEN** o botão "Aplicar Melhorias" é habilitado e o fluxo prossegue normalmente

#### Scenario: Usuário cancela após aviso de duplicata
- **WHEN** o aviso de duplicata é exibido e o usuário clica "Cancelar"
- **THEN** o banner de aviso e o resumo são ocultados
- **THEN** nenhuma alteração é aplicada ao conteúdo

#### Scenario: Primeiro upload (sem histórico anterior)
- **WHEN** `scr/observacoes_pendentes.json` não existe
- **THEN** nenhuma comparação é realizada
- **THEN** o fluxo prossegue normalmente sem aviso de duplicata

#### Scenario: Upload com sessão vazia recuperada do disco
- **WHEN** o usuário envia um arquivo `.docx` válido mas `sess.conteudoPorAula` está vazio
- **THEN** o sistema restaura `conteudoPorAula` a partir do disco antes de processar o arquivo
- **THEN** o processamento prossegue normalmente, identificando as observações por aula
- **THEN** a resposta retorna o número correto de aulas e de aulas com observações

#### Scenario: Arquivo inválido ou ausente
- **WHEN** o usuário envia um arquivo que não é `.docx` ou o campo `arquivo` está ausente
- **THEN** o sistema retorna erro 400 com mensagem "Arquivo .docx inválido ou não enviado"
- **THEN** nenhuma alteração é aplicada ao conteúdo

#### Scenario: Nenhuma observação encontrada
- **WHEN** o `.docx` enviado não contém texto nas seções "Observações do Revisor"
- **THEN** o sistema avisa o usuário que nenhuma anotação foi detectada
- **THEN** o sistema ainda oferece a opção de aplicar apenas as sugestões automáticas do relatório original

---

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

---

### Requirement: Ciclo iterativo de revisão
O sistema SHALL permitir que o usuário execute o ciclo Etapa 5★ → Etapa 6 quantas vezes considerar necessário. Após cada aplicação de melhorias, a Etapa 5★ SHALL estar disponível para gerar um novo relatório sobre o conteúdo atualizado. O ciclo SHALL ser interrompido apenas quando o usuário acionar explicitamente a conclusão.

#### Scenario: Início de novo ciclo após aplicação
- **WHEN** o stream de aplicação de melhorias conclui com evento `done`
- **THEN** o frontend exibe o botão "Gerar Nova Revisão" (Etapa 5★) habilitado
- **THEN** o usuário pode executar nova revisão sobre o conteúdo recém-aplicado

#### Scenario: Múltiplas iterações
- **WHEN** o usuário executa o ciclo N vezes consecutivas
- **THEN** cada iteração sobrescreve `sess.conteudoPorAula` e `sess.conteudo` com o conteúdo mais recente
- **THEN** os arquivos `aula{NN}_conteudo.txt` em disco são atualizados a cada iteração

---

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

---

### Requirement: Resiliência a rate limit durante aplicação de melhorias
O sistema SHALL completar o ciclo de aplicação de melhorias sem interrupção por rate limit (HTTP 429) mesmo em cursos com grande número de aulas. O cliente OpenAI SHALL ser configurado com `maxRetries: 6` para que o SDK leia automaticamente o header `retry-after` da API e aguarde o tempo indicado antes de tentar novamente. O handler de confirmação SHALL inserir uma pausa mínima de 4 segundos entre o processamento de aulas consecutivas para distribuir o consumo de tokens ao longo da janela TPM.

#### Scenario: Ciclo com muitas aulas sem interrupção por rate limit
- **WHEN** o usuário confirma a aplicação de melhorias em um curso com muitas aulas (ex: 27)
- **THEN** o sistema insere uma pausa de 4 segundos antes de cada aula (exceto a primeira)
- **THEN** o ciclo completo é processado sem interrupção por rate limit

#### Scenario: API retorna 429 durante processamento de uma aula
- **WHEN** a API retorna HTTP 429 (Too Many Requests) durante o processamento de qualquer aula
- **THEN** o SDK aguarda automaticamente o tempo indicado pelo header `retry-after`
- **THEN** a requisição é refeita de forma transparente, sem interromper o SSE nem perder o progresso já emitido
- **THEN** após no máximo 6 tentativas, se ainda houver falha, o erro é propagado normalmente

---

### Requirement: Limite de tokens na geração via web search
O sistema SHALL passar `max_tokens: 16000` no call `openai.chat.completions.create` sempre que `skill.web_search_options` estiver definido, garantindo que respostas longas (aulas com muito conteúdo) não sejam truncadas pelo limite padrão da API.

O sistema SHALL verificar `completion.choices[0]?.finish_reason` após cada call não-streaming de web search. Se `finish_reason === 'length'`, o sistema SHALL:
1. Registrar `console.warn` com o tamanho da resposta recebida.
2. Emitir evento SSE `{ type: 'warning', text: 'Resposta truncada pelo limite de tokens. O conteúdo pode estar incompleto.' }` ao cliente antes de encerrar o SSE com `done`.

O frontend SHALL exibir eventos `{ type: 'warning' }` como um banner de aviso âmbar visível abaixo do painel de progresso, sem interromper a exibição do conteúdo gerado.

#### Scenario: Aula longa sem truncamento
- **WHEN** a resposta do modelo tem `finish_reason === 'stop'`
- **THEN** nenhum aviso é emitido
- **THEN** o conteúdo é salvo normalmente no `.docx`

#### Scenario: Aula longa com truncamento detectado
- **WHEN** a resposta do modelo tem `finish_reason === 'length'`
- **THEN** o servidor registra `console.warn` com o tamanho do texto recebido
- **THEN** o servidor emite evento SSE `{ type: 'warning', text: '...' }` antes do `done`
- **THEN** o frontend exibe banner âmbar informando que o conteúdo pode estar incompleto
- **THEN** o conteúdo parcial é salvo no `.docx` normalmente (não é descartado)

---

### Requirement: Realinhamento do plano de aula após aplicação de melhorias
Ao final do ciclo de aplicação de melhorias, o sistema SHALL atualizar automaticamente, no plano de aula, a seção de cada aula cujo conteúdo foi efetivamente alterado (similaridade Jaccard ≤ 0.90 com a versão anterior), usando a `realinharPlanoAulaSkill` para refletir as novas atividades, recursos e sequência didática — mantendo objetivos, título e escopo da aula. A `realinharPlanoAulaSkill` SHALL receber também a lista de melhorias pedidas pelo revisor para aquela aula (`melhorias`, o mesmo dado já usado por `aplicarMelhoriasSkill`) e SHALL corrigir diretamente, na seção do plano, qualquer melhoria da lista que descreva uma atividade, dinâmica ou recurso presente no plano — não apenas sincronizar a seção ao conteúdo revisado. A atualização SHALL ser seccional (`replaceLessonBlock`), preservando intactas as seções das demais aulas, e persistida uma única vez em `plano_de_aula.txt` ao final da fase.

#### Scenario: Aula alterada tem a seção do plano realinhada
- **WHEN** o ciclo de melhorias altera o conteúdo da Aula 3 (similaridade ≤ 0.90) e conclui
- **THEN** a seção `# Aula 3` do plano de aula é atualizada para refletir o conteúdo melhorado, as seções das demais aulas permanecem byte a byte idênticas, e `sess.planoAula` + `plano_de_aula.txt` são atualizados com badge de origem `ia`

#### Scenario: Melhoria referente a uma atividade do plano é corrigida no plano
- **WHEN** uma melhoria da lista descreve uma atividade presente na seção do plano de aula da aula (ex.: "substituir a dinâmica presencial X por uma atividade assíncrona"), mesmo que essa atividade não conste no conteúdo da aula
- **THEN** `realinharPlanoAulaSkill` recebe essa melhoria e corrige a atividade correspondente na seção do plano; a atividade problemática deixa de constar em `plano_de_aula.txt` após o ciclo

#### Scenario: Aula pouco alterada é pulada
- **WHEN** o conteúdo de uma aula sai do ciclo com similaridade > 0.90
- **THEN** a seção correspondente do plano de aula NÃO é reescrita e o relatório registra a aula como "sem mudança relevante"

#### Scenario: Plano de aula de origem usuário não é sobrescrito
- **WHEN** o ciclo de melhorias conclui e `projeto.json.stages["plano_de_aula"].fonte === "usuario"`
- **THEN** nenhuma seção do plano é alterada e o relatório registra que o realinhamento automático foi pulado por o plano ser versão do usuário

#### Scenario: Falha no realinhamento não desfaz as melhorias
- **WHEN** a chamada de realinhamento de uma aula falha após as melhorias já persistidas
- **THEN** o ciclo termina com `done` (não `error`), o conteúdo melhorado permanece persistido e a falha é registrada via progress e no relatório

---

### Requirement: Sinalização de escopo para ementa e plano de ensino
O realinhamento SHALL NOT alterar a ementa nem o plano de ensino. A `realinharPlanoAulaSkill` SHALL receber ementa e módulos do plano de ensino como referência e sinalizar extrapolações de escopo do conteúdo melhorado em linhas com o prefixo exato `> ⚠️ ALERTA DE ESCOPO:`; o sistema SHALL extrair essas linhas (excluindo-as do plano persistido) e agregá-las à seção `## Realinhamento de Planos` do relatório `melhorias_aplicadas_<timestamp>.docx`.

#### Scenario: Melhoria extrapola o escopo da ementa
- **WHEN** o conteúdo melhorado de uma aula passa a abordar tema não previsto na ementa/módulos do plano de ensino
- **THEN** o relatório de melhorias inclui o alerta de escopo identificando a aula e o tema, e ementa/plano de ensino permanecem inalterados

#### Scenario: Sem extrapolação de escopo
- **WHEN** as melhorias se mantêm dentro do escopo da ementa e do plano de ensino
- **THEN** a seção de realinhamento do relatório não contém alertas de escopo e nenhuma linha de alerta aparece no plano de aula persistido

#### Scenario: Coerência restaurada verificada pela revisão seguinte
- **WHEN** uma nova revisão de qualidade é executada após um ciclo de melhorias com realinhamento
- **THEN** a seção "Compatibilidade com o Plano de Aula" não aponta descompasso causado pelo ciclo anterior (plano e conteúdo coerentes)

---

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

---

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

### Requirement: Verificação mecânica de melhorias autorrelatadas
O sistema SHALL verificar, de forma independente e determinística (sem chamada de API adicional), se as edições de conteúdo e de plano de aula produzidas no ciclo de melhorias correspondem a mudanças reais, em vez de confiar apenas na autoavaliação do modelo (`### Melhorias Aplicadas`). Para cada seção **substituída** (não para seções novas) em `mergeSecoesConteudo` e para cada seção de plano de aula realinhada, o sistema SHALL calcular a similaridade (`textSimilarity`) entre o texto antigo e o novo; seções com similaridade ≥ 0.85 SHALL ser sinalizadas como possivelmente sem mudança real. Adicionalmente, para cada melhoria que mencione um termo entre aspas ou uma sigla em maiúsculas, o sistema SHALL verificar a presença literal (tolerante a acento e caixa) desse termo no conteúdo final da aula ou no plano de aula atualizado; ausência em ambos SHALL ser sinalizada. As sinalizações SHALL ser agregadas numa seção `## Verificação Automática — Possíveis Inconsistências` no relatório de melhorias, distinta da seção autorrelatada pelo modelo, sem alterar ou bloquear a persistência do conteúdo.

#### Scenario: Seção substituída mas textualmente inalterada
- **WHEN** o patch de uma aula substitui uma seção cujo corpo novo é idêntico ou quase idêntico ao original (similaridade ≥ 0.85)
- **THEN** o relatório inclui essa seção na lista de "Verificação Automática — Possíveis Inconsistências", identificando a aula e o título da seção

#### Scenario: Reescrita genuína não é sinalizada
- **WHEN** o patch substitui uma seção com conteúdo substancialmente diferente do original (similaridade < 0.85)
- **THEN** essa seção NÃO aparece na lista de inconsistências

#### Scenario: Seção nova nunca é sinalizada por similaridade
- **WHEN** uma seção é acrescentada como nova (título não existia no texto original)
- **THEN** ela não participa da checagem de similaridade (só seções substituídas são comparadas)

#### Scenario: Termo esperado ausente do resultado final
- **WHEN** uma melhoria menciona um termo entre aspas (ex.: `"Círculo de Histórias"`) ou uma sigla (ex.: `BNCC`) e esse termo não aparece, nem por aproximação de caixa/acento, no conteúdo final da aula nem no plano de aula atualizado
- **THEN** o relatório sinaliza essa melhoria como "termo esperado ausente: <termo>"

#### Scenario: Termo presente em qualquer um dos dois documentos não é sinalizado
- **WHEN** o termo mencionado por uma melhoria aparece no conteúdo da aula OU no plano de aula (não precisa estar nos dois)
- **THEN** nenhuma sinalização é gerada para essa melhoria

#### Scenario: Verificação é informativa, não bloqueante
- **WHEN** uma ou mais inconsistências são detectadas em um ciclo
- **THEN** o conteúdo e o plano continuam sendo persistidos normalmente; nenhuma nova chamada de correção é disparada automaticamente

#### Scenario: Verificação aplicada também ao realinhamento de plano
- **WHEN** `realinharPlanoAulaSkill` substitui a seção do plano de uma aula com texto de similaridade ≥ 0.85 em relação à seção anterior
- **THEN** a mesma sinalização de possível inconsistência aparece no relatório, identificando que o item verificado é do plano de aula

---

### Requirement: Gate de aceite por score no ciclo de melhorias
Após `mergeSecoesConteudo` produzir o candidato revisado de uma aula (patch já mesclado) e antes de persisti-lo, o sistema SHALL julgar original e candidato de forma pareada (ver `quality-scoring`) e SHALL persistir o candidato somente se `scoreCandidato >= scoreOriginal + 0.02`. Quando o candidato for rejeitado, o sistema SHALL preservar o conteúdo anterior da aula, registrar os dois scores no relatório de melhorias, e a aula SHALL permanecer elegível ao realinhamento de plano quando tiver melhorias pendentes (mesma regra já aplicada a aulas truncadas).

#### Scenario: Candidato aceito por elevar o score
- **WHEN** o julgamento pareado retorna `scoreCandidato = 0.81` e `scoreOriginal = 0.76`
- **THEN** o candidato é persistido normalmente (mesclado no conteúdo, salvo em `aulaNN_conteudo.txt`)

#### Scenario: Candidato rejeitado por não elevar o score o suficiente
- **WHEN** o julgamento pareado retorna `scoreCandidato = 0.77` e `scoreOriginal = 0.76` (delta 0.01, abaixo do limiar de 0.02)
- **THEN** o conteúdo anterior da aula é preservado, o relatório registra "Aula N: melhorias descartadas — score não melhorou (antes 0.76 → depois 0.77)"

#### Scenario: Candidato rejeitado por piorar o score
- **WHEN** o julgamento pareado retorna `scoreCandidato < scoreOriginal`
- **THEN** o conteúdo anterior é preservado (mesmo comportamento do cenário anterior), evitando que uma "melhoria" persista uma regressão de qualidade

#### Scenario: Aula rejeitada por score permanece elegível ao realinhamento de plano
- **WHEN** uma aula tem o candidato de conteúdo rejeitado pelo gate de score mas possui melhorias pendentes
- **THEN** a aula participa normalmente da fase de realinhamento de plano, permitindo que melhorias referentes ao plano de aula sejam aplicadas independente do resultado do gate de conteúdo

#### Scenario: Falha no julgamento pareado não interrompe o ciclo
- **WHEN** a chamada do julgamento pareado falha (erro de rede, resposta malformada)
- **THEN** o sistema registra o erro, trata a aula como não avaliada (mesma politica de preservação do conteúdo anterior) e o ciclo continua para as demais aulas

---

### Requirement: Histórico de scores por ciclo
O sistema SHALL persistir, ao final de cada ciclo de melhorias, um registro em `scr/score_historico.json` contendo `{ ciclo, dataHora, porAula: [{ aula, titulo, scoreOriginal, scoreCandidato, aceita }], ganhoMedio }`, onde `ganhoMedio` é a média de `(scoreCandidato - scoreOriginal)` sobre as aulas avaliadas pelo gate (aulas puladas por truncamento não entram na média). A leitura e escrita SHALL ser tolerante a arquivo ausente ou corrompido.

#### Scenario: Primeiro ciclo de um projeto
- **WHEN** `scr/score_historico.json` não existe
- **THEN** o sistema cria o arquivo com o registro do ciclo atual, sem erro

#### Scenario: Ciclos subsequentes acumulam histórico
- **WHEN** já existe histórico de ciclos anteriores
- **THEN** o novo ciclo é acrescentado à lista, preservando os registros anteriores

#### Scenario: Arquivo corrompido não interrompe o ciclo
- **WHEN** `score_historico.json` contém JSON inválido
- **THEN** o sistema trata como histórico vazio e grava o registro do ciclo atual normalmente

---

### Requirement: Aviso de convergência no upload de revisão anotada
Ao processar o upload de um documento de revisão anotado (`POST /api/aplicar-melhorias`), o sistema SHALL ler `score_historico.json`; se o `ganhoMedio` do último ciclo registrado for menor que 0.02, a resposta SHALL incluir `avisoConvergencia` com o ganho médio e o detalhamento por aula. O frontend SHALL exibir esse aviso no mesmo padrão visual e de confirmação já usado para o aviso de upload duplicado, com opções de aplicar mesmo assim ou cancelar.

#### Scenario: Ganho baixo no último ciclo dispara aviso
- **WHEN** o último ciclo registrado teve `ganhoMedio = 0.01`
- **THEN** a resposta do upload inclui `avisoConvergencia` e o frontend exibe o banner de confirmação

#### Scenario: Ganho suficiente não dispara aviso
- **WHEN** o último ciclo registrado teve `ganhoMedio >= 0.02`
- **THEN** a resposta do upload não inclui `avisoConvergencia`

#### Scenario: Sem histórico, sem aviso
- **WHEN** `score_historico.json` não existe ou está vazio
- **THEN** a resposta do upload não inclui `avisoConvergencia`

---

### Requirement: Seção de scores no relatório de melhorias
O relatório `melhorias_aplicadas_<timestamp>.docx` SHALL incluir uma seção `## Scores do Ciclo` listando, para cada aula avaliada pelo gate, o score antes, o score depois e se o candidato foi aceito ou rejeitado.

#### Scenario: Ciclo com aulas aceitas e rejeitadas
- **WHEN** o ciclo processa 3 aulas, 2 aceitas e 1 rejeitada pelo gate
- **THEN** a seção `## Scores do Ciclo` lista as 3 aulas com seus scores antes/depois e o resultado (aceita/rejeitada) de cada uma
