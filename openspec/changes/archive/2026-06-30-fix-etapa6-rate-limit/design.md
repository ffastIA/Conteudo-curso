## Context

O cliente OpenAI é criado uma única vez em `server.js:23` com `new OpenAI({ apiKey })`. O SDK v4 tem `maxRetries: 2` por padrão e aplica backoff exponencial lendo o header `retry-after` da resposta 429. Para erros de TPM (tokens por minuto), a API instrui o cliente a aguardar até 60 segundos — 2 tentativas com espera curta não são suficientes.

O handler `GET /api/aplicar-melhorias/confirmar` processa N aulas em sequência, cada uma com uma chamada a `gpt-4o-search-preview` (sem streaming). O prompt inclui `conteudoAtual: aula.texto` sem truncamento — para aulas de 5.000–10.000 chars, o input por chamada pode chegar a 8.000+ tokens. Com 27 aulas sem pausa, o pico de consumo por janela de 60s excede o limite de TPM antes de chegar na metade do ciclo.

## Goals / Non-Goals

**Goals:**
- Eliminar interrupções por rate limit em cursos com muitas aulas (ex: 27 aulas)
- Não exigir nenhuma mudança de UX ou de contrato de API
- Reutilizar mecanismo de retry já existente no SDK (sem biblioteca extra)

**Non-Goals:**
- Não implementar filas, workers ou processamento paralelo
- Não alterar o modelo usado (`gpt-4o-search-preview`)
- Não exibir progresso de retry para o usuário (o SDK trata de forma transparente)

## Decisions

**Decisão 1: `maxRetries: 6` no cliente, não retry manual**

Alternativa considerada: capturar `OpenAI.RateLimitError` em `streamSkillToClient` e fazer `setTimeout` manual antes de tentar de novo. Rejeitado: o SDK já implementa isso corretamente lendo o header `retry-after` — duplicar a lógica seria complexo e propenso a erros. Configurar `maxRetries: 6` no cliente centraliza o comportamento para todos os endpoints, não apenas Etapa 6.

**Decisão 2: delay fixo de 4s entre aulas, não delay adaptativo**

Alternativa considerada: calcular delay com base no número de tokens do output anterior. Rejeitado: complexidade desnecessária. 4s × 27 aulas = ~108s de overhead total, imperceptível dado que cada chamada já leva 15–30s. O delay fixo é suficiente para distribuir o consumo ao longo da janela TPM.

**Decisão 3: truncar `conteudoAtual` a 3.000 chars**

Alinha com o padrão do projeto: Etapa 5★ usa `truncate(aula.texto, 2000)`, Etapa 7 usa `truncate(sess.conteudo, 3000)`. O modelo de melhoria precisa do contexto do conteúdo, mas não de cada palavra — 3.000 chars cobrem ~3 páginas, suficiente para identificar lacunas e aplicar observações do revisor. Alternativa (sem truncamento) mantém qualidade máxima mas é a causa raiz do problema.

## Risks / Trade-offs

**Qualidade ligeiramente reduzida em aulas muito longas** → O modelo vê apenas os primeiros 3.000 chars da aula ao invés do conteúdo completo. Mitigação: as observações do revisor (sem truncamento) são o insumo principal; o conteúdo completo já estava salvo em disco e o modelo pode buscar detalhes via web search.

**Ciclo mais lento** → 4s × N aulas de overhead. Para 27 aulas: ~1,8 minutos extras sobre um ciclo que já leva 15–30 minutos. Trade-off aceitável versus interrupção total.

**`maxRetries: 6` afeta todos os endpoints** → Em caso de falha real da API (não rate limit), o tempo de espera aumenta antes do erro ser propagado. Risco baixo: o SDK distingue entre erros retriáveis (429, 503) e não retriáveis (400, 401).
