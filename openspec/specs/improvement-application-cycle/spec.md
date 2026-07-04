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
Após o upload, o sistema SHALL exibir ao usuário um resumo das observações encontradas e aguardar confirmação explícita antes de iniciar o processamento. Somente após a confirmação o sistema SHALL: (1) criar snapshot do conteúdo atual, (2) revisar cada aula individualmente aplicando as melhorias, (3) calcular métricas de mudança por aula, (4) avisar sobre aulas pouco alteradas. O sistema SHALL restaurar automaticamente `sess.conteudoPorAula` a partir do disco antes de iniciar o processamento, caso a sessão em memória esteja vazia. O sistema SHALL passar o conteúdo integral de cada aula (sem truncamento) para `aplicarMelhoriasSkill` — o parâmetro `conteudoAtual` SHALL receber `aula.texto` sem limitação de caracteres.

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
Ao final do ciclo de aplicação de melhorias, o sistema SHALL atualizar automaticamente, no plano de aula, a seção de cada aula cujo conteúdo foi efetivamente alterado (similaridade Jaccard ≤ 0.90 com a versão anterior), usando a `realinharPlanoAulaSkill` para refletir as novas atividades, recursos e sequência didática — mantendo objetivos, título e escopo da aula. A atualização SHALL ser seccional (`replaceLessonBlock`), preservando intactas as seções das demais aulas, e persistida uma única vez em `plano_de_aula.txt` ao final da fase.

#### Scenario: Aula alterada tem a seção do plano realinhada
- **WHEN** o ciclo de melhorias altera o conteúdo da Aula 3 (similaridade ≤ 0.90) e conclui
- **THEN** a seção `# Aula 3` do plano de aula é atualizada para refletir o conteúdo melhorado, as seções das demais aulas permanecem byte a byte idênticas, e `sess.planoAula` + `plano_de_aula.txt` são atualizados com badge de origem `ia`

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
