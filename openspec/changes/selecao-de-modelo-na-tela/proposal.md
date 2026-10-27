## Why

Hoje o modelo de cada chamada à OpenAI sai de três lugares que o usuário não controla pela tela: os padrões do código (`config/modelos.js`), as variáveis `OPENAI_*_MODEL` do `.env` e o perfil de custo (`modeloRedacao`, `modeloPesquisa`). Para trocar o modelo de um papel é preciso editar `.env` ou `config/perfis-custo.json` e, no caso do `.env`, reiniciar o servidor. A medição de 2026-10-26 mostrou que a escolha do modelo é a maior alavanca de custo (a pesquisa com `gpt-4o-mini` custa 81% menos que com `gpt-4o`), então o usuário deve poder decidir isso por projeto, com o custo estimado à vista.

## What Changes

- **Seleção por papel na tela:** o painel de orçamento (💲) ganha uma área "Modelos" com um seletor para cada papel de `config/modelos.js` (pesquisa, resumos, redação, avaliação, juiz). Cada seletor tem a opção "Padrão do perfil" (sem escolha do usuário) e os modelos permitidos para aquele papel.
- **Escolha guardada por projeto:** o modelo escolhido fica em `scr/uso.json` (`modelosEscolhidos`), junto do perfil, e é restaurado ao carregar ou importar o projeto.
- **Precedência única:** a escolha do usuário vale mais que tudo; sem ela, a resolução atual continua igual (perfil e variáveis `OPENAI_*_MODEL`, como já funcionam). Uma função (`modeloDoPapel`) resolve o modelo e é usada pela chamada real, pela estimativa, pela chave do cache de pesquisa e pelo painel, para que a tela, a estimativa e o gasto nunca divirjam.
- **Lista permitida:** só aparecem modelos que têm preço em `config/precos-modelos.json` e capacidade em `config/modelos-capacidades.json` e que cumprem a exigência do papel (a pesquisa exige busca web). Hoje: `gpt-4o` e `gpt-4o-mini`. O servidor valida a escolha contra essa lista e recusa qualquer outro valor com HTTP 400.
- **API:** `GET /api/orcamento` devolve `modelosEscolhidos` e `modelosDisponiveis` por papel; `POST /api/orcamento` aceita `modelos` (papel → modelo ou `null` para voltar ao padrão do perfil).
- **Degradação de perfil:** a descida automática de perfil não desfaz a escolha do usuário; o painel indica que o modelo está fixado pelo usuário.
- **Aviso de mistura:** ao trocar o modelo de um papel depois que o projeto já gerou conteúdo, o painel avisa que as aulas anteriores usaram outro modelo (o `geracao_log.json` já registra o modelo de cada chamada).

## Non-goals

- Seleção por função ou por etapa do pipeline (são cerca de 30 skills; o papel é a unidade de decisão).
- Digitar o nome de um modelo livremente: sem preço o custo fica cego, e o servidor não aceita modelo fora da lista.
- Modelos de raciocínio (o-series, gpt-5) e outras famílias com parâmetros diferentes (`max_completion_tokens`, sem `temperature`). Entram numa change própria, junto da adaptação de `chamarOpenAI`.
- Cadastrar preços novos além dos que já existem (`gpt-4o`, `gpt-4o-mini`); acrescentar um modelo à lista é editar os dois JSONs.
- Preferência global entre projetos: a escolha vale por projeto; o padrão da instalação continua sendo o `.env` e os perfis.
- Nenhuma dependência npm nova; nenhuma operação assíncrona nova (a tela usa o `GET/POST /api/orcamento` existente).

## Capabilities

### New Capabilities
- `model-selection`: escolha do modelo por papel na tela, guardada por projeto, com lista permitida validada no servidor e precedência única de resolução.

### Modified Capabilities
- `cost-profiles`: o roteamento de modelos por papel passa a considerar a escolha do usuário como a maior prioridade; o requisito "Modelo de pesquisa por perfil" deixa de afirmar que os perfis incluídos não têm `modeloPesquisa` (o Econômico usa `gpt-4o-mini`).
- `cost-budget`: `GET/POST /api/orcamento` expõem e aceitam a escolha de modelos, e o painel mostra os seletores.

## Impact

- `config/modelos.js` (`resolverModelo` e a nova resolução por papel), `orcamento.js` (`uso.modelosEscolhidos`, `ajustar`, `estado`, `modeloPara`, lista permitida), `server.js` (pontos que resolvem o modelo de pesquisa e de redação e a estimativa), `public/orcamento.js` e `public/index.html`/CSS do painel, `docs/governanca-de-custo.md`, `PROJECT.md`, `README.md` e testes (`orcamento`, `modelos-contexto`, integração com o mock da OpenAI).
- Capability nova: `model-selection`. Alteradas: `cost-profiles`, `cost-budget`.
