## ADDED Requirements

### Requirement: Geração em duas passadas
O sistema SHALL gerar cada aula em duas passadas: primeiro um roteiro em JSON com as seções planejadas (um bloco por objetivo, mais síntese e referências) e meta de palavras por seção; depois a redação de cada seção em chamada própria em streaming, recebendo o dossiê de fontes, o resumo das seções já escritas e o mapa das demais aulas, com teto de saída por seção.

#### Scenario: Aula gerada por seções
- **WHEN** a Etapa 5 gera uma aula
- **THEN** ocorre uma chamada de roteiro e uma chamada por seção planejada, e o texto final contém todas as seções

#### Scenario: Roteiro inválido
- **WHEN** o JSON do roteiro não é válido após 1 retentativa
- **THEN** a aula é gerada em passada única e submetida à verificação de completude

### Requirement: Continuação automática em truncamento
Quando uma seção terminar com `finish_reason: 'length'`, o sistema SHALL continuar a geração automaticamente por até 2 tentativas, também na geração inicial.

#### Scenario: Seção cortada
- **WHEN** uma seção termina com `finish_reason: 'length'`
- **THEN** uma continuação é solicitada e o texto resultante é concatenado

### Requirement: Aula incompleta nunca é aceita
Se após as continuações a aula continuar incompleta, o sistema SHALL marcá-la `incompleta` em `projeto.json`, gravar o texto parcial em `aulaNN_conteudo.partial.txt` (nunca no `.txt` oficial) e SHALL bloquear o avanço da Etapa 5 até a aula ser regenerada.

#### Scenario: Continuação esgotada
- **WHEN** a segunda continuação ainda termina com `length`
- **THEN** o `.partial.txt` é gravado, o `.txt` oficial não é criado ou alterado e o avanço é bloqueado

### Requirement: Verificação mecânica de completude
O sistema SHALL verificar, independentemente do modelo, se todas as seções planejadas estão presentes, se síntese e referências estão ao final, se não há bloco de código ou lista abertos e se a contagem de palavras atinge o mínimo da meta; abaixo do mínimo, uma passada de expansão SHALL refazer apenas as seções curtas.

#### Scenario: Seção ausente
- **WHEN** uma seção planejada não aparece no texto
- **THEN** a aula é marcada incompleta ou a seção é regenerada

#### Scenario: Seção curta
- **WHEN** uma seção tem menos palavras que o mínimo da meta
- **THEN** uma passada de expansão refaz somente essa seção

### Requirement: Estado visível por aula
A UI SHALL mostrar por aula um selo de estado (`completa`, `curta`, `incompleta`) no lugar do aviso que hoje some do log.

#### Scenario: Aula incompleta
- **WHEN** a aula é marcada incompleta
- **THEN** a UI mostra o selo "incompleta" e o botão de regenerar

### Requirement: Localização do bloco de aula sem truncamento
`extractLessonBlock` SHALL localizar o bloco pelo número capturado no cabeçalho `# Aula N:` e SHALL falhar com mensagem clara quando o plano não tiver cabeçalhos, sem devolver `truncate(texto, 1500)`.

#### Scenario: Plano sem cabeçalhos
- **WHEN** o plano de aula não contém `# Aula N:`
- **THEN** a função falha com mensagem clara em vez de devolver o início do texto

### Requirement: Registro de geração e modelo configurável
O sistema SHALL registrar `finish_reason`, tokens de saída e palavras por aula em `scr/geracao_log.json` e SHALL permitir escolher o modelo de conteúdo por `OPENAI_CONTENT_MODEL`, com padrão `gpt-4o-mini`.

#### Scenario: Log de geração
- **WHEN** uma aula termina
- **THEN** `geracao_log.json` contém `finish_reason`, `completionTokens` e `palavras` dessa aula
