## 1. Resolução e estado (backend)

- [x] 1.1 `orcamento.js`: `uso.modelosEscolhidos` (padrão `{}`; `usoDe`/`carregarUso` aceitam `uso.json` antigo sem o campo) e `modelosDisponiveis(papel)` = preços ∩ capacidades, filtrado pelas exigências do papel
- [x] 1.2 `orcamento.js`: `modeloDoPapel(sess, papel)` (escolha do usuário permitida > resolução atual); escolha inválida é ignorada com aviso no log; `modeloPara` passa a usá-la
- [x] 1.3 `orcamento.js` (`ajustar`): validar `modelos` (papel conhecido, modelo da lista, `null` remove), HTTP 400 sem alterar nada, limpar pausa, aviso de mistura quando `custoProjetoUsd > 0`
- [x] 1.4 `orcamento.js` (`estado`): `modelos` (efetivo e origem por papel), `modelosEscolhidos`, `modelosDisponiveis`, aviso de escolha inválida

## 2. Usar a função única

- [x] 2.1 `server.js`: pesquisa geral e pesquisa por módulo (`skill.model`, chave do cache e registro) via `modeloDoPapel(sess, 'pesquisa')`
- [x] 2.2 `server.js`: estimativas (`modelos: { pesquisa, economia }`) e o modelo de redação nos pontos que hoje chamam `resolverModelo` via `modeloDoPapel`
- [x] 2.3 Conferir que `chamarOpenAI`, o `geracao_log.json` e a `generation` registram o modelo efetivo

## 3. Tela

- [x] 3.1 `public/orcamento.js` e o HTML/CSS do painel: área "Modelos" com um seletor por papel ("Padrão do perfil" + permitidos), modelo efetivo, indicação "fixado por você" e aviso de mistura
- [x] 3.2 Trocar o seletor envia `POST /api/orcamento` e recarrega o estado e a estimativa; erro 400 mostra a mensagem

## 4. Testes

- [x] 4.1 Unitários (`orcamento.test.js`): lista permitida (preço ∩ capacidade ∩ exigência), validação (papel desconhecido, modelo fora da lista, `null`), persistência e restauração, `uso.json` antigo, escolha que deixou de ser permitida, degradação de perfil preserva a escolha, aviso de mistura
- [x] 4.2 Unitários (`modelos-contexto.test.js`): precedência (escolha > perfil e variáveis > padrão) por papel
- [x] 4.3 Integração com a OpenAI simulada: o modelo enviado por papel segue a escolha, a estimativa usa o preço do modelo escolhido, a chave do cache de pesquisa muda com o modelo, `POST` inválido dá 400
- [x] 4.4 `npm test`, `npm run test:coverage` acima do gate e `openspec validate --all`

## 5. Documentação

- [x] 5.1 `docs/governanca-de-custo.md`, `PROJECT.md` (capabilities e a seção de custo), `README.md`
