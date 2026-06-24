## REMOVED Requirements

### Requirement: Deduplicação automática por similaridade Jaccard
**Reason:** A regeneração automática silenciosa impede que o usuário veja e julgue as sobreposições detectadas. O novo ciclo de revisão (Etapa 5★) expõe a análise Jaccard como reporte visível e deixa a decisão de correção ao revisor humano. Skills removidas: `conteudoRegenSkill`.
**Migration:** A detecção de similaridade Jaccard ≥ 55% migrou para `GET /api/revisao-qualidade` (Etapa 5★) como reporte informativo. Nenhuma regeneração automática substitui a antiga.

### Requirement: Revisão de coerência automática ao final da geração
**Reason:** A `revisaoCoerenciaSkill` era executada silenciosamente ao final do stream de `/api/conteudo` e raramente consultada. A análise de coerência agora é parte explícita e visível da Etapa 5★ (`revisaoQualidadeSkill`), com saída estruturada no `.docx` de revisão. Skills removidas: `revisaoCoerenciaSkill`.
**Migration:** O arquivo `revisao_coerencia.txt/docx` não é mais gerado pelo endpoint `/api/conteudo`. A análise equivalente é gerada pela Etapa 5★ em `revisao_qualidade.txt/docx`.

## MODIFIED Requirements

### Requirement: Geração de conteúdo técnico por aula
O sistema SHALL gerar conteúdo técnico detalhado para cada aula individualmente via SSE streaming, mantendo os mecanismos de escopo e consciência sequencial (ajustes 1–4). O sistema SHALL persistir cada aula em `aula{NN}_conteudo.txt` e `.docx` e o consolidado em `conteudo.txt` e `.docx`. O sistema SHALL emitir evento `done` ao concluir todas as aulas, sem executar nenhuma análise de qualidade ou deduplicação pós-geração.

#### Scenario: Geração de aula sem deduplicação
- **WHEN** o sistema gera o conteúdo de uma aula e calcula similaridade com a aula anterior
- **THEN** o sistema continua sem nenhuma ação — nenhuma regeneração é acionada independentemente do valor de similaridade
- **THEN** o conteúdo gerado é persistido normalmente

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
