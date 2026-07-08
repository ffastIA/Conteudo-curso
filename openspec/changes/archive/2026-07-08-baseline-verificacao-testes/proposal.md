# Proposal: baseline-verificacao-testes

## Why

O gate de cobertura está vermelho hoje: `npm run test:coverage` sai com exit 1 (38,62% de linhas contra threshold de 40% em `jest.config.js`) — um gate que falha e não bloqueia nada é pior que nenhum. E os caminhos que o app existe para entregar têm ~0% de cobertura: export `.docx`/`.pptx`, ciclo de melhorias, carregamento de projeto. Resolve a parte mais aguda do **Gap G07** e é pré-requisito declarado para refactors futuros (split do server.js, migração do SDK OpenAI).

## What Changes

- Mock da OpenAI (`tests/__mocks__/openai.js`) estendido de forma retrocompatível: fila de respostas (`__setResponses`), `images.generate` mockado, classe `OpenAI.APIUserAbortError`, captura de options (`__lastOptions`).
- Testes de integração novos para os caminhos críticos sem cobertura: `POST /api/export/:step`, `POST /api/carregar-projeto`, caminho JSON de `planLessons` (`GET /api/plano-aula`), happy path do ciclo de melhorias.
- Testes unitários de `slugify`/helpers de caminho (caracterização).
- Gate de cobertura volta a verde com o threshold mantido em 40% (não rebaixar).
- **Nenhuma linha de produção muda** — exceção única: adicionar função já existente ao `module.exports` de `server.js` se necessário para teste.

## Non-goals

- Não rebaixar o threshold de cobertura para passar o gate.
- Não adicionar CI/GitHub Actions (o repo não tem remote GitHub; deferido).
- Não testar o frontend `public/app.js` nesta rodada.
- Não testar `mcp-server.js` (será removido pela change `remover-mcp-server`).
- Não alterar comportamento de produção em `server.js`/`skills.js`.

## Capabilities

### New Capabilities
- `test-verification-baseline`: garantias mínimas da suíte de verificação — gate de cobertura executável e verde, mock com contratos JSON/imagem/abort, cobertura dos caminhos críticos de persistência e export.

### Modified Capabilities

(vazio — nenhum requisito de comportamento do produto muda)

## Impact

- **Código**: `tests/__mocks__/openai.js`, `tests/integration/api.test.js`, `tests/integration/sse.test.js`, `tests/unit/` (arquivos novos), possivelmente `jest.config.js` (só `collectCoverageFrom`) e o `module.exports` de `server.js`.
- **Gap resolvido**: G07 (parcial — a metade mais aguda).
- **Dependências**: nenhuma nova.
- **Desbloqueia**: change `abortar-streams-desconexao` (usa `__lastOptions`/`APIUserAbortError` do mock) e os refactors futuros não selecionados (#10 split do server.js, #11 migração SDK).
- **Referência detalhada**: `plans/002-baseline-verificacao.md`.
