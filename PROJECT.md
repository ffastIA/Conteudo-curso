# Gerador de Conteúdo Educacional — Guia Geral do Projeto

> **Propósito deste arquivo:** referência canônica para qualquer contribuição ao projeto — novas funcionalidades, proposals OpenSpec, refatorações ou integrações. Leia antes de propor qualquer mudança.

---

## 1. O que é o sistema

Aplicação web que **automatiza a criação de material didático completo** para cursos de formação tecnológica profissional. A partir de uma especificação básica (nome, público-alvo, carga horária, objetivos), o sistema produz ementa, planos de ensino e de aula, conteúdo técnico por aula, relatório de qualidade pedagógica e PPC (Projeto Pedagógico de Curso) — mais, como etapas opcionais, slides de apresentação (`.pptx`, via API do Gamma) e roteiros de vídeo por aula. Todo entregável é exportado como `.docx`/`.pptx` formatado.

**Público-alvo do sistema:** instrutores, coordenadores pedagógicos e gestores de cursos técnicos que precisam produzir material didático de qualidade em tempo reduzido.

**Domínio do conteúdo gerado:** cursos livres de formação tecnológica profissional para adultos; com suporte opcional a educação básica (EF1, EF2, Ensino Médio) via alinhamento BNCC.

---

## 2. Estado atual do projeto

### 2.1 Pipeline implementado (etapas 0–10)

| # | Etapa | Endpoint | Status |
|---|-------|----------|--------|
| 0 | Base Pedagógica (BNCC) | `GET /api/bncc`, `POST /api/bncc/selecionar`, `POST /api/bncc/pular` | ✅ Implementado |
| 1 | Configuração do curso + Metodologia + Ementa | `POST /api/config`, `GET /api/metodologia` (SSE), `POST /api/metodologia/confirmar` | ✅ Implementado |
| 2 | Pesquisa web geral + pesquisa por módulo | `GET /api/search` (SSE), `GET /api/pesquisa-modulos` (SSE), `GET /api/pesquisa-modulos/status`, `POST /api/pesquisa-modulos/pular` | ✅ Implementado |
| 3 | Plano de ensino | `GET /api/plano-ensino` (SSE) | ✅ Implementado |
| 4 | Plano de aulas | `GET /api/plano-aula` (SSE) | ✅ Implementado |
| 5 | Conteúdo por aula | `GET /api/conteudo` (SSE) | ✅ Implementado |
| 5★/6 | Revisão de qualidade + Aplicação de melhorias | `GET /api/revisao-qualidade` (SSE), `POST /api/aplicar-melhorias`, `GET /api/aplicar-melhorias/confirmar` (SSE) | ✅ Implementado |
| 7 | Agente de Qualidade Pedagógica + PPC | `GET /api/qualidade` (SSE), `GET /api/ppc` (SSE) | ✅ Implementado |
| 8 | Slides (via API do Gamma) | `GET /api/estilos-visuais`, `POST /api/estilos-visuais/selecionar`, `GET /api/slides/templates`, `POST /api/slides/template`, `GET /api/slides/parametros`, `POST /api/slides/parametros`, `GET /api/slides/gerar` (SSE) | ✅ Implementado |
| 9 | Roteiros de vídeo | `POST /api/roteiro/blocos`, `GET /api/roteiro/prompt`, `POST /api/roteiro/aprovar`, `GET /api/roteiro/gerar` (SSE) | ✅ Implementado |
| 10 | Vídeo com avatar (HeyGen) | `GET /api/heygen/avatares`, `GET /api/heygen/vozes`, `POST /api/heygen/config`, `GET/POST /api/video-avatar/parametros`, `GET /api/video-avatar/roteiro/gerar` (SSE), `GET /api/video-avatar/gerar` (SSE) | ✅ Implementado |

As etapas 8, 9 e 10 são opcionais e independentes: não bloqueiam nem são
bloqueadas pelas demais, exceto exigirem respectivamente a Etapa 5
(Conteúdo), a Etapa 4 (Plano de Aula) e a Etapa 5 (Conteúdo) novamente já
concluídas. A numeração acima é a usada na navegação do frontend
(`data-step` em `public/index.html`). Diferente das etapas 8 e 9, a Etapa 10
não avança automaticamente entre aulas — o usuário escolhe manualmente qual
aula trabalhar a cada rodada (ver capability `video-avatar-generation` em
`openspec/specs/`).

Endpoints transversais (não amarrados a uma etapa específica):
`GET /api/escolher-pasta` (seletor nativo de pasta, só em loopback),
`GET /api/tokens` (consumo acumulado), `GET /api/estimativa` (tokens e custo
estimados antes de pesquisa por módulo, conteúdo e revisão),
`POST /api/carregar-projeto` (retomar projeto existente),
`POST /api/importar` + `POST /api/importar/confirmar` (reimportar `.docx`
editado), `POST /api/export/:step` (exportar qualquer etapa),
`POST /api/finalizar-conteudo` e `GET /api/dev/seed` (dados de exemplo, só
com `ENABLE_DEV_SEED=true`).

**Contagem de endpoints:** `server.js` registra 47 handlers (46 sempre ativos
mais `/api/dev/seed`, condicional). Reproduza com
`grep -cE "^\s*app\.(get|post|put|delete|patch)\(" server.js`. Um teste
(`tests/unit/docs-sincronizadas.test.js`) falha se este número, o cookie ou a
lista de rotas do README divergirem do código.

### 2.2 Changes OpenSpec ativas

As propostas antigas estão arquivadas em `openspec/changes/archive/`. As
changes do plano de correção de 2026-10 já implementadas, ainda não
arquivadas, são: `verificacao-pesquisa-e-prazos`, `pesquisa-web-real`,
`observabilidade-langfuse`, `conteudo-completo-por-secoes`,
`conteudo-fundamentado-em-pesquisa`, `avaliacao-conteudo-integral`,
`geracao-retomavel`, `endurecer-fronteira-local`, `custo-e-logs`,
`docx-markdown-completo` e `docs-sincronizadas`; `base-de-testes-realista`
é a última pendente do plano. O estado atual do sistema está descrito pelas
capabilities em `openspec/specs/` (validadas via `openspec validate --all`),
que são a fonte de verdade — prefira consultá-las a este arquivo para o
detalhe de um requisito específico.

---

## 3. Arquitetura técnica

### 3.1 Stack

```
Backend:   Node.js 18+ + Express 4.18
Frontend:  Vanilla JS + HTML5 + CSS3 (sem frameworks)
IA:        OpenAI SDK v4 (maxRetries: 0 — espera de 429 e novas tentativas no helper comRateLimit)
Slides:    API do Gamma v1.0 (REST, chamada direta via fetch — sem SDK)
Vídeo:     API do HeyGen v3, fluxo "Avatar Video" (REST, fetch — sem SDK)
Docs:      docx v9 (geração) + mammoth v1 (extração de .docx importado)
Testes:    Jest 30.4.2 + Supertest 7.2.2
Protocolo: Server-Sent Events (SSE) para todas as operações assíncronas
Sessão:    cookie HttpOnly + SameSite=Lax (`sessionId`) → objeto in-memory `sessions[sessionId]`
Logs:      logger JSON próprio (`logger.js`); observabilidade opcional via Langfuse autohospedado (`observabilidade.js`)
```

### 3.2 Modelos de IA em uso

| Modelo/Serviço | Casos de uso |
|--------|-------------|
| `gpt-4o-mini` (`OPENAI_ECONOMY_MODEL`) | Todas as skills de geração de texto: ementa, planos, revisão de qualidade, aplicação de melhorias, metodologia, qualidade pedagógica, PPC, estilo visual, roteiros |
| `gpt-4o-mini` (`OPENAI_CONTENT_MODEL`) | Conteúdo das aulas (roteiro da aula, seções e expansão); herda o modelo de economia quando a variável não existe |
| `gpt-4o` (`OPENAI_RESEARCH_MODEL`) | Pesquisa web (geral e por módulo) pela Responses API com a ferramenta `web_search` — `gpt-4o-search-preview` foi descontinuado e `chat.completions` + `web_search_options` retorna 400 (ver `docs/decisoes/pesquisa-api.md`). O fallback sem busca só roda por decisão do usuário e fica rotulado (`legado`/`sem_web`) |
| API do Gamma (`POST /generations`) | Geração de texto e imagem dos slides (Etapa 8) — substitui a antiga montagem local via `pptxgenjs` + `gpt-image-1.5`; instruções por template em `GAMMA_TEMPLATE_PROMPTS` |
| API do HeyGen (v3) | Vídeo com avatar (Etapa 10) |

Os modelos ficam em `config/modelos.js` (padrão atual, sobrescrito por
`OPENAI_RESEARCH_MODEL`, `OPENAI_CONTENT_MODEL` e `OPENAI_ECONOMY_MODEL`) e os
preços por milhão de tokens em `config/precos-modelos.json`, usados na
estimativa de custo e no painel de observabilidade.

### 3.3 Mapa de arquivos

```
server.js          — Express + 47 handlers REST/SSE + DOCX builder + persistência
skills.js          — 29 skills de prompt ({model, system, user})
bncc-data.js       — 400+ competências/habilidades BNCC (EF1, EF2, EM)
conteudo-secoes.js — geração do conteúdo por seções (roteiro da aula, seções, estado completa/curta/incompleta)
fundamentacao.js   — dossiê de fontes por aula, citações [F#] e referências montadas pelo sistema
avaliacao.js       — orçamento de tokens e map-reduce da avaliação sobre o conteúdo integral
observabilidade.js — traces e scores das chamadas ao LLM (Langfuse via OTLP, opcional); atributos de trace do v4 (sessão, nome, tags, ambiente, release) em todo span (`langfuse-trace-attributes`)
custo.js           — estimativa de custo, trava de orçamento e disjuntor
logger.js          — logs JSON estruturados (LOG_LEVEL) com reqId e sem segredos
docx-markdown.js   — Markdown → elementos docx (listas, tabelas, código, links)
config/            — modelos.js (modelos por ambiente) e precos-modelos.json
PromptRoteiro.docx — Template-fonte do prompt de roteiro de vídeo (Etapa 9), lido em runtime
public/index.html  — Frontend HTML (Etapas 0–10, formulários, log panels)
public/app.js      — Frontend JS (SSE streaming, BNCC UI, navegação entre etapas, estimativas)
public/markdown.js — Análise e renderização de Markdown, compartilhada com o gerador de .docx
public/style.css   — Estilos (card-based, responsivo)
openspec/specs/    — 44 capabilities canônicas e validadas (fonte de verdade atual do sistema)
openspec/changes/  — Changes do OpenSpec (ativas e arquivadas em changes/archive/)
docs/              — decisões (docs/decisoes), guia do Langfuse e linha de base do curso de referência (docs/baseline)
scripts/           — Smoke da pesquisa, geração da linha de base, dataset do Langfuse e criptografia do .env
saídas/            — Fallback apenas para projetos legados sem `pastaProjeto` definida ({curso-slug}/*.txt e *.docx)
tests/             — Testes unitários (skills, custo, logger, markdown…) e de integração (endpoints, SSE)
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
estadoAulas           { "NN": { estado: completa|curta|incompleta, assinatura, ... } }  (completude do conteúdo por aula)
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
heygenConfig          { avatarId, avatarName, avatarType, voiceId, voiceName,
                         expressiveness, motionPrompt }|null  (Etapa 10, 1x por curso)
roteiroAvatarPendente { index, segundos }|null
roteirosAvatarGerados string[]      (arquivos roteiroAvatar{NN}.docx já gerados nesta sessão)
duracaoAvatarDefault  number|null   (sticky — última duração em segundos usada)
videosAvatarGerados   object[]      ({ index, numero, titulo, baseName, geradoEm, heygen }; heygen = { saldoInicialUsd, saldoFinalUsd, consumoUsd?, moeda, apurado, origem: automatica|manual, motivo?, iniciadoEm, finalizadoEm, traceId, traceEnviado })
inputs                object        (inputs do usuário por etapa — topicos, limite, ajustesEnsino, observacoesAula)
slidesTemplate        { id, nome }|null   (template Gamma escolhido para o curso)
geracoesExternas      object        (ids de gerações pendentes no Gamma/HeyGen, para retomar após queda)
custoProjetoUsd       number        (custo acumulado do projeto; também em projeto.json)
custoHeygenUsd        number        (soma dos consumos HeyGen apurados = diferença de saldo da carteira; separado do custo em tokens; derivado de videosAvatarGerados[].heygen)
ultimoAcesso          number        (epoch ms — sessões inativas por mais de 12 h são descartadas)
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
site      { type, url, title }       — citação web capturada (Etapas 2 e pesquisa por módulo)
token     { type, text }             — chunk de texto gerado pelo modelo
warning   { type, text }             — aviso não fatal (aula curta, citação fraca…)
done      { type, fullText, ... }    — conclusão com texto completo; com chamadas ao LLM traz também traceId, tokens e custoUsd
error     { type, message }          — erro propagado ao cliente
```

---

## 5. Skills catalog (skills.js)

Cada skill retorna `{ model, system, user }` (a pesquisa web acrescenta `searchContextSize` e usa a Responses API). O modelo vem de `config/modelos.js`; "mini" abaixo é o modelo de economia.

| Skill | Modelo | Propósito |
|-------|--------|-----------|
| `pesquisaWebSkill` | pesquisa (`gpt-4o` + `web_search`) | Uma consulta de pesquisa geral (tendências, ferramentas, certificações, referências) |
| `pesquisaModuloSkill` | pesquisa (`gpt-4o` + `web_search`) | Pesquisa por módulo do plano de ensino, alimentando o dossiê de fontes das aulas |
| `pesquisaFallbackSkill` | mini | Pesquisa sem busca web, só por decisão do usuário após falha da busca (resultado rotulado) |
| `ementaSkill` | mini | Ementa do curso em 2 parágrafos objetivos |
| `planoEnsinoSkill` | mini | Plano com módulos, metodologia, avaliação, bibliografia |
| `planLessonsSkill` | mini | Divide curso em aulas — resposta JSON (`LessonMeta[]`) |
| `planoAulaSkill` | mini | Plano detalhado de uma aula (sequência didática, timing) |
| `conteudoSkill` | conteúdo | Conteúdo técnico por aula em passada única (modo legado `CONTEUDO_MODO=unico`) |
| `roteiroAulaSkill` | conteúdo | Roteiro JSON da aula (seções e metas de palavras) — geração por seções |
| `secaoConteudoSkill` | conteúdo | Escreve uma seção da aula, com o dossiê de fontes |
| `expandirSecaoSkill` | conteúdo | Expande uma seção abaixo da meta de palavras |
| `recursosAulaSkill` | mini | Recursos e materiais de apoio da aula |
| `revisaoQualidadeSkill` | mini | Relatório de revisão de qualidade por aula, com rubrica de 5 critérios (Etapa 5★), sobre a aula inteira |
| `revisaoSecaoSkill` | mini | Avaliação por seção, quando a aula não cabe na janela (map-reduce) |
| `coerenciaGlobalSkill` | mini | Coerência global da aula a partir das avaliações por seção |
| `aplicarMelhoriasSkill` | mini | Aplica melhorias anotadas como patch por seção (Etapa 6) |
| `scoreAulaSkill` | mini | Julgamento pareado original × candidato para o gate de score (Etapa 6) |
| `realinharPlanoAulaSkill` | mini | Realinha a seção do plano de aula após melhorias aplicadas (Etapa 6) |
| `metodologiaSkill` | mini | Deriva metodologia pedagógica adequada ao perfil do curso |
| `qualidadeSkill` | mini | Relatório Técnico-Pedagógico (7 seções, persona especialista) — Agente de Qualidade, Etapa 7 |
| `qualidadeModuloSkill` | mini | Análise por módulo sobre o conteúdo integral, quando o relatório não cabe numa chamada |
| `perfilEgressoSkill` | mini | Perfil do egresso do curso (PPC) |
| `competenciasSkill` | mini | Competências e habilidades desenvolvidas, com BNCC se ativo (PPC) |
| `perfilDocenteSkill` | mini | Perfil de formação e experiência recomendados para o professor (PPC) |
| `infraestruturaSkill` | mini | Recursos, equipamentos e ambiente necessários (PPC) |
| `ppcAssemblySkill` | mini | Monta PPC formal com 12 seções numeradas |
| `estiloVisualSkill` | mini | Gera o menu de 3–5 estilos visuais coerentes com o curso (Etapa 8) |
| `roteiroSkill` | mini | Gera o roteiro de vídeo de uma aula a partir do prompt aprovado (Etapa 9) |
| `roteiroAvatarSkill` | mini | Roteiro falado para o avatar, com duração em segundos (Etapa 10) |

> A geração dos slides em si (texto e imagem de cada card, Etapa 8) não usa
> uma skill de prompt local — é delegada à API do Gamma (`POST /generations`),
> que recebe o conteúdo da aula e o `housePrompt` do estilo escolhido.

**Helpers (sem chamada de API):**
- `summarizeLessons(aulas, { excludeIndex })` — mapa enxuto das aulas para contexto sequencial
- `pedagCtxBlock(metodologia, bnccContext)` e `bnccBlock(bncc)` — contexto pedagógico em formato único

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
- Identificada por cookie HttpOnly `sessionId` (`SameSite=Lax`)
- **Perdida ao reiniciar o servidor** (Gap G04) e descartada após 12 h sem uso
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
  roteiroAvatar01.docx                 scr/roteiroAvatar01.txt (... por aula — Etapa 10)
  videos/aula01_video.mp4              (... por aula — Etapa 10, gerado via HeyGen, subpasta criada sob demanda)
  scr/projeto.json                     — estado estruturado da sessão (config, bncc, aulas, inputs, stages)
  scr/score_historico.json             — histórico de scores por ciclo de melhorias
  scr/observacoes_pendentes.json       — observações extraídas do último upload da Etapa 6
  scr/ciclo_{NNN}/                     — snapshot do conteúdo antes de cada ciclo de melhorias
  scr/token_usage.json                 — consumo de tokens acumulado do projeto
  scr/pesquisa.json                    — metadados da pesquisa geral (modelo, consultas, fontes, achados, status)
  scr/pesquisa_modulos.json            — pesquisa por módulo (consultas, fontes e achados por módulo)
  scr/geracao_log.json                 — uma linha por chamada ao LLM (traceId, etapa, tokens, custo) e resumo por aula
  scr/revisao_log.json, notas_aulas.json — registro de leitura e notas da revisão de qualidade
  scr/plano_aula_progresso.json        — progresso temporário do plano de aula (removido ao consolidar)
```

- **Slug**: `"Nome do Curso"` → `"Nome_do_Curso"` (espaços viram `_`) — usado apenas no fallback legado
- Cada etapa persiste `.txt`/`.json` (memória para próximas etapas) **e** o entregável (`.docx`/`.pptx`)
- Sem truncamento por caracteres: aulas e documentos de referência entram inteiros nos prompts; quando passam de `AVALIACAO_MAX_TOKENS_ENTRADA` a avaliação usa map-reduce por seção, sem perder trechos

### Rastreamento de tokens
- Contador global em memória (`tokenUsage`), resetado ao reiniciar o servidor
- Acumulado por projeto em `scr/token_usage.json` (`{ total, porDia, atualizadoEm }`), sobrevive a restarts — ver capability `token-usage-tracking`
- `GET /api/tokens` retorna ambos; o contador da UI exibe o total do projeto ao lado do total da sessão
- Consumo do HeyGen: `GET /api/heygen/saldo` e `POST /api/heygen/saldo/atualizar` leem `GET /v3/users/me`; o consumo de cada vídeo é a diferença de saldo antes/depois, gravado em `videosAvatarGerados[].heygen` e somado em `custoHeygenUsd`; no Langfuse vão os spans `heygen.saldo`/`heygen.video`, o metadado `custo_heygen_usd` e o score `heygen_consumo_usd`
- Custo em USD por projeto: `custoProjetoUsd` em `projeto.json`, calculado do `usage` com `config/precos-modelos.json`; `ORCAMENTO_USD` (opcional) trava as etapas ao estourar o teto

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
- **Sem truncamento por caracteres** ao montar prompts a partir de artefatos já gerados: respeite o orçamento de tokens (`avaliacao.js`) e, se não couber, divida por seção
- **Commits em português**

---

## 9. Gaps conhecidos (priorizados)

| ID | Área | Severidade | Descrição |
|----|------|-----------|-----------|
| G01 | Segurança | ✅ Resolvido | `.env` está no `.gitignore` e não é rastreado pelo git |
| G02 | Segurança | Reduzido | Sem autenticação (aceito como constraint de uso local, ver `native-folder-picker`), mas o bind padrão é `127.0.0.1` (`HOST`), cookie `SameSite=Lax`, checagem de `Origin`/`Host` em `/api`, seletor de pasta só em loopback, pastas validadas (`validarPastaProjeto`), upload limitado a `.docx` de 20 MB, `/api/dev/seed` só com `ENABLE_DEV_SEED=true` e sessões inativas expiram em 12 h (`endurecer-fronteira-local`) |
| G03 | Segurança | ✅ Mitigado | `pastaProjeto` é validada contra `..`, caminhos dentro do diretório da aplicação e falta de permissão de escrita |
| G04 | Persistência | Reduzido | Sessão continua in-memory, mas é totalmente reconstruível do disco sem chamada à OpenAI (`session-persistence`, `session-auto-restore`, `project-load`) |
| G05 | Confiabilidade | ✅ Resolvido | Espera adaptativa de 429 (`retry-after`, backoff com teto), repetição de falhas transitórias e geração retomável (`geracao-retomavel`); retry dedicado da pesquisa web (`web-search-resilience`) |
| G06 | Observabilidade | ✅ Resolvido | Logger JSON próprio (`logger.js`, `LOG_LEVEL`) com `etapa`, `aula` e `reqId` (= `traceId`), sem segredos (`custo-e-logs`) |
| G07 | Testes | Melhorado | Baseline (`test-verification-baseline`): gate de cobertura 70% de linhas (real ~90%), mock da OpenAI que rejeita o que a API real rejeita, com erros, Responses API e truncamento; confira o número atual com `npm test` (50 suítes e 713 testes em 2026-10-25) — a verificação com a chave real (`scripts/smoke-pesquisa.js`) continua manual |
| G08 | UX | ✅ Resolvido | `GET /api/estimativa` e a UI mostram a faixa de tokens/custo antes de pesquisa por módulo, conteúdo e revisão; custo acumulado em `projeto.json`; `ORCAMENTO_USD` opcional (`custo-e-logs`) |
| G09 | Portabilidade | Baixo | Seletor nativo de pasta é Windows-only por design (PowerShell + `System.Windows.Forms`) |
| G10 | Escalabilidade | Baixo | Sem rate limiting próprio — múltiplos usuários podem esgotar quota da API (a espera de 429 e `CONTEUDO_PARALELISMO` ≤ 2 só protegem uma instância) |
| G11 | Qualidade | ✅ Resolvido | Avaliação sobre texto truncado: a revisão, o score e o relatório passam a ler a aula e os documentos inteiros, com map-reduce por seção quando não cabem (`avaliacao-conteudo-integral`) |
| G12 | Confiabilidade | ✅ Resolvido | Pesquisa sem verificação de fonte: Responses API com `web_search`, citações `url_citation`, status `web`/`legado`/`sem_web` e fundamentação das aulas por dossiê `[F#]` (`pesquisa-web-real`, `conteudo-fundamentado-em-pesquisa`) |
| G13 | Observabilidade | Reduzido | Observabilidade das chamadas ao LLM: traces e scores no Langfuse autohospedado, opcional (`observabilidade-langfuse`); atributos de trace do v4 em todo span (`langfuse-trace-attributes`) e dataset da linha de base enviado (`baseline-gerador-de-conteudo`, 1 curso de referência) |

> Ao propor uma nova funcionalidade, **referencie o Gap ID** caso ela resolva algum deles.

---

### Decisão: `.env.encrypted` versionado

O `.env.encrypted` (AES com passphrase em `.env.key`, fora do git — ver `env-encryption`) continua no repositório: é o meio de levar as chaves a outras máquinas/AWS sem expô-las em texto. A segurança depende só do sigilo da passphrase; se ela vazar, gire-a (`env:keygen` + `env:encrypt`) e revogue as chaves de API. Reavaliar se o repositório deixar de ser privado.

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
