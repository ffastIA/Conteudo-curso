## 1. Pesquisa por módulo (server.js)

- [x] 1.1 `GET /api/pesquisa-modulos` (SSE) com consulta por módulo, cache e retomada
- [x] 1.2 Gravar `scr/pesquisa_modulos.json` e `pesquisa_modulos.docx` (persistência dupla)
- [x] 1.3 Gate da Etapa 5 + opção "gerar sem pesquisa por módulo" (`fonte: 'modelo_sem_busca'`)
- [x] 1.4 `saveProject`/`carregar-projeto` preservam `pesquisa_modulos.json`

## 2. Injeção nos prompts (skills.js)

- [x] 2.1 `pesquisaBlock(achados, fontes)` e `selecionarFontesParaAula(aula)` (usa `textSimilarity`)
- [x] 2.2 Aplicar nas 7 skills listadas, sempre com `pedagCtxBlock`
- [x] 2.3 `preRequisitos` em ementa/plano de ensino/plano de aula/conteúdo; BNCC da ementa via `pedagCtxBlock`

## 3. Citações

- [x] 3.1 Regras de citação e `### Referências da aula` em `conteudoSkill`; regra oposta em `sem_web`
- [x] 3.2 `verificarCitacoes(texto, fontes)` e registro no relatório/`geracao_log.json`
- [x] 3.3 `removerMarcadoresFonte` na montagem de slides, roteiros e vídeos; referências com URL no `.docx`

## 4. UI

- [x] 4.1 `public/app.js`/`index.html`: sub-etapa "Pesquisa por módulo" via SSE e botão de pular

## 5. Testes (última etapa)

- [x] 5.1 Pesquisa por módulo com cache/retomada; `pesquisaBlock` presente em conteúdo, plano e PPC; `[F#]` inexistente vira alerta; `sem_web` sem referências; marcadores removidos em slides
- [x] 5.2 `npm test` verde e `openspec validate --all`
