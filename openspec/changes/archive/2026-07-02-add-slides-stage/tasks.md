## 1. Dependência e skill

- [x] 1.1 Adicionar `pptxgenjs` ao `package.json` (`npm install pptxgenjs`).
- [x] 1.2 Em `skills.js`, implementar `slidesSkill({ nomeCurso, aula })`: `system` instruindo extração de tópicos e resposta em JSON puro; `user` com o texto completo da aula + metadados (título, módulo, objetivos), pedindo `{"slides": [{"titulo": "string", "bullets": ["string", ...]}]}` com 6 a 10 itens, instruindo a não misturar módulos/disciplinas no mesmo slide e a não incluir notas do apresentador. Model: `MODEL_ECONOMY`.
- [x] 1.3 Exportar `slidesSkill` no `module.exports` de `skills.js`.

## 2. Construção e persistência do .pptx

- [x] 2.1 Em `server.js`, importar `PptxGenJS` de `pptxgenjs`.
- [x] 2.2 Implementar `buildPptx(config, aula, slidePlan, geradoEm)`: layout widescreen (16:9), slide de capa (título da aula + nome do curso), um slide por item de `slidePlan.slides` (título + bullets), fonte "Calibri", tamanhos ≥32pt (título) e ≥22pt (corpo), rodapé inferior esquerdo em cada slide de conteúdo com aula + curso + data + hora.
- [x] 2.3 Implementar `persistPptxStage(sess, baseName, aula, slidePlan)`: gera o buffer via `pptx.write({ outputType: 'nodebuffer' })`, grava em `courseRootDir(sess)/{baseName}.pptx`, chama `saveProject(sess, { baseName, fonte: 'ia' })`, retorna o caminho completo. Sem gravação de `.txt` em `/scr`.

## 3. Endpoint

- [x] 3.1 Criar `GET /api/slides` (SSE): valida `sess.conteudo || sess.conteudoPorAula?.length` (400 se ausente, mensagem indicando que a Etapa 5 precisa ser concluída); chama `restoreConteudoPorAula(sess)` para garantir dados atualizados; itera `sess.conteudoPorAula`, emitindo `progress` por aula, chamando `slidesSkill` (JSON mode) e `persistPptxStage` para cada uma; ao final, emite `done` com `{ arquivos: [{ baseName, titulo, path }, ...] }`; trata erros com evento `error`.

## 4. Frontend — nova Etapa 8

- [x] 4.1 Em `public/index.html`, adicionar pill `<button class="step-pill" data-step="8">8 · Slides</button>` na `stepsNav`.
- [x] 4.2 Adicionar seção `#step8` com: card de ação ("Requer a conclusão da Etapa 5", botão `#btnSlides` desabilitado) e card de resultado (`#slidesResultCard`, log-panel `#logSlides`, container de cards de arquivos `#slidesArquivos`), seguindo o padrão visual da Etapa 7.
- [x] 4.3 Em `public/app.js`, habilitar `#btnSlides` quando `state.doneSteps.has(5)` (mesmo bloco que já habilita `btnQualidade`/`btnPpc`).
- [x] 4.4 Implementar o handler de clique de `#btnSlides`: guarda de gating (`if (!state.doneSteps.has(5))`), abre um `EventSource('/api/slides')` (ou reaproveita `streamSSE` com um `onDone` customizado), tratando `progress` como log e `done` renderizando um card por arquivo gerado (rótulo = `arquivos[i].titulo`, com indicação do caminho salvo) em vez de `renderMarkdown`.

## 5. Validação

- [x] 5.1 `npm install pptxgenjs` concluído sem conflitos. Nota: `npm audit` reporta 3 vulnerabilidades (2 moderadas, 1 alta) em dependências transitivas do `pptxgenjs` (`form-data`, `js-yaml`, `uuid`) — nenhuma explorável no uso real que este projeto faz da lib (não processamos YAML nem multipart de terceiros via essas dependências); correção via `npm audit fix` fica como decisão separada do usuário, não aplicada aqui por estar fora do escopo desta task.
- [x] 5.2 `node -c server.js` e `node --check public/app.js`: sintaxe OK.
- [x] 5.3 Testado via curl contra o servidor real (sessão `/api/dev/seed`, 4 aulas): os 4 arquivos `aula0{1-4}_slides.pptx` foram gerados corretamente na pasta do projeto configurada, com `progress` por aula e `done` trazendo a lista de arquivos. Não abri literalmente no PowerPoint (sem acesso à UI do Office nesta sessão), mas validei a integridade descompactando o `.pptx` (é um zip OOXML válido) e inspecionando o XML interno diretamente (ver 5.4).
- [x] 5.4 Confirmado inspecionando o XML de um dos arquivos gerados: fonte `Calibri` em todo o texto; tamanhos `sz="3200"` (32pt, título), `sz="2400"` (24pt, corpo) e `sz="1100"` (11pt, rodapé) — dentro do especificado; rodapé com o texto exato `"{aula} · {curso} · {data} {hora}"`; dimensões do slide `12188952 x 6858000 EMU` = 13.33" x 7.5" (16:9 widescreen), confirmando o layout.
- [x] 5.5 Confirmado: após gerar os 4 slides, exportei `pesquisa` na mesma sessão (`POST /api/export/pesquisa`) e o texto continuou íntegro — nenhum dado de sessão foi alterado pela geração de slides.
- [x] 5.6 `npm test`: 33/33 passando, sem necessidade de ajustar nenhum teste existente.

**Observação para follow-up (fora do escopo desta task list, não implementada agora):** `listarArquivosDoProjeto()` (introduzida em `add-load-project-by-folder`) só reconhece `.docx`/`.txt` — arquivos `aulaNN_slides.pptx` não aparecem nos cards ao recarregar um projeto pela Etapa 0. Não é um bug (nada quebra), só uma lacuna de consistência visual que pode ser fechada depois se fizer sentido.
