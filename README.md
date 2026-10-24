# Agente de Conteúdo Educacional — Cursos de Formação Tecnológica

Aplicação web (Node.js + Express) que automatiza a criação de material
didático completo para cursos de formação tecnológica profissional. A partir
de uma especificação básica (nome, público-alvo, carga horária, objetivos), o
sistema produz ementa, planos de ensino e de aula, conteúdo técnico por aula,
slides, relatório de qualidade pedagógica e PPC (Projeto Pedagógico de Curso)
— todos exportáveis como `.docx`/`.pptx` formatados.

## Pipeline

0. **Base pedagógica** — alinhamento opcional à BNCC e derivação da
   metodologia de ensino.
1. **Configuração do curso** — formulário com dados básicos (nome, público,
   carga horária, duração da aula, nível, modalidade, objetivos), pasta do
   projeto e geração da ementa.
2. **Pesquisa web** — Responses API com `web_search` (`gpt-4o`) para levantar
   tópicos, ferramentas, tendências e referências atuais, com as fontes
   citadas; depois, uma pesquisa por módulo que alimenta o conteúdo.
3. **Plano de ensino** — gerado com `gpt-4o-mini`, usando o contexto da
   pesquisa.
4. **Plano de aulas** — gerado aula a aula, retomável se a geração cair.
5. **Conteúdo detalhado da aula** — por seções, sem truncamento, fundamentado
   nas fontes da pesquisa e com referências montadas pelo sistema.
5★/6. **Revisão de qualidade + ciclo de melhorias** — avaliação sobre o
   conteúdo integral, nota por aula e aplicação de melhorias por seção a
   partir de anotações do revisor.
7. **Qualidade pedagógica + PPC** — relatório técnico-pedagógico e Projeto
   Pedagógico de Curso.
8. **Slides** — geração de slides (`.pptx`) por aula pela API do Gamma, com
   template opcional.
9. **Roteiros de vídeo** — roteiro por aula a partir de um prompt-modelo
   aprovado (`PromptRoteiro.docx`).
10. **Vídeo com avatar** — roteiro falado e vídeo (`.mp4`) por aula pela API
    do HeyGen, escolhendo avatar e voz.

As etapas 8, 9 e 10 são opcionais e independentes.

Cada etapa exibe um log de progresso em tempo real (via SSE/streaming) e
permite exportar o resultado como documento `.docx` formatado (capa,
cabeçalho/rodapé com numeração de página, títulos e listas).

## Instalação e execução

```bash
npm install
cp .env.example .env   # preencha OPENAI_API_KEY
node server.js
```

Acesse: [http://localhost:3000](http://localhost:3000)

> `.docx` e tela renderizam listas, tabelas, código, itálico e links. Instruções
> específicas de template do Gamma ficam em `GAMMA_TEMPLATE_PROMPTS` (JSON por id
> de template) e os modelos em `OPENAI_RESEARCH_MODEL`, `OPENAI_CONTENT_MODEL` e
> `OPENAI_ECONOMY_MODEL` — ver `.env.example`.

> Por padrão o servidor escuta só em `127.0.0.1`. Em container ou rede local,
> defina `HOST=0.0.0.0` (ex.: `HOST=0.0.0.0` no compose) — o app não tem
> autenticação, então exponha apenas em rede confiável. Requisições `/api` com
> `Origin` de outro site são recusadas (403).

> A chave da API é lida apenas no backend (via `dotenv`) e nunca é exposta
> ao frontend.

## Estrutura de pastas

```
/
├── server.js          — Express + endpoints REST/SSE + DOCX builder + persistência
├── skills.js           — skills de prompt ({model, system, user})
├── bncc-data.js         — competências/habilidades BNCC (EF1, EF2, EM)
├── conteudo-secoes.js, fundamentacao.js, avaliacao.js — conteúdo por seções, fontes e avaliação integral
├── observabilidade.js, custo.js, logger.js — traces (Langfuse), custo/orçamento e logs JSON
├── docx-markdown.js     — Markdown → .docx (listas, tabelas, código, links)
├── config/              — modelos.js e precos-modelos.json
├── docs/                — decisões, guia do Langfuse e linha de base
├── package.json
├── .env.example
├── PROJECT.md           — guia canônico de arquitetura e convenções
├── openspec/            — configuração, changes e specs canônicas (openspec/specs/)
├── public/
│   ├── index.html        — Frontend HTML (Etapas 0–10, formulários, log panels)
│   ├── app.js             — Frontend JS (SSE streaming, BNCC UI, navegação entre etapas)
│   ├── markdown.js        — análise e renderização de Markdown (também usada no .docx)
│   └── style.css
├── tests/               — testes unitários e de integração (Jest + Supertest)
└── saídas/              — fallback de projetos legados (os projetos novos ficam na pasta escolhida na Etapa 1)
```

## Endpoints

| Método | Rota                                   | Descrição                                              |
|--------|-----------------------------------------|---------------------------------------------------------|
| GET    | `/api/bncc`                             | Lista competências BNCC por nível                       |
| POST   | `/api/bncc/selecionar`                  | Salva seleção BNCC na sessão                            |
| POST   | `/api/bncc/pular`                       | Pula alinhamento BNCC                                   |
| GET    | `/api/metodologia`                      | SSE — deriva metodologia pedagógica                     |
| POST   | `/api/metodologia/confirmar`            | Confirma metodologia (e gera ementa pendente)           |
| GET    | `/api/escolher-pasta`                   | Abre o seletor nativo de pasta (Windows, só em loopback)|
| POST   | `/api/config`                           | Configuração do curso + geração da ementa               |
| GET    | `/api/search`                           | SSE — pesquisa web geral (Responses API + `web_search`) |
| GET    | `/api/pesquisa-modulos`                 | SSE — pesquisa web por módulo (`?refazer=1` refaz)      |
| GET    | `/api/pesquisa-modulos/status`          | Estado da pesquisa por módulo                           |
| POST   | `/api/pesquisa-modulos/pular`           | Gera o conteúdo sem pesquisa por módulo                 |
| GET    | `/api/plano-ensino`                     | SSE — gera plano de ensino                              |
| GET    | `/api/plano-aula`                       | SSE — gera plano de aulas, retomável (`?refazer=1`)     |
| GET    | `/api/conteudo`                         | SSE — conteúdo por aula (`?aulas=N`, `?refazer=1`)      |
| GET    | `/api/estimativa`                       | Tokens e custo estimados antes de uma etapa pesada      |
| GET    | `/api/tokens`                           | Contadores de tokens consumidos                         |
| GET    | `/api/revisao-qualidade`                | SSE — revisão de qualidade por aula                     |
| POST   | `/api/aplicar-melhorias`                | Upload do `.docx` anotado com melhorias                 |
| GET    | `/api/aplicar-melhorias/confirmar`      | SSE — aplica o ciclo de melhorias                       |
| POST   | `/api/finalizar-conteudo`               | Consolida o conteúdo final da Etapa 6                   |
| GET    | `/api/qualidade`                        | SSE — relatório técnico-pedagógico                      |
| GET    | `/api/ppc`                              | SSE — monta o PPC completo                              |
| GET    | `/api/estilos-visuais`                  | Lista estilos visuais para os slides                    |
| POST   | `/api/estilos-visuais/selecionar`       | Seleciona o estilo visual                               |
| GET    | `/api/slides/templates`                 | Lista os templates Gamma configurados                   |
| POST   | `/api/slides/template`                  | Escolhe o template Gamma do curso                       |
| GET    | `/api/slides/parametros`                | Parâmetros sugeridos de uma aula                        |
| POST   | `/api/slides/parametros`                | Aprova quantidade de slides e observações               |
| GET    | `/api/slides/gerar`                     | SSE — gera os slides `.pptx` da aula (Gamma)            |
| POST   | `/api/roteiro/blocos`                   | Define o número de blocos do roteiro                    |
| GET    | `/api/roteiro/prompt`                   | Prompt do roteiro preenchido para revisão               |
| POST   | `/api/roteiro/aprovar`                  | Aprova o prompt do roteiro                              |
| GET    | `/api/roteiro/gerar`                    | SSE — gera os roteiros de vídeo                         |
| GET    | `/api/heygen/avatares`                  | Lista avatares do HeyGen                                |
| GET    | `/api/heygen/vozes`                     | Lista vozes do HeyGen                                   |
| POST   | `/api/heygen/config`                    | Salva avatar, voz e expressividade                      |
| GET    | `/api/video-avatar/parametros`          | Parâmetros do vídeo de uma aula                         |
| POST   | `/api/video-avatar/parametros`          | Aprova a duração do vídeo                               |
| GET    | `/api/video-avatar/roteiro/gerar`       | SSE — roteiro falado do avatar                          |
| GET    | `/api/video-avatar/gerar`               | SSE — gera o vídeo `.mp4` (HeyGen)                      |
| POST   | `/api/carregar-projeto`                 | Restaura um projeto salvo a partir do disco             |
| POST   | `/api/importar`                         | Detecta a etapa de um `.docx` enviado pelo usuário      |
| POST   | `/api/importar/confirmar`               | Sobrescreve uma etapa com a versão editada pelo usuário |
| POST   | `/api/export/:step`                     | Gera e salva o `.docx` da etapa                         |
| GET    | `/api/dev/seed`                         | Dados de exemplo (só com `ENABLE_DEV_SEED=true`)        |

## Observações técnicas

- Estado da sessão mantido em memória, identificado por cookie `sessionId`
  (HttpOnly), com restauração a partir do disco via `/api/carregar-projeto`.
- Cada etapa que gera conteúdo persiste em disco tanto o texto (`.txt`,
  memória para as próximas etapas) quanto o entregável (`.docx`/`.pptx`),
  na pasta do projeto (`scr/` para os `.txt`/`.json`).
- Modelos de IA em uso: `gpt-4o-mini` para as skills de geração e `gpt-4o`
  (Responses API + `web_search`) para a pesquisa web; todos configuráveis por
  `OPENAI_ECONOMY_MODEL`, `OPENAI_CONTENT_MODEL` e `OPENAI_RESEARCH_MODEL`.
- Limites da API: o 429 é tratado com espera adaptativa visível na tela;
  `CONTEUDO_PARALELISMO` (padrão 1, máximo 2) controla aulas simultâneas.
- Custo: a tela mostra a estimativa antes das etapas pesadas e o custo real
  depois; `ORCAMENTO_USD` define um teto opcional por projeto.
- Logs em JSON no terminal (`LOG_LEVEL`); com `LANGFUSE_ENABLED=true` as
  chamadas ao modelo também vão para o Langfuse autohospedado
  (`docs/langfuse-autohospedado.md`).
- Eventos SSE seguem o formato `{"type": "...", ...}` com tipos `progress`,
  `site`, `token`, `done`, `warning` e `error`.

## Testes e verificação real

- `npm test` roda a suíte Jest sem rede: o SDK da OpenAI é substituído por um
  mock (`tests/__mocks__/openai.js`) que rejeita o que a API real rejeita
  (`web_search_options` em `chat.completions` → 400, modelos `*-search-preview`
  → 404, Responses API sem `model`/`input`) e simula 429, 5xx, truncamento
  (`finish_reason: 'length'`) e a busca web com citações.
- `npm run test:coverage` aplica o gate de 70% de linhas (`jest.config.js`).
- **Antes de um release que toque a Etapa 2 (pesquisa web)**, rode manualmente
  `node scripts/smoke-pesquisa.js` com a chave real: ele chama cada variante da
  API de busca uma vez e confirma o caminho que funciona (resultado em
  `docs/decisoes/pesquisa-api.md`). Não faz parte da suíte nem da CI.
- Ao fim de uma fase grande, `node scripts/gerar-baseline.js` reexecuta o curso de
  referência (`docs/baseline/`) para comparar tamanho das aulas, fontes e notas;
  usa a chave real e gasta crédito, então rode só quando fizer sentido.

## Para contribuir

Antes de propor qualquer mudança, leia `PROJECT.md` (guia canônico de
arquitetura, modelos de dados e convenções) e `CLAUDE.md` (referência rápida
para agentes). Novas funcionalidades são propostas via workflow OpenSpec
(`openspec/`).
