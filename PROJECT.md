# Gerador de Conteúdo Educacional — Guia Geral do Projeto

> **Propósito deste arquivo:** referência canônica para qualquer contribuição ao projeto — novas funcionalidades, proposals OpenSpec, refatorações ou integrações. Leia antes de propor qualquer mudança.

---

## 1. O que é o sistema

Aplicação web que **automatiza a criação de material didático completo** para cursos de formação tecnológica profissional. A partir de uma especificação básica (nome, público-alvo, carga horária, objetivos), o sistema produz ementa, planos de ensino e de aula, conteúdo técnico por aula, relatório de qualidade pedagógica e PPC (Projeto Pedagógico de Curso) — todos exportáveis como `.docx` formatado.

**Público-alvo do sistema:** instrutores, coordenadores pedagógicos e gestores de cursos técnicos que precisam produzir material didático de qualidade em tempo reduzido.

**Domínio do conteúdo gerado:** cursos livres de formação tecnológica profissional para adultos; com suporte opcional a educação básica (EF1, EF2, Ensino Médio) via alinhamento BNCC.

---

## 2. Estado atual do projeto

### 2.1 Pipeline implementado (8 etapas)

| # | Etapa | Endpoint | Status |
|---|-------|----------|--------|
| 0 | Base Pedagógica (BNCC + Metodologia) | `POST /api/bncc/selecionar`, `GET /api/metodologia` | ✅ Implementado |
| 1 | Configuração do curso + ementa | `POST /api/config` | ✅ Implementado |
| 2 | Pesquisa web | `GET /api/search` (SSE) | ✅ Implementado |
| 3 | Plano de ensino | `GET /api/plano-ensino` (SSE) | ✅ Implementado |
| 4 | Plano de aulas | `GET /api/plano-aula` (SSE) | ✅ Implementado |
| 5 | Conteúdo por aula | `GET /api/conteudo` (SSE) | ✅ Implementado |
| 6 | Expansão enriquecida (+50%) | `GET /api/expandir` (SSE) | ✅ Implementado |
| 7 | Qualidade pedagógica + PPC | `GET /api/qualidade`, `GET /api/ppc` (SSE) | ✅ Implementado |

### 2.2 Changes OpenSpec ativas

| Change | Status | Descrição |
|--------|--------|-----------|
| `pedagogical-foundation` | Em andamento (task 11 pendente: testes manuais) | Etapa 0 BNCC + Metodologia + Qualidade + PPC |
| `bncc-alignment-step` | Criada, sem tasks | Sem implementação iniciada |

---

## 3. Arquitetura técnica

### 3.1 Stack

```
Backend:   Node.js 18+ + Express 4.18
Frontend:  Vanilla JS + HTML5 + CSS3 (sem frameworks)
IA:        OpenAI SDK v4
Docs:      docx v9
Testes:    Jest 30.4.2 + Supertest 7.2.2
Protocolo: Server-Sent Events (SSE) para todas as operações assíncronas
Sessão:    cookie HttpOnly (sid) → objeto in-memory `sessions[sid]`
```

### 3.2 Modelos de IA em uso

| Modelo | Casos de uso |
|--------|-------------|
| `gpt-4o-mini` | Todas as skills de geração: ementa, planos, conteúdo, qualidade, PPC |
| `gpt-4o-search-preview` | Pesquisa web (Etapa 2), expansão enriquecida (Etapa 6) |

### 3.3 Mapa de arquivos

```
server.js          — Express + 24 endpoints REST/SSE + DOCX builder + persistência
skills.js          — 16 skills de prompt ({model, system, user})
bncc-data.js       — 400+ competências/habilidades BNCC (EF1, EF2, EM)
mcp-server.js      — MCP server para Claude Desktop (7 tools, JSON-RPC via stdin/stdout)
public/index.html  — Frontend HTML (Etapas 0–7, formulários, log panels)
public/app.js      — Frontend JS (SSE streaming, BNCC UI, navegação entre etapas)
public/style.css   — Estilos (card-based, responsivo)
specs.yaml         — Specs canônicas (modelos de dados, endpoints, pipeline)
openspec/          — Configuração e changes do OpenSpec
saídas/            — Arquivos gerados por curso ({curso-slug}/*.txt e *.docx)
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
> Tokens: teto uniforme de saída por aula `MAX_TOKENS_AULA = 10.000` (ambos os
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
config              CourseConfig
bncc                { ativo: bool, publico: string, nivel: string, itens: [] }
metodologia         string
ementa              string
pesquisa            string
planoEnsino         string
planoAula           string
aulas               LessonMeta[]
conteudoPorAula     LessonContent[]
conteudo            string        (consolidado de todas as aulas)
revisaoCoerencia    string
relatorioQualidade  string
pastaSaida          string|null   (caminho absoluto para .docx)
pastaExpandir       string|null   (caminho absoluto para Etapa 6)
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
| `ementaSkill` | mini | Ementa do curso em 2 parágrafos objetivos |
| `planoEnsinoSkill` | mini | Plano com módulos, metodologia, avaliação, bibliografia |
| `planLessonsSkill` | mini | Divide curso em aulas — resposta JSON (`LessonMeta[]`) |
| `planoAulaSkill` | mini | Plano detalhado de uma aula (sequência didática, timing) |
| `conteudoSkill` | mini | Conteúdo técnico denso por aula (referência do instrutor) |
| `conteudoRegenSkill` | mini | Regenera conteúdo com abordagem distinta (ativado por deduplicação) |
| `revisaoCoerenciaSkill` | mini | Auditoria cross-document entre todos os conteúdos gerados |
| `expansaoConteudoSkill` | search-preview | Expande conteúdo +50% com pesquisa web |
| `aplicarSugestoesSkill` | mini | Aplica sugestões da revisão de coerência ao conteúdo expandido |
| `metodologiaSkill` | mini | Deriva metodologia pedagógica adequada ao perfil do curso |
| `qualidadeSkill` | mini | Relatório Técnico-Pedagógico (6 seções, persona especialista) |
| `perfilEgressoSkill` | mini | Perfil do egresso do curso |
| `competenciasSkill` | mini | Competências e habilidades desenvolvidas (com BNCC se ativo) |
| `perfilDocenteSkill` | mini | Perfil de formação e experiência recomendados para o professor |
| `infraestruturaSkill` | mini | Recursos, equipamentos e ambiente necessários |
| `ppcAssemblySkill` | mini | Monta PPC formal com 12 seções numeradas |

**Helper (sem chamada de API):**
- `summarizeLessons(aulas, { excludeIndex })` — mapa enxuto das aulas para contexto sequencial

---

## 6. Mecanismos de qualidade do conteúdo gerado (Etapa 5)

O conteúdo por aula tem 6 ajustes para garantir coerência curricular:

1. **Trecho específico**: cada aula recebe via `extractLessonBlock()` só o trecho que lhe corresponde no plano de aulas
2. **Rastreamento de módulo**: o campo `modulo` de `LessonMeta` referencia exatamente um módulo do plano de ensino
3. **Consciência sequencial**: `summarizeLessons()` injeta mapa enxuto das demais aulas para evitar repetição ou antecipação de conteúdo
4. **Limites de escopo**: prompt explicita que a aula deve abordar **estritamente** seus próprios objetivos
5. **Deduplicação automática**: `textSimilarity()` (Jaccard, threshold 55%) detecta similaridade com a aula anterior; se acionado, `conteudoRegenSkill` regenera com abordagem distinta
6. **Revisão de coerência**: `revisaoCoerenciaSkill` audita cross-document todos os conteúdos ao final da etapa

---

## 7. Persistência

### Sessão (in-memory)
- Identificada por cookie HttpOnly `sid`
- **Perdida ao reiniciar o servidor** (Gap G04)
- `readMemory(sess, nome)` lê `.txt` do disco para restaurar etapas em sessões novas

### Sistema de arquivos
```
saídas/{curso-slug}/
  ementa.txt / ementa.docx
  pesquisa.txt / pesquisa.docx
  plano_de_ensino.txt / plano_de_ensino.docx
  plano_de_aula.txt / plano_de_aula.docx
  aula01_conteudo.txt / aula01_conteudo.docx
  aula02_conteudo.txt / aula02_conteudo.docx   (... por aula)
  conteudo.txt / conteudo.docx                 (consolidado)
  revisao_coerencia.txt / revisao_coerencia.docx
  aula01_conteudo_expandido.txt / .docx        (Etapa 6)
  relatorio_qualidade.txt / relatorio_qualidade.docx
  ppc_completo.txt / ppc_completo.docx
```

- **Slug**: `"Nome do Curso"` → `"Nome_do_Curso"` (espaços viram `_`)
- Cada etapa persiste `.txt` (memória para próximas etapas) **e** `.docx` (entregável)
- Truncamento a 1.500 caracteres ao passar contexto para skills (controle de tokens)

### Rastreamento de tokens
- `tokenUsage = { promptTokens, completionTokens, total }` — global ao processo
- Exposto via `GET /api/tokens` (frontend faz polling periódico)
- Resetado ao reiniciar o servidor

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
| G01 | Segurança | Crítico | `.env` com chave OpenAI possivelmente versionado |
| G02 | Segurança | Alto | Sem autenticação — qualquer um acessa a API |
| G03 | Segurança | Médio | Paths de pasta sem sanitização contra path traversal |
| G04 | Persistência | Alto | Sessão in-memory perdida ao reiniciar o servidor |
| G05 | Confiabilidade | Médio | Sem retry automático em falhas OpenAI (timeout, rate limit) |
| G06 | Observabilidade | Médio | Sem logging estruturado (apenas `console.log`) |
| G07 | Testes | Médio | Suite de testes automatizados parcial |
| G08 | UX | Baixo | Sem estimativa de custo/tokens antes de iniciar etapa |
| G09 | Portabilidade | Baixo | Caminhos Windows-centric (backslashes hardcoded) |
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
4. **Impacto em arquivos**: `server.js`, `skills.js`, `public/app.js`, `public/index.html`, `specs.yaml`
5. **Gap resolvido** (se aplicável): referencie o ID da tabela acima

Referências úteis antes de propor:
- Modelos de dados completos → seção 4 deste arquivo e `specs.yaml`
- Skills existentes → seção 5 deste arquivo e `skills.js`
- Padrões de código → seção 8 deste arquivo
- Gaps priorizados → seção 9 deste arquivo
