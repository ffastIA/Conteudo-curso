## 1. Dados BNCC Estáticos

- [x] 1.1 Criar `bncc-data.js` com as competências gerais C2 e C5 (id, titulo, descricao)
- [x] 1.2 Adicionar a `bncc-data.js` as habilidades de letramento digital e cultura digital do EF1 (id, codigo, descricao)
- [x] 1.3 Adicionar a `bncc-data.js` as habilidades de letramento digital e cultura digital do EF2 (id, codigo, descricao)
- [x] 1.4 Adicionar a `bncc-data.js` as habilidades de letramento digital e cultura digital do Ensino Médio (id, codigo, descricao)
- [x] 1.5 Importar `bncc-data.js` em `server.js` e validar carregamento na inicialização com `console.log`

## 2. Modelo de Dados — Session e CourseConfig

- [x] 2.1 Ampliar o modelo `Session` em `server.js`: adicionar campos `bncc` (`{ ativo, publico, nivel, itens }`) e `metodologia` (string)
- [x] 2.2 Ampliar o modelo `CourseConfig` em `server.js`: adicionar campos `modalidade` (enum), `preRequisitos` (string opcional) e `proporcaoTeoricoPratico` (string)

## 3. Endpoints BNCC no servidor

- [x] 3.1 Criar `GET /api/bncc` em `server.js`: aceita query params `nivel` (ef1/ef2/em) ou `tipo=competencias` e retorna JSON do objeto em memória sem chamada à OpenAI
- [x] 3.2 Criar `POST /api/bncc/selecionar` em `server.js`: recebe `{ publico, nivel, itens }`, valida e persiste em `session.bncc`

## 4. Endpoint de Metodologia Pedagógica

- [x] 4.1 Criar `metodologiaSkill` em `skills.js`: prompt com persona de especialista pedagógico, recebe perfil do curso (nome, publico, nivel, carga, proporcaoTeoricoPratico) e retorna metodologia recomendada com justificativa
- [x] 4.2 Criar `GET /api/metodologia` em `server.js`: chama `metodologiaSkill`, persiste resultado em `session.metodologia` e retorna JSON `{ metodologia: string }`

## 5. Etapa 0 no Frontend

- [x] 5.1 Adicionar seção "Etapa 0 — Base Pedagógica" em `public/index.html` antes da Etapa 1, com pergunta de alinhamento BNCC (Sim/Não)
- [x] 5.2 Implementar em `public/app.js` a lógica de bifurcação: Sim → pergunta Ed. Básica ou adultos; Não → ir direto para metodologia
- [x] 5.3 Implementar em `public/app.js` o caminho Ed. Básica: seletor de nível (EF1/EF2/EM) → chamada `GET /api/bncc?nivel=X` → renderização de checkboxes multi-seleção
- [x] 5.4 Implementar em `public/app.js` o caminho adultos/profissionais: chamada `GET /api/bncc?tipo=competencias` → renderização de checkboxes C2 e C5
- [x] 5.5 Implementar em `public/app.js` submissão da seleção via `POST /api/bncc/selecionar` com validação (ao menos um item selecionado)
- [x] 5.6 Implementar em `public/app.js` chamada a `GET /api/metodologia` após confirmação BNCC, exibir resultado com botão "Confirmar" e "Gerar novamente"
- [x] 5.7 Adicionar estilo CSS em `public/style.css` para a Etapa 0 (pills, checkboxes, cards de metodologia)

## 6. Etapa 1 — Novos Campos no Formulário

- [x] 6.1 Adicionar campos `modalidade` (select), `preRequisitos` (textarea) e `proporcaoTeoricoPratico` (input text) em `public/index.html` no formulário da Etapa 1
- [x] 6.2 Atualizar em `public/app.js` a função de coleta e submissão do formulário da Etapa 1 para incluir os três novos campos
- [x] 6.3 Atualizar validação de `POST /api/config` em `server.js` para exigir `modalidade` e `proporcaoTeoricoPratico` e aceitar `preRequisitos` como opcional

## 7. Injeção de Contexto Pedagógico nas Skills Existentes

- [x] 7.1 Criar helper `buildPedagogicalContext(session)` em `server.js`: retorna string formatada com bloco `## Contexto Pedagógico` combinando metodologia e itens BNCC selecionados (ou string vazia se ambos ausentes)
- [x] 7.2 Atualizar `ementaSkill` em `skills.js`: aceitar parâmetros opcionais `metodologia` e `bnccContext` e incluí-los no prompt quando presentes
- [x] 7.3 Atualizar `planoEnsinoSkill` em `skills.js`: adicionar parâmetros opcionais `metodologia`, `bnccContext` e `proporcaoTeoricoPratico` ao prompt
- [x] 7.4 Atualizar `planoAulaSkill` em `skills.js`: adicionar parâmetros opcionais `metodologia`, `bnccContext` e `proporcaoTeoricoPratico` ao prompt
- [x] 7.5 Atualizar `conteudoSkill` em `skills.js`: adicionar parâmetros opcionais `metodologia`, `bnccContext` e `proporcaoTeoricoPratico` ao prompt
- [x] 7.6 Atualizar `expansaoConteudoSkill` em `skills.js`: adicionar parâmetros opcionais `metodologia` e `bnccContext` ao prompt
- [x] 7.7 Atualizar os handlers dos endpoints existentes em `server.js` (Etapas 2–6) para passar `buildPedagogicalContext(session)` às skills

## 8. Agente de Qualidade Pedagógica

- [x] 8.1 Criar `qualidadeSkill` em `skills.js`: prompt com persona de especialista em design instrucional, seções fixas do Relatório Técnico-Pedagógico, truncagem de conteúdo a 1.500 chars por aula
- [x] 8.2 Criar `GET /api/qualidade` em `server.js`: valida pré-condições (Etapa 5 concluída), monta contexto completo (todos os artefatos da sessão + bncc + metodologia), chama `qualidadeSkill` via SSE
- [x] 8.3 Persistir resultado em `saídas/{course-slug}/relatorio_qualidade.txt` ao fim do stream
- [x] 8.4 Criar `buildDocxRelatorio()` em `server.js` ou arquivo dedicado: gera `.docx` com seções numeradas, capa e formatação padrão do sistema
- [x] 8.5 Adicionar `POST /api/export/qualidade` em `server.js` usando `buildDocxRelatorio()`
- [x] 8.6 Adicionar seção "Agente de Qualidade" em `public/index.html` após Etapa 5/6 com botão, log SSE e área de resultado
- [x] 8.7 Implementar em `public/app.js` handler SSE para `/api/qualidade` e botão de export do relatório

## 9. Exportação PPC

- [x] 9.1 Criar `perfilEgressoSkill` em `skills.js`: gera perfil do egresso a partir de `config`, `ementa` e `planoEnsino`
- [x] 9.2 Criar `competenciasSkill` em `skills.js`: gera lista de competências e habilidades do curso, incorporando itens BNCC selecionados quando ativos
- [x] 9.3 Criar `perfilDocenteSkill` em `skills.js`: gera perfil de formação e experiência recomendados para o professor
- [x] 9.4 Criar `infraestruturaSkill` em `skills.js`: gera lista de recursos, equipamentos e ambiente necessários
- [x] 9.5 Criar `ppcAssemblySkill` em `skills.js`: monta estrutura completa do PPC organizando todos os artefatos nas 13 seções definidas
- [x] 9.6 Criar `GET /api/ppc` em `server.js`: executa as 4 skills complementares sequencialmente (com progress SSE) e depois `ppcAssemblySkill`
- [x] 9.7 Criar `buildDocxPPC()` em `server.js`: gera `.docx` com estrutura formal de PPC (capa, sumário, seções numeradas)
- [x] 9.8 Adicionar `POST /api/export/ppc` em `server.js`
- [x] 9.9 Adicionar botão "Gerar PPC Completo" em `public/index.html` visível após conclusão da Etapa 5, com log SSE e botão de export
- [x] 9.10 Implementar em `public/app.js` lógica de habilitação do botão PPC (requer Etapa 5 concluída) e handler SSE

## 10. Atualização do MCP Server

- [x] 10.1 Expor `metodologiaSkill` como tool MCP em `mcp-server.js`
- [x] 10.2 Expor `qualidadeSkill` como tool MCP em `mcp-server.js`
- [x] 10.3 Expor `perfilEgressoSkill`, `competenciasSkill`, `perfilDocenteSkill`, `infraestruturaSkill` e `ppcAssemblySkill` como tools MCP em `mcp-server.js`

## 11. Testes Manuais

- [ ] 11.1 Testar fluxo completo com BNCC ativo (Ed. Básica, EF2): Etapa 0 → seleção de habilidades → metodologia → Etapas 1–5 → Agente de Qualidade → PPC
- [ ] 11.2 Testar fluxo completo com BNCC ativo (adultos): C2 + C5 → metodologia → Etapas 1–5 → Agente de Qualidade → PPC
- [ ] 11.3 Testar fluxo sem BNCC: Etapa 0 (Não) → metodologia → Etapas 1–5 → Agente de Qualidade
- [ ] 11.4 Verificar que as Etapas 2–6 funcionam sem regressão quando `session.bncc.ativo === false` e `session.metodologia` está vazia
- [ ] 11.5 Verificar exportação `.docx` de relatório de qualidade e PPC com conteúdo correto e formatação adequada
