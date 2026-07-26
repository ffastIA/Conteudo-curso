# Gerador de Conteúdo Educacional — Guia Geral do Projeto

> **Propósito deste arquivo:** referência canônica para qualquer contribuição ao projeto — novas funcionalidades, proposals OpenSpec, refatorações ou integrações. Leia antes de propor qualquer mudança.

---

## 1. O que é o sistema

Aplicação web que **automatiza a criação de material didático completo** para cursos de formação tecnológica profissional. A partir de uma especificação básica (nome, público-alvo, carga horária, objetivos), o sistema produz ementa, planos de ensino e de aula, conteúdo técnico por aula, relatório de qualidade pedagógica e PPC (Projeto Pedagógico de Curso) — mais, como etapas opcionais, slides de apresentação (`.pptx`, via API do Gamma) e roteiros de vídeo por aula. Todo entregável é exportado como `.docx`/`.pptx` formatado.

**Público-alvo do sistema:** instrutores, coordenadores pedagógicos e gestores de cursos técnicos que precisam produzir material didático de qualidade em tempo reduzido.

**Domínio do conteúdo gerado:** cursos livres de formação tecnológica profissional para adultos; com suporte opcional a educação básica (EF1, EF2, Ensino Médio) via alinhamento BNCC.

---

## 2. Estado atual do projeto

### 2.1 Pipeline implementado (10 etapas, 0–9)

| # | Etapa | Endpoint | Status |
|---|-------|----------|--------|
| 0 | Base Pedagógica (BNCC) | `GET /api/bncc`, `POST /api/bncc/selecionar`, `POST /api/bncc/pular` | ✅ Implementado |
| 1 | Configuração do curso + Metodologia + Ementa | `POST /api/config`, `GET /api/metodologia` (SSE), `POST /api/metodologia/confirmar` | ✅ Implementado |
| 2 | Pesquisa web | `GET /api/search` (SSE) | ✅ Implementado |
| 3 | Plano de ensino | `GET /api/plano-ensino` (SSE) | ✅ Implementado |
| 4 | Plano de aulas | `GET /api/plano-aula` (SSE) | ✅ Implementado |
| 5 | Conteúdo por aula | `GET /api/conteudo` (SSE) | ✅ Implementado |
| 5★/6 | Revisão de qualidade + Aplicação de melhorias | `GET /api/revisao-qualidade` (SSE), `POST /api/aplicar-melhorias`, `GET /api/aplicar-melhorias/confirmar` (SSE) | ✅ Implementado |
| 7 | Agente de Qualidade Pedagógica + PPC | `GET /api/qualidade` (SSE), `GET /api/ppc` (SSE) | ✅ Implementado |
| 8 | Slides (via API do Gamma) | `GET /api/estilos-visuais`, `POST /api/estilos-visuais/selecionar`, `GET /api/slides/parametros`, `POST /api/slides/parametros`, `GET /api/slides/gerar` (SSE) | ✅ Implementado |
| 9 | Roteiros de vídeo | `POST /api/roteiro/blocos`, `GET /api/roteiro/prompt`, `POST /api/roteiro/aprovar`, `GET /api/roteiro/gerar` (SSE) | ✅ Implementado |

As etapas 8 e 9 são opcionais e independentes: não bloqueiam nem são
bloqueadas pelas demais, exceto exigirem respectivamente a Etapa 5
(Conteúdo) e a Etapa 4 (Plano de Aula) já concluídas. A numeração acima é a
usada na navegação do frontend (`data-step` em `public/index.html`).

Endpoints transversais (não amarrados a uma etapa específica):
`GET /api/escolher-pasta` (seletor nativo de pasta), `GET /api/tokens`
(consumo acumulado), `POST /api/carregar-projeto` (retomar projeto
existente), `POST /api/importar` + `POST /api/importar/confirmar`
(reimportar `.docx` editado), `POST /api/export/:step` (exportar qualquer
etapa) e `POST /api/finalizar-conteudo`.

### 2.2 Changes OpenSpec ativas

Nenhuma change ativa no momento — todas as propostas até aqui foram
implementadas e arquivadas em `openspec/changes/archive/`. O estado atual
do sistema está descrito pelas 25 capabilities em `openspec/specs/`
(validadas via `openspec validate --all`), que são a fonte de verdade —
prefira consultá-las a este arquivo para o detalhe de um requisito
específico.

---

## 3. Arquitetura técnica

### 3.1 Stack

```
Backend:   Node.js 18+ + Express 4.18
Frontend:  Vanilla JS + HTML5 + CSS3 (sem frameworks)
IA:        OpenAI SDK v4 (maxRetries: 6)
Slides:    API do Gamma v1.0 (REST, chamada direta via fetch — sem SDK)
Docs:      docx v9 (geração) + mammoth v1 (extração de .docx importado)
Testes:    Jest 30.4.2 + Supertest 7.2.2
Protocolo: Server-Sent Events (SSE) para todas as operações assíncronas
Sessão:    cookie HttpOnly (sid) → objeto in-memory `sessions[sid]`
```

### 3.2 Modelos de IA em uso

| Modelo/Serviço | Casos de uso |
|--------|-------------|
| `gpt-4o-mini` | Todas as skills de geração de texto: ementa, planos, conteúdo, revisão de qualidade, aplicação de melhorias, metodologia, qualidade pedagógica, PPC, estilo visual, roteiro |
| `gpt-4o-search-preview` | Pesquisa web (Etapa 2), com fallback automático para `gpt-4o-mini` sem busca em caso de falha persistente |
| API do Gamma (`POST /generations`) | Geração de texto e imagem dos slides (Etapa 8) — substitui a antiga montagem local via `pptxgenjs` + `gpt-image-1.5` |

### 3.3 Mapa de arquivos

```
server.js          — Express + 30 endpoints REST/SSE + DOCX builder + persistência
skills.js          — 20 skills de prompt ({model, system, user})
bncc-data.js       — 400+ competências/habilidades BNCC (EF1, EF2, EM)
PromptRoteiro.docx — Template-fonte do prompt de roteiro de vídeo (Etapa 9), lido em runtime
public/index.html  — Frontend HTML (Etapas 0–9, formulários, log panels)
public/app.js      — Frontend JS (SSE streaming, BNCC UI, navegação entre etapas)
public/style.css   — Estilos (card-based, responsivo)
openspec/specs/    — 25 capabilities canônicas e validadas (fonte de verdade atual do sistema)
openspec/changes/  — Changes do OpenSpec (ativas e arquivadas em changes/archive/)
scripts/           — Scripts de manutenção pontual, fora do pipeline em produção
saídas/            — Fallback apenas para projetos legados sem `pastaProjeto` definida ({curso-slug}/*.txt e *.docx)
tests/             — Testes unitários (skills) e de integração (endpoints, SSE)
```

---

## 4. Modelos de dados

### CourseConfig
```
nome                   string     obrigatório
publico                string     obrigatório
carga                  integer    obrigatório  (horas totais)
duracao                integer    obrigatório  (minutos por aula)
nivel                  enum       obrigatório  básico | intermediário | avançado
modalidade             enum       obrigatório  presencial | EaD | híbrido
distribuicaoHibrida    string     opcional     só híbrido — divisão presencial/a distância (texto livre)
cargaSincronaPorAula   string     opcional     só EaD — janela síncrona regular por aula (texto livre)
objetivos              string     obrigatório
proporcaoTeoricoPratico string    obrigatório  ex: "70% teórico / 30% prático"
preRequisitos          string     opcional
```

> Propagação da modalidade: `buildPedagogicalContext` (server.js) injeta o bloco
> `## Modalidade do Curso` (diretrizes em `MODALIDADE_DIRETRIZES`, skills.js) em
> todas as etapas geradoras, e cada skill recebe `modalidade` para a linha de
> dados e o cabeçalho dos documentos. A metodologia tem fallback de leitura em
> disco (`getMetodologia`) — sessão perdida não gera mais sem metodologia.
>
> Tokens: teto uniforme de saída por aula `MAX_TOKENS_AULA = 16.000` (ambos os
> ramos de `streamSkillToClient`); corte por `finish_reason: length` gera aviso
> SSE nos dois ramos. Nas melhorias, resposta cortada dispara 1 continuação e,
> se ainda incompleta, o conteúdo anterior da aula é preservado. Consumo de
> tokens persistido por projeto em `scr/token_usage.json` (total + por dia),
> exposto em `GET /api/tokens` (campo `projeto`) e no contador da UI.
>
> Aplicação de melhorias (Etapa 6): `aplicarMelhoriasSkill` pede um PATCH POR
> SEÇÃO (`<<<SECAO: título>>>...<<<FIM_SECAO>>>`, título copiado literalmente
> da seção original) em vez de reescrever a aula inteira — elimina a causa
> raiz do truncamento em aulas densas. `mergeSecoesConteudo` (server.js) funde
> o patch no conteúdo anterior por título (tolerante a acento/caixa, não por
> nível de heading — `conteudoSkill` não usa vocabulário fixo de seções);
> título ausente vira seção nova; resposta sem nenhum `<<<SECAO:` é tratada
> como reescrita integral (fallback). A guarda de truncamento/continuação
> permanece como rede de segurança.
>
> Realinhamento pós-melhorias (Etapa 6): ao final do ciclo de aplicar melhorias,
> as seções do plano de aula das aulas efetivamente alteradas (similaridade ≤ 0.90)
> são realinhadas via `realinharPlanoAulaSkill` + `replaceLessonBlock`. Ementa e
> plano de ensino nunca são alterados — extrapolações viram "ALERTA DE ESCOPO" no
> relatório de melhorias. Plano de aula com `fonte: usuario` não é sobrescrito.
>
> Propagação do nível: cada skill geradora injeta `nivelBlock(nivel)` — bloco
> `## Diretrizes de Nível` de `NIVEL_DIRETRIZES` (skills.js) com profundidade,
> vocabulário, pré-requisitos e Bloom-alvo; as pesquisas web usam a variante
> `pesquisa`. O system das skills principais declara o nível como PESO ALTO,
> e a revisão de qualidade fiscaliza "Adequação ao Nível Declarado". Não
> confundir com o nível BNCC (ef1/ef2/em/competencias).

### Session (in-memory)
```
config                CourseConfig
bncc                  { ativo: bool, publico: string, nivel: string, itens: [] }
metodologia           string
ementa                string
pesquisa              string
planoEnsino           string
planoAula             string
aulas                 LessonMeta[]
conteudoPorAula       LessonContent[]
conteudo              string        (consolidado em memória; NÃO persistido como conteudo.docx — ver §7)
revisaoQualidade      string        (Etapa 5★)
observacoesMelhorias  object|null   (observações extraídas do .docx anotado, Etapa 6)
modoLegadoMelhorias   bool          (upload sem a seção estruturada de melhorias)
conteudoFinal         string        (Etapa 6, ao concluir o ciclo de melhorias)
relatorioQualidade    string        (Agente de Qualidade, Etapa 7)
estiloVisual          { id, titulo, housePrompt }|null   (Etapa 8)
slidesPendente        { index, texto, quantidade }|null  (parâmetros aprovados aguardando geração)
slidesGerados         string[]      (arquivos aula{NN}_slides.pptx já gerados nesta sessão)
roteiroBlocos         number|null   (1–6, escolhido uma única vez por curso — Etapa 9)
roteiroPendente       { index, texto }|null
roteirosGerados       string[]      (arquivos roteiro{NN}.docx já gerados nesta sessão)
inputs                object        (inputs do usuário por etapa — topicos, limite, ajustesEnsino, observacoesAula)
```

### LessonMeta
```
titulo    string   título da aula
modulo    string   referência exata ao módulo do plano de ensino
objetivos string   separados por ponto-e-vírgula
```

### LessonContent
```
titulo    string
modulo    string
objetivos string
texto     string   conteúdo completo em markdown
```

### SSE Events (padrão de todos os endpoints de streaming)
```
progress  { type, message }          — progresso textual no log panel
site      { type, url, title }       — citação web capturada (apenas Etapa 2)
token     { type, text }             — chunk de texto gerado pelo modelo
done      { type, fullText }         — conclusão com texto completo
error     { type, message }          — erro propagado ao cliente
```

---

## 5. Skills catalog (skills.js)

Cada skill retorna `{ model, [web_search_options], system, user }`.

| Skill | Modelo | Propósito |
|-------|--------|-----------|
| `pesquisaWebSkill` | search-preview | Pesquisa tendências, ferramentas e certificações do mercado |
| `pesquisaFallbackSkill` | mini | Fallback sem busca web quando a pesquisa web falha persistentemente (Etapa 2) |
| `ementaSkill` | mini | Ementa do curso em 2 parágrafos objetivos |
| `planoEnsinoSkill` | mini | Plano com módulos, metodologia, avaliação, bibliografia |
| `planLessonsSkill` | mini | Divide curso em aulas — resposta JSON (`LessonMeta[]`) |
| `planoAulaSkill` | mini | Plano detalhado de uma aula (sequência didática, timing) |
| `conteudoSkill` | mini | Conteúdo técnico denso por aula (referência do instrutor) |
| `revisaoQualidadeSkill` | mini | Relatório de revisão de qualidade por aula, com rubrica de 5 critérios (Etapa 5★) |
| `aplicarMelhoriasSkill` | mini | Aplica melhorias anotadas como patch por seção (Etapa 6) |
| `scoreAulaSkill` | mini | Julgamento pareado original × candidato para o gate de score (Etapa 6) |
| `realinharPlanoAulaSkill` | mini | Realinha a seção do plano de aula após melhorias aplicadas (Etapa 6) |
| `metodologiaSkill` | mini | Deriva metodologia pedagógica adequada ao perfil do curso |
| `qualidadeSkill` | mini | Relatório Técnico-Pedagógico (7 seções, persona especialista) — Agente de Qualidade, Etapa 7 |
| `perfilEgressoSkill` | mini | Perfil do egresso do curso (PPC) |
| `competenciasSkill` | mini | Competências e habilidades desenvolvidas, com BNCC se ativo (PPC) |
| `perfilDocenteSkill` | mini | Perfil de formação e experiência recomendados para o professor (PPC) |
| `infraestruturaSkill` | mini | Recursos, equipamentos e ambiente necessários (PPC) |
| `ppcAssemblySkill` | mini | Monta PPC formal com 12 seções numeradas |
| `estiloVisualSkill` | mini | Gera o menu de 3–5 estilos visuais coerentes com o curso (Etapa 8) |
| `roteiroSkill` | mini | Gera o roteiro de vídeo de uma aula a partir do prompt aprovado (Etapa 9) |

> A geração dos slides em si (texto e imagem de cada card, Etapa 8) não usa
> uma skill de prompt local — é delegada à API do Gamma (`POST /generations`),
> que recebe o conteúdo da aula e o `housePrompt` do estilo escolhido.

**Helper (sem chamada de API):**
- `summarizeLessons(aulas, { excludeIndex })` — mapa enxuto das aulas para contexto sequencial

---

## 6. Mecanismos de qualidade do conteúdo gerado (Etapa 5 → 5★ → 6)

Na geração inicial (Etapa 5), cada aula tem 4 ajustes de escopo/coerência:

1. **Trecho específico**: cada aula recebe via `extractLessonBlock()` só o trecho que lhe corresponde no plano de aulas
2. **Rastreamento de módulo**: o campo `modulo` de `LessonMeta` referencia exatamente um módulo do plano de ensino
3. **Consciência sequencial**: `summarizeLessons()` injeta mapa enxuto das demais aulas para evitar repetição ou antecipação de conteúdo
4. **Limites de escopo**: prompt explicita que a aula deve abordar **estritamente** seus próprios objetivos

A partir daí, a garantia de qualidade deixa de ser automática/silenciosa
(as antigas `conteudoRegenSkill`/`revisaoCoerenciaSkill` foram removidas) e
passa a ser um ciclo supervisionado pelo revisor humano:

- **Etapa 5★ (Revisão de Qualidade)**: gera um relatório por aula com
  rubrica de 5 critérios, nota de qualidade em escala 0–1 (`Score = 0.7 ×
  RubricaLLM + 0.3 × Determinístico` — ver capability `quality-scoring`),
  detecção de sobreposição Jaccard (≥ 55%) entre aulas e campo para
  anotações do revisor.
- **Etapa 6 (Aplicação de Melhorias)**: o revisor anota o `.docx`; o sistema
  aplica as melhorias como **patch por seção** (não reescrita integral),
  com **gate de aceite por score** — o candidato só é persistido se
  `scoreCandidato ≥ scoreOriginal + 0.02` (itens marcados `[user]` ignoram
  o gate e são aplicados incondicionalmente) — e realinhamento automático
  da seção correspondente do plano de aula.

---

## 7. Persistência

### Sessão (in-memory)
- Identificada por cookie HttpOnly `sid`
- **Perdida ao reiniciar o servidor** (Gap G04)
- `readMemory(sess, nome)` lê `.txt` do disco para restaurar etapas em sessões novas

### Sistema de arquivos

Cada projeto tem uma pasta raiz (`pastaProjeto`, obrigatória desde a
Etapa 1 — ver capability `project-folder`); `saídas/{curso-slug}/` só é
usada como fallback para projetos legados criados antes dessa
obrigatoriedade. Entregáveis (`.docx`/`.pptx`) ficam na raiz; artefatos
internos (`.txt`, `.json`) ficam em `{pastaProjeto}/scr/`:

```
{pastaProjeto}/
  ementa.docx                          scr/ementa.txt
  pesquisa.docx                        scr/pesquisa.txt
  metodologia.docx                     scr/metodologia.txt
  plano_de_ensino.docx                 scr/plano_de_ensino.txt
  plano_de_aula.docx                   scr/plano_de_aula.txt
  aula01_conteudo.docx                 scr/aula01_conteudo.txt   (... por aula — sem conteudo.docx consolidado)
  revisao_qualidade.docx               scr/revisao_qualidade.txt        (Etapa 5★)
  melhorias_aplicadas_YYYYMMDD_HHmmss.docx                              (Etapa 6 — um por ciclo, imutável)
  {nome}_conteudo_final.docx           scr/conteudo_final.txt           (conclusão da Etapa 6)
  relatorio_qualidade.docx             scr/relatorio_qualidade.txt      (Agente de Qualidade, Etapa 7)
  ppc_completo.docx                    scr/ppc_completo.txt             (Etapa 7)
  aula01_slides.pptx                   (... por aula — Etapa 8, gerado via Gamma)
  roteiro01.docx                       scr/roteiro01.txt   (... por aula — Etapa 9)
  scr/projeto.json                     — estado estruturado da sessão (config, bncc, aulas, inputs, stages)
  scr/score_historico.json             — histórico de scores por ciclo de melhorias
  scr/observacoes_pendentes.json       — observações extraídas do último upload da Etapa 6
  scr/ciclo_{NNN}/                     — snapshot do conteúdo antes de cada ciclo de melhorias
  scr/token_usage.json                 — consumo de tokens acumulado do projeto
```

- **Slug**: `"Nome do Curso"` → `"Nome_do_Curso"` (espaços viram `_`) — usado apenas no fallback legado
- Cada etapa persiste `.txt`/`.json` (memória para próximas etapas) **e** o entregável (`.docx`/`.pptx`)
- Truncamento a 1.500 caracteres ao passar contexto para skills (controle de tokens)

### Rastreamento de tokens
- Contador global em memória (`tokenUsage`), resetado ao reiniciar o servidor
- Acumulado por projeto em `scr/token_usage.json` (`{ total, porDia, atualizadoEm }`), sobrevive a restarts — ver capability `token-usage-tracking`
- `GET /api/tokens` retorna ambos; o contador da UI exibe o total do projeto ao lado do total da sessão

---

## 8. Padrões de código que devem ser seguidos

### Novo endpoint SSE
```js
app.get('/api/minha-feature', async (req, res) => {
  const sess = getSession(req, res);
  sseHeaders(res);                             // Content-Type: text/event-stream
  send(res, { type: 'progress', message: '...' });

  const skill = minhaSkill({ ...params, ...buildPedagogicalContext(sess) });
  const text  = await streamSkillToClient(res, skill);

  persistStage(sess, 'nome-do-arquivo', 'Label para DOCX', text);
  send(res, { type: 'done', fullText: text });
  res.end();
});
```

### Nova skill
```js
const minhaSkill = ({ campo1, campo2, metodologia, bnccContext }) => ({
  model: MODEL_ECONOMY,   // ou MODEL_RESEARCH para web search
  system: 'Você é um especialista em [domínio]...',
  user: `[contexto e dados]
${pedagCtxBlock(metodologia, bnccContext)}`
});
```

### Regras gerais
- **Nenhuma nova dependência npm** sem justificativa explícita e aprovação
- **SSE obrigatório** para qualquer operação assíncrona nova — não usar polling ou websockets
- **Contexto pedagógico injetado** em todas as skills via `pedagCtxBlock(metodologia, bnccContext)` — nunca omitir
- **Persistência dupla** em toda etapa que gera conteúdo: `.txt` (memória) + `.docx` (entregável)
- **Truncamento de contexto** a 1.500 chars ao montar prompts a partir de artefatos já gerados
- **Commits em português**

---

## 9. Gaps conhecidos (priorizados)

| ID | Área | Severidade | Descrição |
|----|------|-----------|-----------|
| G01 | Segurança | ✅ Resolvido | `.env` está no `.gitignore` e não é rastreado pelo git |
| G02 | Segurança | Alto | Sem autenticação — qualquer um acessa a API (aceito como constraint de uso local, ver `native-folder-picker`) |
| G03 | Segurança | ✅ Mitigado | `pastaProjeto` é validada contra `..`, caminhos dentro do diretório da aplicação e falta de permissão de escrita |
| G04 | Persistência | Reduzido | Sessão continua in-memory, mas é totalmente reconstruível do disco sem chamada à OpenAI (`session-persistence`, `session-auto-restore`, `project-load`) |
| G05 | Confiabilidade | ✅ Resolvido | Cliente OpenAI com `maxRetries: 6`, mais retry/fallback dedicado da pesquisa web (`web-search-resilience`) |
| G06 | Observabilidade | Médio | Sem logging estruturado (apenas `console.log`) |
| G07 | Testes | Melhorado | Baseline estabelecida (`test-verification-baseline`): gate de cobertura 40%, 240 testes, mock da OpenAI compatível com contratos reais — ainda não é cobertura completa |
| G08 | UX | Baixo | Sem estimativa de custo/tokens antes de iniciar etapa (só consumo acumulado, via `token-usage-tracking`) |
| G09 | Portabilidade | Baixo | Seletor nativo de pasta é Windows-only por design (PowerShell + `System.Windows.Forms`) |
| G10 | Escalabilidade | Baixo | Sem rate limiting — múltiplos usuários podem esgotar quota da API |

> Ao propor uma nova funcionalidade, **referencie o Gap ID** caso ela resolva algum deles.

---

## 10. O que não fazer (non-goals permanentes)

- Não mapear habilidades BNCC com códigos específicos (EF06MA01, etc.) — apenas competências gerais e áreas
- Não validar conformidade oficial com a BNCC — o sistema orienta, não certifica
- Não gerar PPC para cursos técnicos regulados (SENAI/SENAC) ou ensino superior (MEC/DCN)
- Não implementar multi-tenancy ou autenticação complexa neste estágio
- Não substituir o padrão SSE por WebSockets ou polling

---

## 11. Guia rápido para novos proposals OpenSpec

Ao escrever um `/opsx:propose`, inclua:

1. **Por que**: qual problema do usuário ou gap técnico esta feature resolve
2. **O que muda**: endpoints novos/modificados, skills novas/modificadas, campos novos nos modelos
3. **Non-goals**: o que está explicitamente fora do escopo desta mudança
4. **Impacto em arquivos**: `server.js`, `skills.js`, `public/app.js`, `public/index.html`, capability afetada em `openspec/specs/`
5. **Gap resolvido** (se aplicável): referencie o ID da tabela acima

Referências úteis antes de propor:
- Modelos de dados completos → seção 4 deste arquivo e a capability correspondente em `openspec/specs/`
- Skills existentes → seção 5 deste arquivo e `skills.js`
- Padrões de código → seção 8 deste arquivo
- Gaps priorizados → seção 9 deste arquivo
