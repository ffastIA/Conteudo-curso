## 1. Dependências e Modelos de Dados

- [x] 1.1 Instalar `mammoth` e `multer` via `npm install mammoth multer --save` e verificar adição ao `package.json`
- [x] 1.2 Ampliar o modelo `Session` em `server.js`: adicionar campos `revisaoQualidade` (string, nullable) e `conteudoFinal` (string, nullable)
- [x] 1.3 Atualizar `specs.yaml`: adicionar novos campos da Session, documentar novos endpoints e remover endpoints/skills descontinuados

## 2. Remoção da Deduplicação e Expansão (server.js + skills.js)

- [x] 2.1 Em `server.js`, remover do handler `GET /api/conteudo`: a lógica de cálculo Jaccard (`textSimilarity`), a chamada a `conteudoRegenSkill` e a chamada a `revisaoCoerenciaSkill` ao final do stream
- [x] 2.2 Em `server.js`, remover o handler completo de `GET /api/expandir` e os endpoints auxiliares `POST /api/pasta-expandir`
- [x] 2.3 Em `skills.js`, remover as funções `conteudoRegenSkill`, `revisaoCoerenciaSkill`, `expansaoConteudoSkill` e `aplicarSugestoesSkill`
- [x] 2.4 Verificar que a função `textSimilarity` é mantida em `server.js` — ela será reutilizada pela nova `revisaoQualidadeSkill`

## 3. Nova Skill: revisaoQualidadeSkill (skills.js)

- [x] 3.1 Criar `revisaoQualidadeSkill` em `skills.js` com `model: MODEL_ECONOMY`; persona de revisor pedagógico sênior; recebe `{ config, ementa, planoEnsino, planoAulaTexto, aulaIndex, aulaTitulo, aulaObjetivos, aulaConteudo, sobreposicoes, metodologia, bnccContext }` e gera análise estruturada da aula com seções: Compatibilidade com Plano de Aula, Compatibilidade com Plano de Ensino e Ementa, Sobreposições Detectadas (passadas como parâmetro), Alinhamento BNCC (omitida se `bnccContext` vazio), Deficiências e Melhorias Sugeridas, Observações do Revisor (seção em branco)
- [x] 3.2 Adicionar `revisaoQualidadeSkill` às exportações de `skills.js`

## 4. Nova Skill: aplicarMelhoriasSkill (skills.js)

- [x] 4.1 Criar `aplicarMelhoriasSkill` em `skills.js` com `model: MODEL_RESEARCH` (`gpt-4o-search-preview`) e `web_search_options: { search_context_size: 'medium' }`; persona de especialista no domínio técnico do curso; recebe `{ config, aulaIndex, aulaTitulo, aulaObjetivos, conteudoAtual, observacoesRevisor, metodologia, bnccContext }` e gera conteúdo revisado da aula aplicando as observações e buscando referências web quando necessário
- [x] 4.2 Adicionar `aplicarMelhoriasSkill` às exportações de `skills.js`

## 5. Endpoint GET /api/revisao-qualidade (server.js)

- [x] 5.1 Criar handler `GET /api/revisao-qualidade` em `server.js` com `sseHeaders`; validar pré-condição (sessão com `conteudoPorAula` preenchido); emitir `progress` inicial
- [x] 5.2 Calcular matriz de similaridade Jaccard entre todas as aulas usando `textSimilarity`; montar por aula a lista de sobreposições ≥ 55% com o par e o percentual
- [x] 5.3 Para cada aula em `sess.conteudoPorAula`: chamar `revisaoQualidadeSkill` via `streamSkillToClient`; acumular resultado no relatório completo
- [x] 5.4 Ao final: chamar `persistStage(sess, 'revisao_qualidade', 'Revisão de Qualidade', textoCompleto)`; popular `sess.revisaoQualidade`; emitir `done`

## 6. Endpoint POST /api/export/revisao-qualidade (server.js)

- [x] 6.1 Adicionar case `'revisao-qualidade'` no handler `POST /api/export/:step` em `server.js`: recupera `sess.revisaoQualidade` e chama `buildDocx(config, 'Revisão de Qualidade', texto, [])` para gerar e entregar o `.docx`

## 7. Endpoint POST /api/aplicar-melhorias (server.js)

- [x] 7.1 Configurar `multer` em modo `memoryStorage` em `server.js`; criar handler `POST /api/aplicar-melhorias` com middleware `upload.single('arquivo')`; validar que o arquivo existe e tem extensão `.docx`
- [x] 7.2 Extrair texto do buffer `.docx` com `mammoth.extractRawText({ buffer: req.file.buffer })`; identificar blocos "Observações do Revisor" por aula usando split nos headings de aula; retornar JSON `{ ok: true, aulas: [{ titulo, observacoes }] }` para o frontend exibir o resumo antes da confirmação
- [x] 7.3 Criar handler `GET /api/aplicar-melhorias/confirmar` em `server.js` com `sseHeaders`; para cada aula de `sess.conteudoPorAula` chamar `aplicarMelhoriasSkill` via `streamSkillToClient` passando as observações do revisor extraídas; acumular conteúdo revisado
- [x] 7.4 Ao final do stream de confirmação: atualizar `sess.conteudoPorAula` com os textos revisados; atualizar `sess.conteudo` com o consolidado; chamar `persistStage` para cada aula (`aula{NN}_conteudo.txt/docx`) e para o consolidado (`conteudo.txt/docx`); emitir `done`

## 8. Endpoint POST /api/finalizar-conteudo (server.js)

- [x] 8.1 Criar handler `POST /api/finalizar-conteudo` em `server.js` (REST, não SSE); recuperar conteúdo de `sess.conteudo` ou ler `conteudo.txt` do disco se sessão perdida; popular `sess.conteudoFinal`
- [x] 8.2 Gerar `conteudo_final.docx` com `buildDocx(config, 'Conteúdo Final do Curso', texto, [])`; gravar `saídas/{slug}/conteudo_final.txt` e `conteudo_final.docx`; retornar `{ ok: true, path }` ou entregar download direto

## 9. Frontend — Etapa 5★ Revisão de Qualidade (index.html + app.js)

- [x] 9.1 Adicionar seção "Etapa 5★ — Revisão de Qualidade" em `public/index.html` após a seção da Etapa 5 (conteúdo): botão "Gerar Revisão de Qualidade", log panel SSE, área de resultado, botão "Baixar Revisão (.docx)"
- [x] 9.2 Implementar em `public/app.js` handler SSE para `GET /api/revisao-qualidade`: eventos `progress`, `token`, `done`, `error`; ao `done` habilitar botão de download
- [x] 9.3 Implementar em `public/app.js` função de download que chama `POST /api/export/revisao-qualidade`
- [x] 9.4 Adicionar estilos para a seção Etapa 5★ em `public/style.css` (consistente com o design card-based existente)

## 10. Frontend — Etapa 6 Aplicar Melhorias (index.html + app.js)

- [x] 10.1 Remover a seção da Etapa 6 (Expansão) de `public/index.html`
- [x] 10.2 Adicionar seção "Etapa 6 — Aplicar Melhorias" em `public/index.html`: campo de upload de arquivo `.docx` (`<input type="file" accept=".docx">`), área de resumo das observações detectadas, botão "Aplicar Melhorias" (desabilitado até upload), log panel SSE, botão "Conteúdo Concluído"
- [x] 10.3 Implementar em `public/app.js` a função de upload: `fetch POST /api/aplicar-melhorias` com `FormData`; exibir resumo das aulas com observações retornado pelo servidor; habilitar botão "Aplicar Melhorias"
- [x] 10.4 Implementar em `public/app.js` handler SSE para `GET /api/aplicar-melhorias/confirmar`: eventos `progress`, `token`, `done`, `error`; ao `done` habilitar botão "Gerar Nova Revisão" e "Conteúdo Concluído"
- [x] 10.5 Implementar em `public/app.js` função do botão "Conteúdo Concluído": chama `POST /api/finalizar-conteudo`; exibe confirmação e link de download do `conteudo_final.docx`
- [x] 10.6 Remover de `public/app.js` a lógica da antiga Etapa 6 (pasta de expansão, validação e SSE de `/api/expandir`)

## 11. Testes Manuais

- [ ] 11.1 Testar fluxo completo sem BNCC: Etapas 0–5 → Etapa 5★ (geração do relatório) → download do `.docx` → editar o arquivo → Etapa 6 (upload + aplicar) → Etapa 5★ novamente (segundo ciclo) → "Conteúdo Concluído" → `conteudo_final.docx`
- [ ] 11.2 Testar fluxo completo com BNCC ativo: verificar que o relatório da Etapa 5★ inclui seção "Alinhamento BNCC" com análise por competência/habilidade selecionada
- [ ] 11.3 Testar upload de `.docx` sem observações preenchidas: verificar que o sistema avisa e ainda oferece aplicar sugestões automáticas
- [ ] 11.4 Testar upload de arquivo inválido (não `.docx`): verificar erro 400 e mensagem adequada no frontend
- [ ] 11.5 Verificar que o endpoint `/api/conteudo` não executa mais Jaccard nem `revisaoCoerenciaSkill` (ausência de logs e de arquivo `revisao_coerencia.txt` após Etapa 5)
- [ ] 11.6 Verificar que o endpoint `/api/expandir` retorna 404 após remoção
