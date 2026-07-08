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
   carga horária, duração da aula, nível, modalidade, objetivos) e geração
   da ementa.
2. **Pesquisa web** — usa `gpt-4o-search-preview` (busca nativa) para
   levantar tópicos, ferramentas, tendências e referências atuais.
3. **Plano de ensino** — gerado com `gpt-4o-mini`, usando o contexto da
   pesquisa.
4. **Plano de aulas** — gerado com `gpt-4o-mini`, usando o contexto das
   etapas anteriores.
5. **Conteúdo detalhado da aula** — gerado com `gpt-4o-mini`, usando todo o
   contexto acumulado.
6. **Revisão de qualidade + ciclo de melhorias** — auditoria cross-document
   do conteúdo, com aplicação de melhorias por seção a partir de anotações
   do revisor.
7. **Qualidade pedagógica + PPC** — relatório técnico-pedagógico e Projeto
   Pedagógico de Curso.
8. **Slides** — geração de slides (`.pptx`) por aula, com opção de imagens
   ilustrativas por estilo visual.

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

> A chave da API é lida apenas no backend (via `dotenv`) e nunca é exposta
> ao frontend.

## Estrutura de pastas

```
/
├── server.js          — Express + endpoints REST/SSE + DOCX/PPTX builder + persistência
├── skills.js           — skills de prompt ({model, system, user})
├── bncc-data.js         — competências/habilidades BNCC (EF1, EF2, EM)
├── package.json
├── .env.example
├── PROJECT.md           — guia canônico de arquitetura e convenções
├── specs.yaml           — specs canônicas (modelos de dados, endpoints, pipeline)
├── openspec/            — configuração e changes do OpenSpec
├── public/
│   ├── index.html        — Frontend HTML (Etapas 0–8, formulários, log panels)
│   ├── app.js             — Frontend JS (SSE streaming, BNCC UI, navegação entre etapas)
│   └── style.css
├── tests/               — testes unitários e de integração (Jest + Supertest)
└── saídas/              — arquivos gerados por curso ({curso-slug}/*.txt, *.docx, *.pptx)
```

## Endpoints

| Método | Rota                              | Descrição                                            |
|--------|------------------------------------|-------------------------------------------------------|
| GET    | `/api/bncc`                        | Lista competências BNCC por nível                     |
| POST   | `/api/bncc/selecionar`             | Salva seleção BNCC na sessão                          |
| POST   | `/api/bncc/pular`                  | Pula alinhamento BNCC                                 |
| GET    | `/api/metodologia`                 | Deriva metodologia pedagógica                         |
| POST   | `/api/metodologia/confirmar`       | Confirma metodologia (e gera ementa pendente)         |
| GET    | `/api/qualidade`                   | SSE — relatório técnico-pedagógico                    |
| GET    | `/api/ppc`                         | SSE — monta o PPC completo                            |
| GET    | `/api/estilos-visuais`             | Lista estilos visuais para os slides                  |
| POST   | `/api/estilos-visuais/selecionar`  | Seleciona o estilo visual                             |
| GET    | `/api/slides`                      | SSE — gera slides `.pptx` (com imagens)               |
| GET    | `/api/escolher-pasta`              | Abre o seletor nativo de pasta (Windows)               |
| POST   | `/api/config`                      | Configuração do curso + geração da ementa             |
| GET    | `/api/search`                      | SSE — pesquisa web (`gpt-4o-search-preview`)          |
| GET    | `/api/plano-ensino`                | SSE — gera plano de ensino                             |
| GET    | `/api/plano-aula`                  | SSE — gera plano de aulas                              |
| GET    | `/api/conteudo`                    | SSE — gera conteúdo técnico por aula                  |
| GET    | `/api/tokens`                      | Contadores de tokens consumidos                        |
| POST   | `/api/carregar-projeto`            | Restaura um projeto salvo a partir do disco           |
| POST   | `/api/importar`                    | Detecta a etapa de um `.docx` enviado pelo usuário    |
| POST   | `/api/importar/confirmar`          | Sobrescreve uma etapa com a versão editada pelo usuário|
| POST   | `/api/export/:step`                | Gera e salva o `.docx` da etapa                        |
| GET    | `/api/revisao-qualidade`           | SSE — revisão de qualidade por aula                    |
| POST   | `/api/aplicar-melhorias`           | Upload do `.docx` anotado com melhorias                |
| GET    | `/api/aplicar-melhorias/confirmar` | SSE — aplica o ciclo de melhorias                      |
| POST   | `/api/finalizar-conteudo`          | Consolida o conteúdo final da Etapa 6                  |

## Observações técnicas

- Estado da sessão mantido em memória, identificado por cookie `sessionId`
  (HttpOnly), com restauração a partir do disco via `/api/carregar-projeto`.
- Cada etapa que gera conteúdo persiste em disco tanto o texto (`.txt`,
  memória para as próximas etapas) quanto o entregável (`.docx`/`.pptx`),
  em `saídas/{curso-slug}/`.
- Modelos de IA em uso: `gpt-4o-mini` para as skills de geração (ementa,
  planos, conteúdo, qualidade, PPC) e `gpt-4o-search-preview` para pesquisa
  web e o ciclo de melhorias.
- Eventos SSE seguem o formato `{"type": "...", ...}` com tipos `progress`,
  `site`, `token`, `done`, `warning` e `error`.

## Para contribuir

Antes de propor qualquer mudança, leia `PROJECT.md` (guia canônico de
arquitetura, modelos de dados e convenções) e `CLAUDE.md` (referência rápida
para agentes). Novas funcionalidades são propostas via workflow OpenSpec
(`openspec/`).
