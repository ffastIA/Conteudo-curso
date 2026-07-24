## Why

A Etapa 8 (Slides) hoje gera cada apresentação com duas chamadas OpenAI (estrutura
dos slides + imagem por slide) e monta o `.pptx` localmente via `pptxgenjs`. A API
do Gamma (gamma.app) faz esse mesmo trabalho — analisar o conteúdo, montar os
cards, gerar as imagens e devolver um `.pptx` pronto — em um único serviço externo
especializado em apresentações, com controle mais fino sobre tom, público-alvo e
quantidade de slides. O pedido é substituir o motor de geração **exclusivamente
nesta etapa** (as demais etapas do pipeline continuam em OpenAI) e, de quebra,
resolver uma limitação da versão atual: hoje a quantidade de slides por aula (6-10)
é decidida pela IA sem controle do usuário; a nova versão dá ao usuário um seletor
explícito (1-5) por aula.

## What Changes

- **BREAKING** (interno, sem contrato de API externo quebrado): `GET /api/slides`
  deixa de existir. É substituída por um fluxo de 3 endpoints com pausa por aula
  (`GET/POST /api/slides/parametros` + `GET /api/slides/gerar`), no mesmo padrão
  de revisão humana por aula já usado na Etapa 9 (Roteiros).
- Motor de geração passa de OpenAI (chat completion + `images.generate` +
  `pptxgenjs` local) para a API do Gamma v1.0 (`POST /generations` → poll
  `GET /generations/{id}` → download do `.pptx` via `exportUrl`).
- Quantidade de slides por aula deixa de ser decidida pela IA (6-10) e passa a ser
  um menu dropdown de 1 a 5 escolhido pelo usuário, por aula, com valor sticky
  (reaplicado por padrão à aula seguinte, editável a qualquer momento).
- Nova caixa de diálogo por aula com "observações complementares" (texto livre),
  também com valor sticky, gravado por aula no projeto (persistência per-aula,
  não só um valor global).
- Mantido: o seletor de "estilo visual" (Etapa 8 atual, ainda via OpenAI só para
  propor o menu de 3-5 estilos) — a escolha passa a alimentar o Gamma
  (`imageOptions.style`) em vez do prompt de imagem da OpenAI.
- Removido (código morto após a troca): `gerarImagemSlide`, `buildPptx`,
  `persistPptxStage`, `slidesSkill`, e as constantes `IMAGE_LAYOUT_CONSTRAINTS`/
  `MODEL_IMAGE`/`IMAGE_QUALITY` (uso exclusivo da geração de imagem antiga).
- Nova variável de ambiente `GAMMA_API_KEY` (mesmo padrão do `OPENAI_API_KEY`:
  `.env` gitignored + `.env.example` documentando em branco — não existe
  criptografia real hoje para nenhuma das duas chaves, confirmado em código).

## Capabilities

### New Capabilities
(nenhuma — esta mudança altera o comportamento de uma capability já existente,
não introduz uma nova etapa no pipeline)

### Modified Capabilities
- `slides-generation`: motor de geração trocado de OpenAI para a API do Gamma;
  quantidade de slides por aula passa de decisão automática da IA (6-10) para
  escolha do usuário via dropdown (1-5); geração passa a pausar para revisão
  humana (observações complementares) antes de cada aula, em vez de um loop
  automático único para todas as aulas do curso; persistência do arquivo final
  (`aula{NN}_slides.pptx`, mesmo nome/local de sempre) passa a vir de um
  download do Gamma em vez de montagem local via `pptxgenjs`.

## Impact

- **Código afetado**: `server.js` (remoção de `GET /api/slides`,
  `gerarImagemSlide`, `buildPptx`, `persistPptxStage`; adição dos 3 endpoints
  novos e dos helpers de integração com o Gamma), `skills.js` (remoção de
  `slidesSkill` e constantes associadas; `estiloVisualSkill` inalterada),
  `public/index.html`/`public/app.js` (novo card de parâmetros por aula dentro
  da mesma seção `#step8`), `.env.example` (nova variável).
- **Dependências**: nenhuma nova — usa `fetch` nativo do Node (≥18) para chamar
  a API REST do Gamma. `pptxgenjs` deixa de ser necessária nesta etapa; será
  removida do `package.json` se confirmado, na implementação, que não é usada
  em mais nenhum outro lugar do projeto.
- **Custo operacional**: a geração passa a consumir créditos pagos da conta
  Gamma (texto + imagem), diferente do custo já orçado de tokens OpenAI — é um
  trade-off aceito para esta troca, documentado no `design.md`, não um non-goal.
- **Sessão/projeto**: novos campos `sess.slidesObservacaoDefault`,
  `sess.slidesQuantidadeDefault`, `sess.slidesPendente`, `sess.slidesGerados`
  (array por aula) — mesmo padrão de persistência já usado para
  `sess.roteiroBlocos`/`sess.roteirosGerados` na Etapa 9.
- **Non-goals**: não altera nenhuma outra etapa do pipeline (todas continuam em
  OpenAI); não adiciona autenticação/multi-tenancy (fora do escopo do projeto,
  PROJECT.md §10); não implementa retry automático em falha do Gamma (G05 já é
  um gap conhecido e genérico do projeto — falha aqui segue o mesmo padrão
  "sem retry automático" já aceito em outras chamadas externas); não adiciona
  criptografia real para nenhuma chave de API (nem a nova, nem a existente) —
  mantém o padrão já em uso (`.env` + `.env.example`, sem valor commitado).
