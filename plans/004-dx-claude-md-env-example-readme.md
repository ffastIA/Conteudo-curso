# Plan 004: Criar CLAUDE.md e .env.example; atualizar o README para a realidade do app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e61017a..HEAD -- README.md PROJECT.md server.js`
> Mudanças em `server.js` vindas dos planos 001/003 são esperadas (novas
> funções `sseError`/`clientAbort`); mudanças na LISTA DE ROTAS são drift real —
> re-derive a tabela de endpoints do Step 3 com o grep indicado antes de usá-la.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (somente documentação e arquivos novos; zero código)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `e61017a`, 2026-07-07

## Why this matters

Três fricções baratas de eliminar: (1) o repo é desenvolvido via agentes
(workflow OpenSpec), mas não há `CLAUDE.md` na raiz — o guia canônico
`PROJECT.md` não é carregado automaticamente, então cada sessão de agente
redescobre a arquitetura do zero; (2) não existe `.env.example` — a única
variável obrigatória (`OPENAI_API_KEY`) só está documentada em prosa no README;
(3) o `README.md` está concretamente errado: descreve um pipeline de **5
etapas** e **6 endpoints** com modelo `gpt-4o`, quando o app tem etapas 0–8
(incl. slides), ~25 rotas e usa `gpt-4o-mini` como modelo principal. Doc
desatualizada é pior que ausente — engana quem chega pelo README.

## Current state

- `README.md` — 69 linhas; erros factuais: `:3-5` "pipeline de 5 etapas",
  `:13-16` nomeia `gpt-4o` como gerador (real: `gpt-4o-mini`, ver
  `PROJECT.md §3.2` e `MODEL_ECONOMY` em `skills.js`), `:38-47` árvore de pastas
  omite `skills.js`, `bncc-data.js`, `openspec/`, `saídas/`, `tests/`,
  `:51-59` tabela com só 6 endpoints, `:63` afirma estado só em memória
  (real: persistência dupla `.txt`+`.docx` por etapa, `PROJECT.md §7`).
- `PROJECT.md` — guia canônico correto e mantido (seções §1–§11). O CLAUDE.md
  deve APONTAR para ele, não duplicá-lo. Única correção aqui: `:65` diz
  "17 endpoints"; o número real hoje é ~25 (validar no Step 3).
- `CLAUDE.md`, `AGENTS.md`, `.env.example` — não existem (verificado em `e61017a`).
- `.gitignore` — ignora `.env` (linha exata) e `.claude/`; **não** ignora
  `CLAUDE.md` nem `.env.example` na raiz. Ignora `*.docx`.
- `.env` — contém a chave real da OpenAI. **NUNCA abrir, copiar ou mover este
  arquivo.** O `.env.example` é criado do zero com placeholder vazio.

Modelos reais em uso (de `PROJECT.md §3.2` + `skills.js:1-10`):
`gpt-4o-mini` (constante `MODEL_ECONOMY`) para todas as skills de geração;
`gpt-4o-search-preview` (constante `MODEL_RESEARCH`) para pesquisa web e expansão.

Pipeline real (de `PROJECT.md §2.1` + rotas): Etapa 0 BNCC/Metodologia;
1 Config+ementa; 2 Pesquisa web; 3 Plano de ensino; 4 Plano de aulas;
5 Conteúdo por aula; 5★ Revisão de qualidade + ciclo de melhorias;
7 Qualidade pedagógica + PPC; 8 Slides (PPTX, com imagens via API).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Testes (sanidade) | `npm test` | todos passam (nada de código muda) |
| Listar rotas | `grep -nE "^app\.(get\|post)\(" server.js` | ~25 linhas |

## Scope

**In scope**:
- `CLAUDE.md` (criar, raiz)
- `.env.example` (criar, raiz)
- `README.md` (reescrever)
- `PROJECT.md` — somente a linha "17 endpoints" (§3.3, linha ~65)

**Out of scope** (NÃO tocar):
- `.env` — nunca abrir nem referenciar o conteúdo.
- `PROJECT.md` além da linha citada (é o doc canônico; grandes mudanças nele
  têm dono humano). A linha sobre `mcp-server.js` (`:68`) é removida pelo
  plano 005, não por este.
- Qualquer arquivo `.js` — zero código neste plano.
- `openspec/` — specs têm workflow próprio.

## Git workflow

- Branch: `advisor/004-dx-docs`.
- Commits em português, imperativo. Sugestão: `Adiciona CLAUDE.md e .env.example
  e atualiza README para o pipeline atual`.
- NÃO fazer push nem abrir PR sem instrução do operador.

## Steps

### Step 1: Criar `.env.example`

Conteúdo exato (placeholder vazio — NUNCA copiar valor de `.env`):

```
# Chave da API da OpenAI (obrigatória) — https://platform.openai.com/api-keys
OPENAI_API_KEY=

# Porta do servidor (opcional; padrão 3000)
# PORT=3000
```

**Verify**: `git check-ignore .env.example` → exit 1 (não ignorado);
`grep -c "=" .env.example` → 2; o arquivo NÃO contém nenhum valor após `OPENAI_API_KEY=`.

### Step 2: Criar `CLAUDE.md` na raiz

Arquivo FINO (≤ 40 linhas) que aponta para o guia canônico. Estrutura:

```markdown
# Gerador de Conteúdo Educacional

Leia `PROJECT.md` antes de qualquer mudança — é o guia canônico
(arquitetura §3, modelos de dados §4, catálogo de skills §5, padrões de
código §8, gaps priorizados §9, non-goals §10).

## Comandos
- `npm test` — suíte Jest (deve ficar verde antes e depois de qualquer mudança)
- `npm run test:coverage` — cobertura com gate de 40% de linhas
- `node server.js` — sobe em http://localhost:3000 (requer `.env`, ver `.env.example`)

## Regras que sempre se aplicam (resumo do PROJECT.md §8/§10)
- Nenhuma dependência npm nova sem aprovação explícita.
- Toda operação assíncrona nova usa SSE (nunca polling/WebSockets).
- Toda etapa geradora persiste `.txt` + `.docx` e injeta o contexto
  pedagógico via `pedagCtxBlock(...)`.
- Commits em português.
- Non-goals permanentes: códigos BNCC específicos, certificação oficial,
  PPC regulado (SENAI/SENAC/MEC), multi-tenancy/autenticação, WebSockets.

## Mudanças de funcionalidade
Propostas via workflow OpenSpec (`openspec/`) — ver PROJECT.md §11.
```

Ajuste o texto se necessário, mantendo: ponteiro para PROJECT.md no topo,
comandos verificados, regras §8 resumidas, non-goals §10 resumidos.

**Verify**: `test -f CLAUDE.md && wc -l CLAUDE.md` → arquivo existe, ≤ 45 linhas.

### Step 3: Reescrever `README.md`

Antes de escrever, regenerar a lista de rotas:
`grep -nE "^app\.(get|post)\(" server.js`. Em `e61017a` a lista era (método,
rota, papel — use como base e corrija pelo grep):

| Método | Rota | Papel |
|---|---|---|
| GET | `/api/bncc` | Lista competências BNCC por nível |
| POST | `/api/bncc/selecionar` | Salva seleção BNCC na sessão |
| POST | `/api/bncc/pular` | Pula alinhamento BNCC |
| GET (SSE) | `/api/metodologia` | Deriva metodologia pedagógica |
| POST | `/api/metodologia/confirmar` | Confirma metodologia |
| GET (SSE) | `/api/qualidade` | Relatório técnico-pedagógico |
| GET (SSE) | `/api/ppc` | Monta o PPC completo |
| GET | `/api/estilos-visuais` | Lista estilos de slides |
| POST | `/api/estilos-visuais/selecionar` | Seleciona estilo |
| GET (SSE) | `/api/slides` | Gera slides PPTX (com imagens) |
| GET | `/api/escolher-pasta` | Abre seletor nativo de pasta |
| POST | `/api/config` | Configuração do curso + ementa |
| GET (SSE) | `/api/search` | Pesquisa web |
| GET (SSE) | `/api/plano-ensino` | Plano de ensino |
| GET (SSE) | `/api/plano-aula` | Plano de aulas |
| GET (SSE) | `/api/conteudo` | Conteúdo por aula |
| GET | `/api/tokens` | Contadores de tokens |
| POST | `/api/carregar-projeto` | Restaura projeto do disco |
| POST | `/api/importar` (+`/confirmar`) | Importa etapa de um `.docx` |
| POST | `/api/export/:step` | Exporta `.docx` da etapa |
| GET (SSE) | `/api/revisao-qualidade` | Revisão de qualidade por aula |
| POST | `/api/aplicar-melhorias` (+GET SSE `/confirmar`) | Ciclo de melhorias |
| POST | `/api/finalizar-conteudo` | Consolida conteúdo final |

Estrutura do novo README (manter o tom e o tamanho enxuto do atual, ~90-110
linhas): título e 1 parágrafo do que é (baseado em PROJECT.md §1); pipeline
com as etapas 0–8 reais ("Current state" acima); instalação
(`npm install`, copiar `.env.example` para `.env` e preencher a chave,
`node server.js`); estrutura de pastas real (`server.js`, `skills.js`,
`bncc-data.js`, `public/`, `tests/`, `openspec/`, `saídas/`, `specs.yaml`,
`PROJECT.md`); a tabela de endpoints acima; observações técnicas corrigidas
(sessão em memória + persistência dupla em `saídas/{slug}/` e restauração via
`/api/carregar-projeto`; modelos `gpt-4o-mini` e `gpt-4o-search-preview`;
eventos SSE `progress|site|token|done|warning|error`); ponteiro final para
`PROJECT.md` (contribuição) e `CLAUDE.md` (agentes).

Não mencionar `mcp-server.js` (o plano 005 o remove).

**Verify**: `grep -c "gpt-4o-mini" README.md` → ≥ 1;
`grep -c "gpt-4o\"" README.md` → 0 (o modelo antigo não é mais citado como gerador);
`grep -c "api/slides" README.md` → ≥ 1; `grep -ci "5 etapas" README.md` → 0.

### Step 4: Corrigir a contagem em `PROJECT.md`

Na linha ~65 (`server.js          — Express + 17 endpoints REST/SSE + ...`),
trocar `17` pelo número real contado no grep do Step 3.

**Verify**: `grep -n "17 endpoints" PROJECT.md` → nenhum match.

### Step 5: Sanidade

**Verify**: `npm test` → todos passam (nenhum código foi tocado);
`git diff --stat` mostra somente `README.md`, `PROJECT.md` e os 2 arquivos novos.

## Test plan

Sem testes de código — plano só de documentação. As verificações por grep dos
Steps 1–4 são o test plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `test -f CLAUDE.md && test -f .env.example` → exit 0.
- [ ] `.env.example` não contém nenhum caractere após `OPENAI_API_KEY=` na mesma linha.
- [ ] `grep -ci "5 etapas" README.md` → 0; `grep -c "api/slides" README.md` → ≥ 1.
- [ ] `grep -n "17 endpoints" PROJECT.md` → nenhum match.
- [ ] `npm test` exit 0.
- [ ] `git status` mostra apenas os 4 arquivos do escopo.
- [ ] Linha deste plano atualizada em `plans/README.md`.

## STOP conditions

Stop and report back (do not improvise) if:

- Qualquer passo parecer exigir abrir ou ler `.env` — nunca é necessário.
- A lista de rotas do grep divergir fortemente (>3 rotas) da tabela deste plano —
  o app mudou; re-derive a tabela mas reporte a divergência.
- Já existir um `CLAUDE.md` ou `.env.example` (outro plano/pessoa criou antes) —
  reconcilie em vez de sobrescrever.

## Maintenance notes

- O README agora tem uma tabela de rotas que **vai** desatualizar; a fonte da
  verdade é o grep de rotas — considere num follow-up gerar essa tabela por
  script.
- Revisor: conferir que o CLAUDE.md ficou fino (ponteiro, não cópia) — duplicar
  o PROJECT.md criaria uma segunda fonte de verdade que diverge.
- Deferido para o plano 005: remover a linha do `mcp-server.js` do mapa de
  arquivos do PROJECT.md (`:68`).
- Deferido (achado DOCS-02, não selecionado): specs em `openspec/specs/` citam
  a constante `MODEL_SEARCH`, mas o código usa `MODEL_RESEARCH` (`skills.js:6`).
