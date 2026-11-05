## 1. Contadores brutos em uso.json

- [x] 1.1 `orcamento.js`: incluir `consumo: { porEtapa: {}, porDia: {} }` em `usoVazio()` e normalizar na leitura (`uso.json` sem o campo, ou com tipo inválido, vira consumo vazio, sem mudar `versao`)
- [x] 1.2 `orcamento.js`: em `contabilizar`, somar `chamadas`, `tokensEntrada`, `tokensEntradaEmCache` (via `tokensEmCache(usage)`), `tokensSaida` e `buscasWeb` em `consumo.porEtapa[etapa][modelo]` e `consumo.porDia[dia][modelo]`; `depois` repassa `buscasWeb`
- [x] 1.3 `server.js` (`registrar` em `chamarOpenAI`): passar `buscasWeb` (contagem de `web_search_call`) de `registrar({...})` da Responses até `governanca.depois`
- [x] 1.4 `orcamento.js`: expor em `estado()` ou numa função própria (`consumoDe(sess)`) uma cópia somente leitura de `consumo` e de `uso.modelos` para o cálculo

## 2. Cálculo do valor pela tabela de preços

- [x] 2.1 `custo.js`: função `valorDoConsumo(contadores, modelo, precos)` que monta o `usage` e chama `calcularCusto` (`observabilidade.js`), soma `buscasWeb × tarifaBuscaWeb()` e, com `buscaWebBlocoTokensMiniSomar` ligado, o bloco de `custoBlocoBuscaMini`; devolve `null` para modelo sem preço
- [x] 2.2 `custo.js`: função `relatorioDeConsumo(consumo, registrado, precos)` que agrega por modelo (soma das etapas), por etapa e por dia, calcula `totalUsd`, `registradoUsd`, `diferencaUsd`, `divergente` (1% ou US$ 0,0001), `parcial`, `naoDetalhadoUsd` e `semPreco`, e exporta as duas funções

## 3. Rota GET /api/consumo

- [x] 3.1 `server.js`: rota `GET /api/consumo` no mesmo padrão de `/api/orcamento` (sessão, `governanca`), devolvendo `moeda`, `vigenciaPrecos`, `modelos[]` (com `tarifa`), `buscaWeb`, `porEtapa`, `porDia`, totais, conciliação e avisos; sem projeto devolve consumo vazio
- [x] 3.2 Garantir que `GET /api/tokens` e `GET /api/orcamento` mantêm o formato atual

## 4. Interface

- [x] 4.1 `public/orcamento.js`: seção "Consumo do projeto" em `renderPainelOrcamento` (tabela por modelo, linha da busca web, total, quebras por etapa e por dia, avisos de divergência, parcial e sem preço), buscando `/api/consumo` com `orcFetch` e escapando texto com `orcEsc`
- [x] 4.2 `public/orcamento.js`: atualizar a seção nos mesmos pontos que já chamam `atualizarOrcamento()` (abertura do painel e fim de etapa)
- [x] 4.3 `public/app.js` e `public/index.html`: contador do cabeçalho exibe `· US$ X,XX` ao lado dos tokens quando houver `totalUsd`; mantém só os tokens sem projeto
- [x] 4.4 `public/style.css`: estilos da tabela de consumo e dos avisos, no padrão de `.orcamento-tabela`
- [x] 4.5 Mensagens e rótulos em português, números no formato `pt-BR`; arquivos de `public/*` mantêm o fim de linha CRLF

## 5. Documentação

- [x] 5.1 `docs/governanca-de-custo.md`: seção "Consumo do projeto" (campos, fórmula, conciliação, projetos antigos "parciais") e a rota `GET /api/consumo`
- [x] 5.2 `README.md` e `PROJECT.md`: citar a rota e o painel de consumo, atualizar a contagem de capabilities e de testes ao final

## 6. Testes

- [x] 6.1 `tests/unit/custo-consumo.test.js`: `valorDoConsumo` e `relatorioDeConsumo` (exemplo de US$ 0,3125 da spec, tokens em cache sem tarifa própria, modelo sem preço, busca web, bloco mini ligado e desligado, divergência, parcial)
- [x] 6.2 `tests/unit/orcamento.test.js`: `contabilizar` grava `consumo` por etapa e dia, `uso.json` antigo sem `consumo` abre, gravação atômica preservada
- [x] 6.3 `tests/integration/consumo-de-tokens.test.js` (OpenAI simulada): rodar uma pesquisa e uma etapa de conteúdo, conferir `GET /api/consumo` (tokens, cache, busca web, soma das etapas = total, conciliação) e que `/api/tokens` e `/api/orcamento` não mudaram
- [x] 6.4 `npm test`, `npm run test:coverage` e `openspec validate --all` verdes
- [ ] 6.5 Conferir no navegador o painel 💲 (seção "Consumo do projeto") e o contador do cabeçalho com o servidor reiniciado
