# Tasks: propagar-nivel-conteudo

## 1. Diretrizes pedagógicas por nível

- [x] 1.1 Revisar/aprovar a minuta das diretrizes dos 3 níveis (variantes `geral` e `pesquisa`) em `diretrizes-nivel.md` (neste diretório)
- [x] 1.2 Criar `const NIVEL_DIRETRIZES` + helper `nivelBlock(nivel, tipo = 'geral')` em `skills.js`, com normalização de caixa/acentos e fallback vazio (exportar para testes)

## 2. Injeção nas skills que já recebem o nível

- [x] 2.1 Concatenar `nivelBlock(nivel)` no prompt `user` de `metodologiaSkill`, `ementaSkill`, `planoEnsinoSkill`, `planLessonsSkill`, `planoAulaSkill`, `conteudoSkill`, `estiloVisualSkill` (sem mudança de assinatura nem de `server.js`)
- [x] 2.2 Em `pesquisaWebSkill` e `pesquisaFallbackSkill`, injetar também `nivelBlock(nivel, 'pesquisa')`
- [x] 2.3 Declarar no `system` de `ementaSkill`, `planoEnsinoSkill`, `planoAulaSkill` e `conteudoSkill` que o nível configurado tem PESO ALTO na definição de profundidade, vocabulário e complexidade (subordinado apenas à Metodologia Pedagógica)
- [x] 2.4 Instruir `ementaSkill`, `planoEnsinoSkill` e `planoAulaSkill` a exibir `Nível: {nivel}` no cabeçalho de identificação do documento gerado (linha omitida se nível ausente; coordenar com o cabeçalho de modalidade do change `propagar-modalidade-curso`)

## 3. Fechar as lacunas (skills sem nível)

- [x] 3.1 Adicionar parâmetro `nivel` + injeção em `slidesSkill` (`skills.js:134-163`) e passar `sess.config.nivel` no call site `server.js:663`
- [x] 3.2 Adicionar seção obrigatória "Adequação ao Nível Declarado ({config.nivel})" em `revisaoQualidadeSkill` (`skills.js:275-326`), ao lado da seção de faixa etária
- [x] 3.3 Injetar `nivelBlock(config?.nivel)` em `aplicarMelhoriasSkill` (`skills.js:329-354`)

## 4. Testes

- [x] 4.1 `tests/unit/skills.test.js`: para cada skill, assert de que o bloco do nível correto aparece no prompt (3 níveis + fallback sem nível); revisar asserts existentes que quebrarem
- [x] 4.2 Teste garantindo que o contexto BNCC (`ef1/ef2/em/competencias`) permanece intacto e não é confundido com o nível de conteúdo

## 5. Validação e documentação

- [ ] 5.1 Validação manual E2E: gerar o mesmo curso em `Básico` e `Avançado` e comparar ementa, plano de ensino, conteúdo e resultados de pesquisa, conferindo `Nível:` no cabeçalho dos documentos
- [x] 5.2 Atualizar `specs.yaml` (documentar as diretrizes de nível) e `PROJECT.md`
