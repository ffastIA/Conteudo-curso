## ADDED Requirements

### Requirement: Validação e correção automática da quantidade de aulas planejadas
O sistema SHALL validar, após receber a resposta da IA em `planLessons()`, se a quantidade de aulas retornada corresponde a `numAulas` (calculado a partir de carga horária ÷ duração por aula). Em caso de divergência, o sistema SHALL tentar novamente uma única vez, informando à IA a quantidade incorreta da tentativa anterior e a quantidade exata exigida. O sistema SHALL usar o resultado mais próximo de `numAulas` entre as duas tentativas, sem interromper a geração do curso mesmo que a divergência persista após o retry.

#### Scenario: IA acerta a quantidade de primeira
- **WHEN** a primeira chamada a `planLessonsSkill` retorna exatamente `numAulas` aulas
- **THEN** o sistema usa esse resultado diretamente, sem tentar novamente

#### Scenario: IA erra a quantidade e acerta no retry
- **WHEN** a primeira chamada retorna uma quantidade diferente de `numAulas`
- **THEN** o sistema emite uma mensagem de progresso visível ao usuário indicando a nova tentativa
- **THEN** o sistema tenta novamente informando à IA o erro da tentativa anterior
- **THEN** se a segunda tentativa retornar exatamente `numAulas`, esse resultado é usado

#### Scenario: IA erra a quantidade nas duas tentativas
- **WHEN** tanto a primeira quanto a segunda chamada retornam uma quantidade diferente de `numAulas`
- **THEN** o sistema usa o resultado cuja quantidade está mais próxima de `numAulas`
- **THEN** o sistema registra um aviso no log do servidor com as quantidades obtidas em ambas as tentativas
- **THEN** a geração do curso prossegue normalmente com o resultado escolhido, sem interrupção

---

### Requirement: Pausa entre chamadas sequenciais na geração de conteúdo por aula
O endpoint `GET /api/conteudo` SHALL aguardar um intervalo mínimo de 4 segundos entre o início da geração de uma aula e o início da geração da aula seguinte, a partir da segunda aula, para reduzir a probabilidade de disparar rate-limit da OpenAI em cursos com muitas aulas.

#### Scenario: Geração de curso com múltiplas aulas
- **WHEN** o endpoint `GET /api/conteudo` processa a aula de índice N (N > 0) no loop de geração
- **THEN** o sistema aguarda ao menos 4 segundos após o término do processamento da aula anterior antes de iniciar a chamada à OpenAI para a aula N

### Requirement: Timeout de inatividade em chamadas de streaming à OpenAI
A função `streamSkillToClient` SHALL abortar uma chamada de streaming à OpenAI se nenhum dado (`delta`) for recebido por um intervalo configurado de inatividade, evitando que o loop de geração fique preso indefinidamente aguardando uma chamada travada, sem impor um limite à duração total de uma geração legítima que continua recebendo dados normalmente.

#### Scenario: Chamada de streaming trava sem retornar dados
- **WHEN** uma chamada de streaming à OpenAI para gerar o conteúdo de uma aula para de emitir novos deltas por mais que o intervalo de inatividade configurado
- **THEN** a chamada é abortada
- **THEN** o sistema emite um evento SSE `error` identificando a aula afetada
- **THEN** a conexão SSE é encerrada, em vez de permanecer presa indefinidamente

#### Scenario: Geração longa porém ativa não é interrompida
- **WHEN** uma chamada de streaming continua recebendo deltas normalmente, mesmo que a geração completa da aula leve vários minutos
- **THEN** a chamada NÃO é abortada por timeout, desde que o intervalo entre deltas consecutivos permaneça abaixo do limite de inatividade configurado

### Requirement: Timeout em chamadas não-streaming de conteúdo com busca web
A função `streamSkillToClient` SHALL aplicar um timeout fixo às chamadas não-streaming (`web_search_options`) à OpenAI usadas na geração de conteúdo, análogo ao já aplicado em `tentarPesquisaWeb`, mas dimensionado para respostas mais longas.

#### Scenario: Chamada não-streaming trava
- **WHEN** uma chamada não-streaming à OpenAI com `web_search_options` não retorna dentro do timeout configurado
- **THEN** a chamada é abortada
- **THEN** o sistema emite um evento SSE `error` ao cliente

---

### Requirement: Renderização client-side responsiva durante streaming SSE
O cliente SHALL exibir o texto recebido via SSE (`streamSSE` em `public/app.js`, usado por plano de aula, conteúdo e demais etapas que consomem streaming) sem bloquear o thread principal do navegador de forma contínua e sem re-render completo por evento `token` recebido. O sistema SHALL agrupar (coalescer) múltiplos eventos `token` recebidos entre frames de renderização em uma única atualização de DOM, de modo que o custo total de renderização não cresça de forma quadrática com o volume de texto acumulado ao longo de uma sessão de streaming. Ao término do streaming (evento `done`), o sistema SHALL exibir o texto final completo, idêntico ao produzido por `renderMarkdown` sobre o texto consolidado enviado pelo servidor.

#### Scenario: Geração de curso com muitas aulas não trava o navegador
- **WHEN** o usuário inicia a geração de plano de aula ou conteúdo para um curso com 20 aulas
- **THEN** o navegador permanece responsivo (não exibe o diálogo de "página não responde") durante toda a geração
- **THEN** a mensagem de progresso "Gerando aula N de 20" é atualizada normalmente conforme cada aula é processada

#### Scenario: Múltiplos tokens chegam entre frames de renderização
- **WHEN** o servidor emite vários eventos `token` para a mesma etapa antes do próximo frame de renderização do navegador
- **THEN** o cliente acumula o texto de todos esses eventos
- **THEN** o cliente executa no máximo uma atualização de DOM (`renderMarkdown` + atualização da área de resultado) para cobrir todos os eventos acumulados naquele frame

#### Scenario: Conteúdo final idêntico ao comportamento anterior
- **WHEN** o evento `done` é recebido, com o texto completo consolidado da etapa
- **THEN** o cliente renderiza imediatamente esse texto final, sem esperar o próximo frame agendado
- **THEN** o HTML exibido é equivalente ao produzido por `renderMarkdown(fullText)` sobre o texto final, para o mesmo conteúdo de entrada

### Requirement: Regex de agrupamento de lista sem backtracking catastrófico
A função `renderMarkdown` SHALL processar listas markdown (`- item` / `* item`) sem usar um padrão de regex com quantificador repetido envolvendo um grupo que contém `.*` (formato suscetível a backtracking catastrófico), preservando o agrupamento de itens consecutivos em um único elemento `<ul>`.

#### Scenario: Texto com muitos itens de lista não degrada performance
- **WHEN** o texto acumulado contém dezenas de itens de lista (`<li>...</li>`) consecutivos, como listas de objetivos/materiais em planos de aula
- **THEN** `renderMarkdown` processa o texto em tempo proporcional ao tamanho do texto, sem backtracking exponencial
- **THEN** o HTML resultante agrupa os itens consecutivos em um único `<ul>`, preservando o comportamento visual atual

## REMOVED Requirements

### Requirement: Deduplicação automática por similaridade Jaccard
**Reason:** A regeneração automática silenciosa impede que o usuário veja e julgue as sobreposições detectadas. O novo ciclo de revisão (Etapa 5★) expõe a análise Jaccard como reporte visível e deixa a decisão de correção ao revisor humano. Skills removidas: `conteudoRegenSkill`.
**Migration:** A detecção de similaridade Jaccard ≥ 55% migrou para `GET /api/revisao-qualidade` (Etapa 5★) como reporte informativo. Nenhuma regeneração automática substitui a antiga.

### Requirement: Revisão de coerência automática ao final da geração
**Reason:** A `revisaoCoerenciaSkill` era executada silenciosamente ao final do stream de `/api/conteudo` e raramente consultada. A análise de coerência agora é parte explícita e visível da Etapa 5★ (`revisaoQualidadeSkill`), com saída estruturada no `.docx` de revisão. Skills removidas: `revisaoCoerenciaSkill`.
**Migration:** O arquivo `revisao_coerencia.txt/docx` não é mais gerado pelo endpoint `/api/conteudo`. A análise equivalente é gerada pela Etapa 5★ em `revisao_qualidade.txt/docx`.

## MODIFIED Requirements

### Requirement: Geração de conteúdo técnico por aula
O sistema SHALL gerar conteúdo técnico detalhado para cada aula individualmente via SSE streaming, mantendo os mecanismos de escopo e consciência sequencial (ajustes 1–4). O sistema SHALL persistir cada aula em `aula{NN}_conteudo.docx` e `scr/aula{NN}_conteudo.txt`. O sistema SHALL manter `sess.conteudo` em memória (concatenação das aulas) para consumidores downstream (PPC, finalizar-conteudo), mas SHALL NOT persistir o arquivo consolidado `conteudo.docx` nem `scr/conteudo.txt` em disco. O sistema SHALL emitir evento `done` ao concluir todas as aulas, sem executar nenhuma análise de qualidade ou deduplicação pós-geração.

#### Scenario: Geração concluída com sucesso
- **WHEN** o loop de geração de aulas em `GET /api/conteudo` termina
- **THEN** os arquivos `aula{NN}_conteudo.docx` e `scr/aula{NN}_conteudo.txt` existem para cada aula
- **THEN** `sess.conteudo` está populado em memória com o texto concatenado de todas as aulas
- **THEN** NÃO existe `conteudo.docx` nem `scr/conteudo.txt` no diretório do projeto

#### Scenario: Geração de melhoria concluída com sucesso
- **WHEN** o loop de aplicação de melhorias em `GET /api/aplicar-melhorias/confirmar` termina
- **THEN** os arquivos `aula{NN}_conteudo.docx` são atualizados com o conteúdo melhorado
- **THEN** `sess.conteudo` está atualizado em memória
- **THEN** NÃO existe novo `conteudo.docx` nem `scr/conteudo.txt` gerado pelo ciclo de melhorias

#### Scenario: Restore de sessão após restart
- **WHEN** o servidor é reiniciado e o usuário retorna ao projeto
- **THEN** `sess.conteudoPorAula` é restaurado a partir dos arquivos individuais de aula em disco
- **THEN** `sess.conteudo` é reconstruído concatenando os textos de `sess.conteudoPorAula`
- **THEN** os consumidores downstream (PPC, finalizar-conteudo) funcionam normalmente

#### Scenario: Conclusão do stream sem análise adicional
- **WHEN** todas as aulas foram geradas pelo endpoint `/api/conteudo`
- **THEN** o sistema emite evento `done` com o texto consolidado
- **THEN** nenhuma skill adicional (`revisaoCoerenciaSkill`, `conteudoRegenSkill`) é invocada
- **THEN** o arquivo `revisao_coerencia.txt` não é gerado neste endpoint

#### Scenario: Geração normal com os quatro mecanismos de escopo
- **WHEN** o sistema gera conteúdo para a aula N
- **THEN** o prompt inclui apenas o trecho específico desta aula no plano de aulas (`extractLessonBlock`)
- **THEN** o prompt inclui o mapa enxuto das demais aulas (`summarizeLessons`) para consciência sequencial
- **THEN** o prompt inclui os limites de escopo explícitos da aula
- **THEN** o campo `modulo` de `LessonMeta` é referenciado para rastreamento ao plano de ensino

---

### Requirement: Conteúdo e planos refletem a modalidade do curso
As skills de geração do pipeline (`ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`) SHALL receber a modalidade do curso e gerar atividades, recursos didáticos, formas de interação e instrumentos de avaliação compatíveis com ela, conforme as diretrizes de `MODALIDADE_DIRETRIZES`.

#### Scenario: Plano de aula presencial
- **WHEN** o plano de aula é gerado para um curso com `modalidade: "presencial"`
- **THEN** as atividades propostas assumem sala/laboratório físico e interação síncrona em turma (dinâmicas em grupo, prática supervisionada em laboratório)

#### Scenario: Conteúdo EaD
- **WHEN** o conteúdo de uma aula é gerado para um curso com `modalidade: "EaD"`
- **THEN** o texto propõe atividades autoinstrucionais e assíncronas, recursos de AVA e formas de avaliação aplicáveis a distância, sem depender de presença física

#### Scenario: Divisão em aulas de curso híbrido
- **WHEN** `planLessonsSkill` divide o curso com `modalidade: "híbrido"` em aulas
- **THEN** o planejamento pode distinguir momentos presenciais e a distância, coerentes com a proporção teórico/prático configurada

#### Scenario: Mesmo curso, modalidades diferentes, saídas diferentes
- **WHEN** o mesmo curso é gerado uma vez como `presencial` e outra como `EaD`
- **THEN** ementa, plano de ensino, plano de aula e conteúdo apresentam diferenças observáveis em atividades, recursos e avaliação coerentes com cada modalidade

---

### Requirement: Cabeçalho de identificação com a modalidade nos documentos gerados
Os documentos gerados de ementa, plano de ensino e plano de aula SHALL iniciar com um cabeçalho de identificação contendo, no mínimo: nome do curso, carga horária e **Modalidade** (presencial, EaD ou híbrido). Os prompts das skills correspondentes SHALL instruir explicitamente o modelo a produzir esse cabeçalho.

#### Scenario: Ementa com cabeçalho de modalidade
- **WHEN** a ementa é gerada para um curso com `modalidade: "EaD"`
- **THEN** o documento inicia com cabeçalho de identificação exibindo `Modalidade: EaD` antes do texto da ementa

#### Scenario: Plano de ensino e plano de aula com cabeçalho
- **WHEN** o plano de ensino ou um plano de aula é gerado
- **THEN** o documento inicia com o cabeçalho de identificação incluindo a modalidade do curso

#### Scenario: Modalidade ausente (projeto legado)
- **WHEN** o projeto não possui `modalidade` configurada
- **THEN** a linha de modalidade é omitida do cabeçalho, sem erro

---

### Requirement: Diretrizes de nível governam a geração de todas as etapas
As skills de geração que recebem o parâmetro `nivel` (`metodologiaSkill`, `ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `estiloVisualSkill`) SHALL injetar no prompt o bloco `## Diretrizes de Nível` correspondente ao nível declarado (`NIVEL_DIRETRIZES`), definindo profundidade, vocabulário, pré-requisitos assumíveis, tipo de exemplos/atividades e nível-alvo da Taxonomia de Bloom. O lookup SHALL ser tolerante a caixa e acentuação e SHALL omitir o bloco (sem erro) quando o nível estiver ausente ou fora do enum.

#### Scenario: Conteúdo de nível básico
- **WHEN** o conteúdo de uma aula é gerado para um curso com `nivel: "Básico"`
- **THEN** o prompt contém as diretrizes de nível básico (definir todos os termos técnicos, não assumir pré-requisitos, exemplos cotidianos, Bloom: lembrar/entender/aplicar, evitar aprofundar internals)

#### Scenario: Conteúdo de nível avançado
- **WHEN** o conteúdo da mesma aula é gerado com `nivel: "Avançado"`
- **THEN** o prompt contém as diretrizes de nível avançado (uso livre de vocabulário técnico, pré-requisitos assumidos, exemplos de cenários reais complexos, Bloom: analisar/avaliar/criar, evitar gastar tempo em fundamentos)

#### Scenario: Nível ausente ou não reconhecido (projeto legado)
- **WHEN** qualquer skill é chamada com `nivel` vazio, nulo ou fora do enum
- **THEN** o bloco de diretrizes é omitido e o prompt permanece como antes desta change, sem erro

#### Scenario: Mesmo curso, níveis diferentes, saídas diferentes
- **WHEN** o mesmo curso é gerado uma vez como `Básico` e outra como `Avançado`
- **THEN** ementa, plano de ensino, plano de aula e conteúdo apresentam diferenças observáveis de profundidade, vocabulário e complexidade de atividades

#### Scenario: Nível com peso alto declarado no system prompt
- **WHEN** `ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill` ou `conteudoSkill` é chamada com nível reconhecido
- **THEN** o prompt `system` da skill declara explicitamente que o nível configurado é um fator de PESO ALTO na definição de profundidade, vocabulário e complexidade do conteúdo, subordinado apenas à Metodologia Pedagógica definida

---

### Requirement: Cabeçalho de identificação com o nível nos documentos gerados
Os documentos gerados de ementa, plano de ensino e plano de aula SHALL exibir no cabeçalho de identificação o **Nível** configurado (Básico, Intermediário ou Avançado), ao lado dos demais dados do curso. Os prompts das skills correspondentes SHALL instruir explicitamente o modelo a produzir essa linha (hoje o nível é apenas dado de entrada do prompt, sem garantia de aparecer no documento).

#### Scenario: Documentos exibem o nível no cabeçalho
- **WHEN** a ementa, o plano de ensino ou um plano de aula é gerado para um curso com `nivel: "Intermediário"`
- **THEN** o documento inicia com cabeçalho de identificação exibindo `Nível: Intermediário`

#### Scenario: Nível ausente (projeto legado)
- **WHEN** o projeto não possui `nivel` reconhecido
- **THEN** a linha de nível é omitida do cabeçalho, sem erro

---

### Requirement: Pesquisa web direcionada pelo nível
As skills `pesquisaWebSkill` e `pesquisaFallbackSkill` SHALL injetar a variante `pesquisa` das diretrizes de nível, direcionando o tipo de fonte e material buscado.

#### Scenario: Pesquisa para curso básico
- **WHEN** a pesquisa web é executada para um curso com `nivel: "Básico"`
- **THEN** o prompt orienta a busca a priorizar guias introdutórios, fundamentos e materiais didáticos de entrada

#### Scenario: Pesquisa para curso avançado
- **WHEN** a pesquisa web é executada para um curso com `nivel: "Avançado"`
- **THEN** o prompt orienta a busca a priorizar documentação avançada, benchmarks, tendências de ponta e certificações profissionais avançadas

---

### Requirement: Teto uniforme de tokens de saída por aula
Todas as gerações de conteúdo por aula (ramos streaming e web-search de `streamSkillToClient`) SHALL usar `max_tokens = MAX_TOKENS_AULA` (10.000). Quando a resposta terminar com `finish_reason: length`, o sistema SHALL emitir aviso SSE (`warning`) e log de console em ambos os ramos (no ramo streaming, o corte era silencioso).

#### Scenario: Corte detectado no ramo streaming
- **WHEN** uma geração streaming (ex.: conteúdo de aula via gpt-4o-mini) atinge o teto de 10.000 tokens
- **THEN** o cliente recebe o evento `warning` informando possível conteúdo incompleto e o console registra o corte

#### Scenario: Teto aplicado ao ramo web-search
- **WHEN** qualquer skill com `web_search_options` é executada via `streamSkillToClient`
- **THEN** a chamada usa `max_tokens: 10000` e `finish_reason`/tokens de completion ficam disponíveis via parâmetro `meta`
