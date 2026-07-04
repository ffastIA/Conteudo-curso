# Tasks: propagar-modalidade-curso

## 1. Diretrizes de modalidade

- [x] 1.1 Revisar/aprovar a minuta das diretrizes das 3 modalidades em `diretrizes-modalidade.md` (neste diretório)
- [x] 1.2 Criar `const MODALIDADE_DIRETRIZES` em `skills.js` a partir da minuta aprovada, com lookup tolerante a caixa/acentuação e fallback vazio para valor ausente/desconhecido (exportar para testes)

## 1b. Campos condicionais por modalidade (Etapa 1)

- [x] 1b.1 Adicionar campos texto opcionais `distribuicaoHibrida` (visível se `modalidade = "híbrido"`) e `cargaSincronaPorAula` (visível se `modalidade = "EaD"`) em `public/index.html` (Etapa 1), com exibição condicionada via listener no select de modalidade em `public/app.js`
- [x] 1b.2 Incluir os dois campos no payload do `POST /api/config` (`public/app.js:~322`) e na restauração do formulário ao carregar projeto (`public/app.js:~915`)
- [x] 1b.3 Injetar distribuição híbrida e carga síncrona no bloco de modalidade (via `buildPedagogicalContext`/`pedagCtxBlock`) com instrução de respeito rigoroso quando preenchidas

## 2. Metodologia ciente da modalidade (raiz do problema)

- [x] 2.1 Adicionar `modalidade` à assinatura e ao prompt de `metodologiaSkill` (`skills.js:358-381`), com instrução de compatibilidade obrigatória com a modalidade
- [x] 2.2 Passar `sess.config.modalidade` na chamada em `server.js:415-417`

## 3. Injeção centralizada no contexto pedagógico

- [x] 3.1 Estender `pedagCtxBlock(metodologia, bnccContext, modalidade)` (`skills.js:20-25`) para prefixar o bloco `## Modalidade do Curso` + diretrizes + precedência
- [x] 3.2 Alterar `buildPedagogicalContext(sess)` (`server.js:102-114`) para incluir a modalidade de `sess.config.modalidade` e aplicar o fallback de disco da metodologia (`sess.metodologia || readMemory(sess, 'metodologia')`)
- [x] 3.3 Adicionar `modalidade` (parâmetro + linha `Modalidade: X` no prompt) a `ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `pesquisaWebSkill`, `pesquisaFallbackSkill`, `revisaoQualidadeSkill`, `aplicarMelhoriasSkill` em `skills.js`
- [x] 3.4 Atualizar os call sites em `server.js` para passar `modalidade: sess.config.modalidade` (linhas ~417, 445, 790, 812, 887, 974, 1017, 1178, 1771, 1977)
- [x] 3.5 Instruir `ementaSkill`, `planoEnsinoSkill` e `planoAulaSkill` a iniciar o documento com cabeçalho de identificação (curso, carga horária, modalidade; linha omitida se modalidade ausente) — na ementa, o cabeçalho precede os 2 parágrafos exigidos

## 4. Fallback de metodologia em disco (robustez)

- [x] 4.1 Aplicar `sess.metodologia || readMemory(sess, 'metodologia')` nos usos diretos em `server.js` (linhas ~790, 812, 889, 977, 1181, 1771, 1977 e 491, 568 para qualidade/PPC)

## 5. Testes

- [x] 5.1 `tests/unit/skills.test.js`: asserts de que cada skill inclui `Modalidade` e as diretrizes no prompt (3 modalidades + fallback sem modalidade); revisar asserts existentes de substring que quebrarem
- [x] 5.2 Teste de integração: metodologia reimportada + sessão restaurada → prompt das etapas seguintes contém o texto editado
- [x] 5.3 Teste de integração: sessão vazia com `scr/metodologia.txt` presente → geração usa a metodologia do disco

## 6. Validação e documentação

- [ ] 6.1 Validação manual: gerar o mesmo curso nas 3 modalidades (híbrido com e sem distribuição preenchida; EaD com e sem carga síncrona por aula) e comparar ementa, plano de ensino, plano de aula e conteúdo, conferindo o cabeçalho de identificação com a modalidade em cada documento e a janela síncrona reservada nos planos de aula EaD
- [ ] 6.2 Validação manual: fluxo editar metodologia .docx → reimportar → gerar plano de ensino → confirmar que o texto editado aparece no resultado
- [x] 6.3 Atualizar `PROJECT.md` e `specs.yaml` (documentar diretrizes de modalidade e fallback)
