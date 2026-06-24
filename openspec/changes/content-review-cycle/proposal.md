## Why

O pipeline atual aplica correções de qualidade de forma **silenciosa e automática**: a deduplicação Jaccard regenera conteúdo sem que o usuário veja o que foi detectado ou por quê; a revisão de coerência gera um relatório interno que raramente é consultado; e a expansão (+50%) é cega ao contexto pedagógico do curso. O resultado é que o usuário recebe um conteúdo "já corrigido", mas sem visibilidade sobre as sobreposições, lacunas ou inconsistências — e sem nenhuma oportunidade de direcionar as melhorias conforme seu julgamento profissional. O loop de refinamento que todo material didático exige é hoje impossível de executar sistematicamente.

## What Changes

- **BREAKING — Remoção da deduplicação automática de Etapa 5**: a detecção Jaccard ≥ 55% com regeneração automática via `conteudoRegenSkill` é eliminada do endpoint `/api/conteudo`. A revisão de coerência automática (`revisaoCoerenciaSkill` ao fim do stream) também é removida deste endpoint. A Etapa 5 passa a gerar conteúdo de forma direta, sem pós-processamento silencioso. As skills `conteudoRegenSkill` e `revisaoCoerenciaSkill` são descontinuadas.

- **BREAKING — Remoção da Etapa 6 (Expansão)**: o endpoint `/api/expandir` e a skill `expansaoConteudoSkill` são removidos. A lógica de busca web para enriquecimento de conteúdo migra para a nova Etapa 6 (aplicação de melhorias).

- **Nova Etapa 5★ — Revisão de Qualidade (`content-quality-review`)**: endpoint `/api/revisao-qualidade` que analisa o conteúdo gerado **comparando-o explicitamente** com ementa, plano de ensino, plano de aula e competências BNCC selecionadas. Aplica a similaridade Jaccard ≥ 55% como **reporte** (não auto-correção), aponta aula por aula as deficiências e melhorias sugeridas, e produz um arquivo `.docx` editável que o revisor humano pode anotar antes de prosseguir.

- **Nova Etapa 6 — Ciclo de Aplicação de Melhorias (`improvement-application-cycle`)**: endpoint `/api/aplicar-melhorias` que aceita upload do `.docx` editado pelo revisor humano. Após confirmação do usuário, revisa cada aula individualmente aplicando as melhorias indicadas no documento — com acesso à web quando necessário para complementação. Ao final, o usuário pode executar novamente a Etapa 5★ para uma nova rodada de crítica, repetindo o ciclo quantas vezes desejar. Quando satisfeito, aciona a geração do **documento final consolidado** (`.docx`) com todos os conteúdos revisados.

## Capabilities

### New Capabilities

- `content-quality-review`: Etapa 5★ — análise independente de qualidade aula por aula, confrontando conteúdo gerado com os artefatos do curso (ementa, plano de ensino, plano de aula, BNCC). Gera relatório com sobreposições Jaccard ≥ 55%, lacunas por aula e sugestões de melhoria em `.docx` editável.

- `improvement-application-cycle`: Etapa 6 — ciclo human-in-the-loop de refinamento. Recebe upload do `.docx` de revisão anotado pelo usuário, aplica melhorias aula a aula (com web search quando necessário), e ao final produz o `.docx` definitivo. Permite múltiplas iterações com a Etapa 5★.

### Modified Capabilities

- `content-generation`: remoção da deduplicação automática Jaccard e da revisão de coerência interna. O endpoint `/api/conteudo` passa a gerar conteúdo diretamente, mantendo apenas os quatro mecanismos de escopo e consciência sequencial (ajustes 1–4 do sistema atual).

## Non-goals

- Não implementar edição do `.docx` diretamente na interface web — o arquivo é baixado, editado externamente e reenviado.
- Não automatizar a aplicação de melhorias sem confirmação explícita do usuário.
- Não preservar a funcionalidade de expansão (+50%) como etapa independente — ela é absorvida pelo ciclo de melhorias.
- Não alterar as Etapas 0–4 nem a Etapa 7 (Qualidade Pedagógica + PPC).
- Não implementar versionamento dos ciclos de revisão — apenas o estado atual do conteúdo é mantido.
- Não fazer OCR ou parsing de formatação complexa no `.docx` enviado — o sistema lê o texto plano extraído do arquivo.

## Impact

- **`server.js`**: remover lógica Jaccard + `conteudoRegenSkill` + `revisaoCoerenciaSkill` do handler `/api/conteudo`; remover endpoint `/api/expandir`; adicionar `GET /api/revisao-qualidade` (SSE); adicionar `POST /api/aplicar-melhorias` (multipart upload + SSE); adicionar `POST /api/finalizar-conteudo` (gera `.docx` final consolidado); adicionar campo `conteudoFinal` na Session.
- **`skills.js`**: remover `conteudoRegenSkill`, `revisaoCoerenciaSkill`, `expansaoConteudoSkill`, `aplicarSugestoesSkill`; adicionar `revisaoQualidadeSkill` (análise por aula com Jaccard + BNCC); adicionar `aplicarMelhoriasSkill` (aplica melhorias do documento com web search por aula).
- **`public/index.html` + `public/app.js`**: remover seção da Etapa 6 (expansão); adicionar seção "Etapa 5★ — Revisão de Qualidade" com botão de geração e download do `.docx`; adicionar seção "Etapa 6 — Aplicar Melhorias" com campo de upload de arquivo `.docx`, botão de confirmação, log SSE e botão "Conteúdo Concluído" para gerar `.docx` final.
- **`specs.yaml`**: atualizar pipeline (remover etapas 5-dedup e 6-expansão; documentar novas etapas 5★ e 6); atualizar Session com `conteudoFinal`; documentar novos endpoints e skills.
- **Nenhuma nova dependência npm** exceto `mammoth` (extração de texto de `.docx` enviado pelo usuário) — dependência leve, sem alternativas viáveis na stdlib do Node.
